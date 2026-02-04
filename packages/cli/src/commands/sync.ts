import * as fs from "node:fs/promises";
import { command, flag } from "cmd-ts";
import { select, spinner, log } from "@clack/prompts";
import * as path from "node:path";
import { loadConfig, loadState, saveState, findConfig } from "../lib/config";
import {
	loadCredentials,
	listAllCredentials,
	getCredentials,
} from "../lib/credentials";
import { getOAuthHandle, getOAuthSession } from "../lib/oauth-store";
import { createAgent, listDocuments } from "../lib/atproto";
import {
	scanContentDirectory,
	getContentHash,
	updateFrontmatterWithAtUri,
} from "../lib/markdown";
import { exitOnCancel } from "../lib/prompts";

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
			log.error("No sequoia.json found. Run 'sequoia init' first.");
			process.exit(1);
		}

		const config = await loadConfig(configPath);
		const configDir = path.dirname(configPath);

		log.info(`Site: ${config.siteUrl}`);
		log.info(`Publication: ${config.publicationUri}`);

		// Load credentials
		let credentials = await loadCredentials(config.identity);

		if (!credentials) {
			const identities = await listAllCredentials();
			if (identities.length === 0) {
				log.error(
					"No credentials found. Run 'sequoia login' or 'sequoia auth' first.",
				);
				process.exit(1);
			}

			// Build labels with handles for OAuth sessions
			const options = await Promise.all(
				identities.map(async (cred) => {
					if (cred.type === "oauth") {
						const handle = await getOAuthHandle(cred.id);
						return {
							value: cred.id,
							label: `${handle || cred.id} (OAuth)`,
						};
					}
					return {
						value: cred.id,
						label: `${cred.id} (App Password)`,
					};
				}),
			);

			log.info("Multiple identities found. Select one to use:");
			const selected = exitOnCancel(
				await select({
					message: "Identity:",
					options,
				}),
			);

			// Load the selected credentials
			const selectedCred = identities.find((c) => c.id === selected);
			if (selectedCred?.type === "oauth") {
				const session = await getOAuthSession(selected);
				if (session) {
					const handle = await getOAuthHandle(selected);
					credentials = {
						type: "oauth",
						did: selected,
						handle: handle || selected,
						pdsUrl: "https://bsky.social",
					};
				}
			} else {
				credentials = await getCredentials(selected);
			}

			if (!credentials) {
				log.error("Failed to load selected credentials.");
				process.exit(1);
			}
		}

		// Create agent
		const s = spinner();
		s.start(`Connecting to ${credentials.pdsUrl}...`);
		let agent: Awaited<ReturnType<typeof createAgent>> | undefined;
		try {
			agent = await createAgent(credentials);
			s.stop(`Logged in as ${agent.did}`);
		} catch (error) {
			s.stop("Failed to login");
			log.error(`Failed to login: ${error}`);
			process.exit(1);
		}

		// Fetch documents from PDS
		s.start("Fetching documents from PDS...");
		const documents = await listDocuments(agent, config.publicationUri);
		s.stop(`Found ${documents.length} documents on PDS`);

		if (documents.length === 0) {
			log.info("No documents found for this publication.");
			return;
		}

		// Resolve content directory
		const contentDir = path.isAbsolute(config.contentDir)
			? config.contentDir
			: path.join(configDir, config.contentDir);

		// Scan local posts
		s.start("Scanning local content...");
		const localPosts = await scanContentDirectory(contentDir, {
			frontmatterMapping: config.frontmatter,
			ignorePatterns: config.ignore,
			slugField: config.frontmatter?.slugField,
			removeIndexFromSlug: config.removeIndexFromSlug,
			stripDatePrefix: config.stripDatePrefix,
		});
		s.stop(`Found ${localPosts.length} local posts`);

		// Build a map of path -> local post for matching
		// Document path is like /posts/my-post-slug (or custom pathPrefix)
		const pathPrefix = config.pathPrefix || "/posts";
		const postsByPath = new Map<string, (typeof localPosts)[0]>();
		for (const post of localPosts) {
			const postPath = `${pathPrefix}/${post.slug}`;
			postsByPath.set(postPath, post);
		}

		// Load existing state
		const state = await loadState(configDir);
		const originalPostCount = Object.keys(state.posts).length;

		// Track changes
		let matchedCount = 0;
		let unmatchedCount = 0;
		const frontmatterUpdates: Array<{ filePath: string; atUri: string }> = [];

		log.message("\nMatching documents to local files:\n");

		for (const doc of documents) {
			const docPath = doc.value.path;
			const localPost = postsByPath.get(docPath);

			if (localPost) {
				matchedCount++;
				log.message(`  ✓ ${doc.value.title}`);
				log.message(`    Path: ${docPath}`);
				log.message(`    URI: ${doc.uri}`);
				log.message(`    File: ${path.basename(localPost.filePath)}`);

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
					log.message(`    → Will update frontmatter`);
				}
			} else {
				unmatchedCount++;
				log.message(`  ✗ ${doc.value.title} (no matching local file)`);
				log.message(`    Path: ${docPath}`);
				log.message(`    URI: ${doc.uri}`);
			}
			log.message("");
		}

		// Summary
		log.message("---");
		log.info(`Matched: ${matchedCount} documents`);
		if (unmatchedCount > 0) {
			log.warn(
				`Unmatched: ${unmatchedCount} documents (exist on PDS but not locally)`,
			);
		}

		if (dryRun) {
			log.info("\nDry run complete. No changes made.");
			return;
		}

		// Save updated state
		await saveState(configDir, state);
		const newPostCount = Object.keys(state.posts).length;
		log.success(
			`\nSaved .sequoia-state.json (${originalPostCount} → ${newPostCount} entries)`,
		);

		// Update frontmatter if requested
		if (frontmatterUpdates.length > 0) {
			s.start(`Updating frontmatter in ${frontmatterUpdates.length} files...`);
			for (const { filePath, atUri } of frontmatterUpdates) {
				const content = await fs.readFile(filePath, "utf-8");
				const updated = updateFrontmatterWithAtUri(content, atUri);
				await fs.writeFile(filePath, updated);
				log.message(`  Updated: ${path.basename(filePath)}`);
			}
			s.stop("Frontmatter updated");
		}

		log.success("\nSync complete!");
	},
});
