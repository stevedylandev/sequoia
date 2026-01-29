import { command, flag } from "cmd-ts";
import { consola } from "consola";
import * as path from "path";
import { loadConfig, loadState, saveState, findConfig } from "../lib/config";
import { loadCredentials, listCredentials, getCredentials } from "../lib/credentials";
import { createAgent, createDocument, updateDocument, uploadImage, resolveImagePath } from "../lib/atproto";
import {
  scanContentDirectory,
  getContentHash,
  updateFrontmatterWithAtUri,
} from "../lib/markdown";
import type { BlogPost, BlobObject } from "../lib/types";

export const publishCommand = command({
  name: "publish",
  description: "Publish content to ATProto",
  args: {
    force: flag({
      long: "force",
      short: "f",
      description: "Force publish all posts, ignoring change detection",
    }),
    dryRun: flag({
      long: "dry-run",
      short: "n",
      description: "Preview what would be published without making changes",
    }),
  },
  handler: async ({ force, dryRun }) => {
    // Load config
    const configPath = await findConfig();
    if (!configPath) {
      consola.error("No publisher.config.ts found. Run 'publisher init' first.");
      process.exit(1);
    }

    const config = await loadConfig(configPath);
    const configDir = path.dirname(configPath);

    consola.info(`Site: ${config.siteUrl}`);
    consola.info(`Content directory: ${config.contentDir}`);

    // Load credentials
    let credentials = await loadCredentials(config.identity);

    // If no credentials resolved, check if we need to prompt for identity selection
    if (!credentials) {
      const identities = await listCredentials();
      if (identities.length === 0) {
        consola.error("No credentials found. Run 'sequoia auth' first.");
        consola.info("Or set ATP_IDENTIFIER and ATP_APP_PASSWORD environment variables.");
        process.exit(1);
      }

      // Multiple identities exist but none selected - prompt user
      consola.info("Multiple identities found. Select one to use:");
      const selected = await consola.prompt("Identity:", {
        type: "select",
        options: identities,
      });

      credentials = await getCredentials(selected as string);
      if (!credentials) {
        consola.error("Failed to load selected credentials.");
        process.exit(1);
      }

      consola.info(`Tip: Add "identity": "${selected}" to sequoia.json to use this by default.`);
    }

    // Resolve content directory
    const contentDir = path.isAbsolute(config.contentDir)
      ? config.contentDir
      : path.join(configDir, config.contentDir);

    const imagesDir = config.imagesDir
      ? path.isAbsolute(config.imagesDir)
        ? config.imagesDir
        : path.join(configDir, config.imagesDir)
      : undefined;

    // Load state
    const state = await loadState(configDir);

    // Scan for posts
    consola.start("Scanning for posts...");
    const posts = await scanContentDirectory(contentDir, config.frontmatter, config.ignore);
    consola.info(`Found ${posts.length} posts`);

    // Determine which posts need publishing
    const postsToPublish: Array<{
      post: BlogPost;
      action: "create" | "update";
      reason: string;
    }> = [];

    for (const post of posts) {
      const contentHash = await getContentHash(post.rawContent);
      const relativeFilePath = path.relative(configDir, post.filePath);
      const postState = state.posts[relativeFilePath];

      if (force) {
        postsToPublish.push({
          post,
          action: post.frontmatter.atUri ? "update" : "create",
          reason: "forced",
        });
      } else if (!postState) {
        // New post
        postsToPublish.push({
          post,
          action: "create",
          reason: "new post",
        });
      } else if (postState.contentHash !== contentHash) {
        // Changed post
        postsToPublish.push({
          post,
          action: post.frontmatter.atUri ? "update" : "create",
          reason: "content changed",
        });
      }
    }

    if (postsToPublish.length === 0) {
      consola.success("All posts are up to date. Nothing to publish.");
      return;
    }

    consola.info(`\n${postsToPublish.length} posts to publish:\n`);
    for (const { post, action, reason } of postsToPublish) {
      const icon = action === "create" ? "+" : "~";
      consola.log(`  ${icon} ${post.frontmatter.title} (${reason})`);
    }

    if (dryRun) {
      consola.info("\nDry run complete. No changes made.");
      return;
    }

    // Create agent
    consola.start(`\nConnecting to ${credentials.pdsUrl}...`);
    let agent;
    try {
      agent = await createAgent(credentials);
      consola.success(`Logged in as ${agent.session?.handle}`);
    } catch (error) {
      consola.error("Failed to login:", error);
      process.exit(1);
    }

    // Publish posts
    let publishedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    for (const { post, action } of postsToPublish) {
      consola.start(`Publishing: ${post.frontmatter.title}`);

      try {
        // Handle cover image upload
        let coverImage: BlobObject | undefined;
        if (post.frontmatter.ogImage) {
          const imagePath = resolveImagePath(
            post.frontmatter.ogImage,
            imagesDir,
            contentDir
          );

          if (imagePath) {
            consola.info(`  Uploading cover image: ${path.basename(imagePath)}`);
            coverImage = await uploadImage(agent, imagePath);
            if (coverImage) {
              consola.info(`  Uploaded image blob: ${coverImage.ref.$link}`);
            }
          } else {
            consola.warn(`  Cover image not found: ${post.frontmatter.ogImage}`);
          }
        }

        // Track atUri and content for state saving
        let atUri: string;
        let contentForHash: string;

        if (action === "create") {
          atUri = await createDocument(agent, post, config, coverImage);
          consola.success(`  Created: ${atUri}`);

          // Update frontmatter with atUri
          const updatedContent = updateFrontmatterWithAtUri(post.rawContent, atUri);
          await Bun.write(post.filePath, updatedContent);
          consola.info(`  Updated frontmatter in ${path.basename(post.filePath)}`);

          // Use updated content (with atUri) for hash so next run sees matching hash
          contentForHash = updatedContent;
          publishedCount++;
        } else {
          atUri = post.frontmatter.atUri!;
          await updateDocument(agent, post, atUri, config, coverImage);
          consola.success(`  Updated: ${atUri}`);

          // For updates, rawContent already has atUri
          contentForHash = post.rawContent;
          updatedCount++;
        }

        // Update state (use relative path from config directory)
        const contentHash = await getContentHash(contentForHash);
        const relativeFilePath = path.relative(configDir, post.filePath);
        state.posts[relativeFilePath] = {
          contentHash,
          atUri,
          lastPublished: new Date().toISOString(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        consola.error(`  Error publishing "${path.basename(post.filePath)}": ${errorMessage}`);
        errorCount++;
      }
    }

    // Save state
    await saveState(configDir, state);

    // Summary
    consola.log("\n---");
    consola.info(`Published: ${publishedCount}`);
    consola.info(`Updated: ${updatedCount}`);
    if (errorCount > 0) {
      consola.warn(`Errors: ${errorCount}`);
    }
  },
});
