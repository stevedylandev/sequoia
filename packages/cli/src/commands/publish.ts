import * as fs from "fs/promises";
import { command, flag } from "cmd-ts";
import { select, spinner, log } from "@clack/prompts";
import * as path from "path";
import { loadConfig, loadState, saveState, findConfig } from "../lib/config";
import { loadCredentials, listCredentials, getCredentials } from "../lib/credentials";
import { createAgent, createDocument, updateDocument, uploadImage, resolveImagePath, createBlueskyPost, addBskyPostRefToDocument } from "../lib/atproto";
import {
  scanContentDirectory,
  getContentHash,
  updateFrontmatterWithAtUri,
} from "../lib/markdown";
import type { BlogPost, BlobObject, StrongRef } from "../lib/types";
import { exitOnCancel } from "../lib/prompts";

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
      log.error("No publisher.config.ts found. Run 'publisher init' first.");
      process.exit(1);
    }

    const config = await loadConfig(configPath);
    const configDir = path.dirname(configPath);

    log.info(`Site: ${config.siteUrl}`);
    log.info(`Content directory: ${config.contentDir}`);

    // Load credentials
    let credentials = await loadCredentials(config.identity);

    // If no credentials resolved, check if we need to prompt for identity selection
    if (!credentials) {
      const identities = await listCredentials();
      if (identities.length === 0) {
        log.error("No credentials found. Run 'sequoia auth' first.");
        log.info("Or set ATP_IDENTIFIER and ATP_APP_PASSWORD environment variables.");
        process.exit(1);
      }

      // Multiple identities exist but none selected - prompt user
      log.info("Multiple identities found. Select one to use:");
      const selected = exitOnCancel(await select({
        message: "Identity:",
        options: identities.map(id => ({ value: id, label: id })),
      }));

      credentials = await getCredentials(selected);
      if (!credentials) {
        log.error("Failed to load selected credentials.");
        process.exit(1);
      }

      log.info(`Tip: Add "identity": "${selected}" to sequoia.json to use this by default.`);
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
    const s = spinner();
    s.start("Scanning for posts...");
    const posts = await scanContentDirectory(contentDir, config.frontmatter, config.ignore);
    s.stop(`Found ${posts.length} posts`);

    // Determine which posts need publishing
    const postsToPublish: Array<{
      post: BlogPost;
      action: "create" | "update";
      reason: string;
    }> = [];
    const draftPosts: BlogPost[] = [];

    for (const post of posts) {
      // Skip draft posts
      if (post.frontmatter.draft) {
        draftPosts.push(post);
        continue;
      }

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

    if (draftPosts.length > 0) {
      log.info(`Skipping ${draftPosts.length} draft post${draftPosts.length === 1 ? "" : "s"}`);
    }

    if (postsToPublish.length === 0) {
      log.success("All posts are up to date. Nothing to publish.");
      return;
    }

    log.info(`\n${postsToPublish.length} posts to publish:\n`);

    // Bluesky posting configuration
    const blueskyEnabled = config.bluesky?.enabled ?? false;
    const maxAgeDays = config.bluesky?.maxAgeDays ?? 7;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    for (const { post, action, reason } of postsToPublish) {
      const icon = action === "create" ? "+" : "~";
      const relativeFilePath = path.relative(configDir, post.filePath);
      const existingBskyPostRef = state.posts[relativeFilePath]?.bskyPostRef;

      let bskyNote = "";
      if (blueskyEnabled) {
        if (existingBskyPostRef) {
          bskyNote = " [bsky: exists]";
        } else {
          const publishDate = new Date(post.frontmatter.publishDate);
          if (publishDate < cutoffDate) {
            bskyNote = ` [bsky: skipped, older than ${maxAgeDays} days]`;
          } else {
            bskyNote = " [bsky: will post]";
          }
        }
      }

      log.message(`  ${icon} ${post.frontmatter.title} (${reason})${bskyNote}`);
    }

    if (dryRun) {
      if (blueskyEnabled) {
        log.info(`\nBluesky posting: enabled (max age: ${maxAgeDays} days)`);
      }
      log.info("\nDry run complete. No changes made.");
      return;
    }

    // Create agent
    s.start(`Connecting to ${credentials.pdsUrl}...`);
    let agent;
    try {
      agent = await createAgent(credentials);
      s.stop(`Logged in as ${agent.session?.handle}`);
    } catch (error) {
      s.stop("Failed to login");
      log.error(`Failed to login: ${error}`);
      process.exit(1);
    }

    // Publish posts
    let publishedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;
    let bskyPostCount = 0;

    for (const { post, action } of postsToPublish) {
      s.start(`Publishing: ${post.frontmatter.title}`);

      try {
        // Handle cover image upload
        let coverImage: BlobObject | undefined;
        if (post.frontmatter.ogImage) {
          const imagePath = await resolveImagePath(
            post.frontmatter.ogImage,
            imagesDir,
            contentDir
          );

          if (imagePath) {
            log.info(`  Uploading cover image: ${path.basename(imagePath)}`);
            coverImage = await uploadImage(agent, imagePath);
            if (coverImage) {
              log.info(`  Uploaded image blob: ${coverImage.ref.$link}`);
            }
          } else {
            log.warn(`  Cover image not found: ${post.frontmatter.ogImage}`);
          }
        }

        // Track atUri, content for state saving, and bskyPostRef
        let atUri: string;
        let contentForHash: string;
        let bskyPostRef: StrongRef | undefined;
        const relativeFilePath = path.relative(configDir, post.filePath);

        // Check if bskyPostRef already exists in state
        const existingBskyPostRef = state.posts[relativeFilePath]?.bskyPostRef;

        if (action === "create") {
          atUri = await createDocument(agent, post, config, coverImage);
          s.stop(`Created: ${atUri}`);

          // Update frontmatter with atUri
          const updatedContent = updateFrontmatterWithAtUri(post.rawContent, atUri);
          await fs.writeFile(post.filePath, updatedContent);
          log.info(`  Updated frontmatter in ${path.basename(post.filePath)}`);

          // Use updated content (with atUri) for hash so next run sees matching hash
          contentForHash = updatedContent;
          publishedCount++;
        } else {
          atUri = post.frontmatter.atUri!;
          await updateDocument(agent, post, atUri, config, coverImage);
          s.stop(`Updated: ${atUri}`);

          // For updates, rawContent already has atUri
          contentForHash = post.rawContent;
          updatedCount++;
        }

        // Create Bluesky post if enabled and conditions are met
        if (blueskyEnabled) {
          if (existingBskyPostRef) {
            log.info(`  Bluesky post already exists, skipping`);
            bskyPostRef = existingBskyPostRef;
          } else {
            const publishDate = new Date(post.frontmatter.publishDate);

            if (publishDate < cutoffDate) {
              log.info(`  Post is older than ${maxAgeDays} days, skipping Bluesky post`);
            } else {
              // Create Bluesky post
              try {
                const pathPrefix = config.pathPrefix || "/posts";
                const canonicalUrl = `${config.siteUrl}${pathPrefix}/${post.slug}`;

                bskyPostRef = await createBlueskyPost(agent, {
                  title: post.frontmatter.title,
                  description: post.frontmatter.description,
                  canonicalUrl,
                  coverImage,
                  publishedAt: post.frontmatter.publishDate,
                });

                // Update document record with bskyPostRef
                await addBskyPostRefToDocument(agent, atUri, bskyPostRef);
                log.info(`  Created Bluesky post: ${bskyPostRef.uri}`);
                bskyPostCount++;
              } catch (bskyError) {
                const errorMsg = bskyError instanceof Error ? bskyError.message : String(bskyError);
                log.warn(`  Failed to create Bluesky post: ${errorMsg}`);
              }
            }
          }
        }

        // Update state (use relative path from config directory)
        const contentHash = await getContentHash(contentForHash);
        state.posts[relativeFilePath] = {
          contentHash,
          atUri,
          lastPublished: new Date().toISOString(),
          bskyPostRef,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        s.stop(`Error publishing "${path.basename(post.filePath)}"`);
        log.error(`  ${errorMessage}`);
        errorCount++;
      }
    }

    // Save state
    await saveState(configDir, state);

    // Summary
    log.message("\n---");
    log.info(`Published: ${publishedCount}`);
    log.info(`Updated: ${updatedCount}`);
    if (bskyPostCount > 0) {
      log.info(`Bluesky posts: ${bskyPostCount}`);
    }
    if (errorCount > 0) {
      log.warn(`Errors: ${errorCount}`);
    }
  },
});
