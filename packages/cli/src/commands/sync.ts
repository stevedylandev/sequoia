import { command, flag } from "cmd-ts";
import { consola } from "consola";
import * as path from "path";
import { loadConfig, loadState, saveState, findConfig } from "../lib/config";
import { loadCredentials, listCredentials, getCredentials } from "../lib/credentials";
import { createAgent, listDocuments } from "../lib/atproto";
import { scanContentDirectory, getContentHash, updateFrontmatterWithAtUri } from "../lib/markdown";

export const syncCommand = command({
  name: "sync",
  description: "Sync state from ATProto to restore .sequoia-state.json",
  args: {
    updateFrontmatter: flag({
      long: "update-frontmatter",
      short: "u",
      description: "Update frontmatter atUri fields in local markdown files",
    }),
    dryRun: flag({
      long: "dry-run",
      short: "n",
      description: "Preview what would be synced without making changes",
    }),
  },
  handler: async ({ updateFrontmatter, dryRun }) => {
    // Load config
    const configPath = await findConfig();
    if (!configPath) {
      consola.error("No sequoia.json found. Run 'sequoia init' first.");
      process.exit(1);
    }

    const config = await loadConfig(configPath);
    const configDir = path.dirname(configPath);

    consola.info(`Site: ${config.siteUrl}`);
    consola.info(`Publication: ${config.publicationUri}`);

    // Load credentials
    let credentials = await loadCredentials(config.identity);

    if (!credentials) {
      const identities = await listCredentials();
      if (identities.length === 0) {
        consola.error("No credentials found. Run 'sequoia auth' first.");
        process.exit(1);
      }

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
    }

    // Create agent
    consola.start(`Connecting to ${credentials.pdsUrl}...`);
    let agent;
    try {
      agent = await createAgent(credentials);
      consola.success(`Logged in as ${agent.session?.handle}`);
    } catch (error) {
      consola.error("Failed to login:", error);
      process.exit(1);
    }

    // Fetch documents from PDS
    consola.start("Fetching documents from PDS...");
    const documents = await listDocuments(agent, config.publicationUri);
    consola.info(`Found ${documents.length} documents on PDS`);

    if (documents.length === 0) {
      consola.info("No documents found for this publication.");
      return;
    }

    // Resolve content directory
    const contentDir = path.isAbsolute(config.contentDir)
      ? config.contentDir
      : path.join(configDir, config.contentDir);

    // Scan local posts
    consola.start("Scanning local content...");
    const localPosts = await scanContentDirectory(contentDir, config.include, config.exclude, config.frontmatter);
    consola.info(`Found ${localPosts.length} local posts`);

    // Build a map of path -> local post for matching
    // Document path is like /posts/my-post-slug
    const postsByPath = new Map<string, typeof localPosts[0]>();
    for (const post of localPosts) {
      const postPath = `/posts/${post.slug}`;
      postsByPath.set(postPath, post);
    }

    // Load existing state
    const state = await loadState(configDir);
    const originalPostCount = Object.keys(state.posts).length;

    // Track changes
    let matchedCount = 0;
    let unmatchedCount = 0;
    let frontmatterUpdates: Array<{ filePath: string; atUri: string }> = [];

    consola.log("\nMatching documents to local files:\n");

    for (const doc of documents) {
      const docPath = doc.value.path;
      const localPost = postsByPath.get(docPath);

      if (localPost) {
        matchedCount++;
        consola.log(`  ✓ ${doc.value.title}`);
        consola.log(`    Path: ${docPath}`);
        consola.log(`    URI: ${doc.uri}`);
        consola.log(`    File: ${path.basename(localPost.filePath)}`);

        // Update state (use relative path from config directory)
        const contentHash = await getContentHash(localPost.rawContent);
        const relativeFilePath = path.relative(configDir, localPost.filePath);
        state.posts[relativeFilePath] = {
          contentHash,
          atUri: doc.uri,
          lastPublished: doc.value.publishedAt,
        };

        // Check if frontmatter needs updating
        if (updateFrontmatter && localPost.frontmatter.atUri !== doc.uri) {
          frontmatterUpdates.push({
            filePath: localPost.filePath,
            atUri: doc.uri,
          });
          consola.log(`    → Will update frontmatter`);
        }
      } else {
        unmatchedCount++;
        consola.log(`  ✗ ${doc.value.title} (no matching local file)`);
        consola.log(`    Path: ${docPath}`);
        consola.log(`    URI: ${doc.uri}`);
      }
      consola.log("");
    }

    // Summary
    consola.log("---");
    consola.info(`Matched: ${matchedCount} documents`);
    if (unmatchedCount > 0) {
      consola.warn(`Unmatched: ${unmatchedCount} documents (exist on PDS but not locally)`);
    }

    if (dryRun) {
      consola.info("\nDry run complete. No changes made.");
      return;
    }

    // Save updated state
    await saveState(configDir, state);
    const newPostCount = Object.keys(state.posts).length;
    consola.success(`\nSaved .sequoia-state.json (${originalPostCount} → ${newPostCount} entries)`);

    // Update frontmatter if requested
    if (frontmatterUpdates.length > 0) {
      consola.start(`Updating frontmatter in ${frontmatterUpdates.length} files...`);
      for (const { filePath, atUri } of frontmatterUpdates) {
        const file = Bun.file(filePath);
        const content = await file.text();
        const updated = updateFrontmatterWithAtUri(content, atUri);
        await Bun.write(filePath, updated);
        consola.log(`  Updated: ${path.basename(filePath)}`);
      }
      consola.success("Frontmatter updated");
    }

    consola.success("\nSync complete!");
  },
});
