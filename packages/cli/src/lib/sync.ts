import * as fs from "node:fs/promises";
import * as path from "node:path";
import { log } from "@clack/prompts";
import { listDocuments, type createAgent } from "./atproto";
import { loadState, saveState } from "./config";
import {
	scanContentDirectory,
	getContentHash,
	updateFrontmatterWithAtUri,
	resolvePostPath,
} from "./markdown";
import type { PublisherConfig, PublisherState } from "./types";

export interface SyncOptions {
	updateFrontmatter?: boolean;
	dryRun?: boolean;
	quiet?: boolean;
}

export interface SyncResult {
	state: PublisherState;
	matchedCount: number;
	unmatchedCount: number;
	frontmatterUpdatesApplied: number;
}

/**
 * Core sync logic: fetches documents from PDS and matches them to local files,
 * updating state and optionally frontmatter.
 *
 * Used by both the `sync` command and auto-sync before `publish`.
 */
export async function syncStateFromPDS(
	agent: Awaited<ReturnType<typeof createAgent>>,
	config: PublisherConfig,
	configDir: string,
	options: SyncOptions = {},
): Promise<SyncResult> {
	const { updateFrontmatter = false, dryRun = false, quiet = false } = options;

	// Fetch documents from PDS (filtered by publicationUri for multi-publication safety)
	const documents = await listDocuments(agent, config.publicationUri);

	if (documents.length === 0) {
		if (!quiet) {
			log.info("No documents found for this publication.");
		}
		return {
			state: await loadState(configDir),
			matchedCount: 0,
			unmatchedCount: 0,
			frontmatterUpdatesApplied: 0,
		};
	}

	// Resolve content directory
	const contentDir = path.isAbsolute(config.contentDir)
		? config.contentDir
		: path.join(configDir, config.contentDir);

	// Scan local posts
	const localPosts = await scanContentDirectory(contentDir, {
		frontmatterMapping: config.frontmatter,
		ignorePatterns: config.ignore,
		slugField: config.frontmatter?.slugField,
		removeIndexFromSlug: config.removeIndexFromSlug,
		stripDatePrefix: config.stripDatePrefix,
	});

	// Build a map of path -> local post for matching
	const postsByPath = new Map<string, (typeof localPosts)[0]>();
	for (const post of localPosts) {
		const postPath = resolvePostPath(
			post,
			config.pathPrefix,
			config.pathTemplate,
		);
		postsByPath.set(postPath, post);
	}

	// Load existing state
	const state = await loadState(configDir);

	// Track changes
	let matchedCount = 0;
	let unmatchedCount = 0;
	let frontmatterUpdatesApplied = 0;
	const frontmatterUpdates: Array<{
		filePath: string;
		atUri: string;
		relativeFilePath: string;
	}> = [];

	if (!quiet) {
		log.message("\nMatching documents to local files:\n");
	}

	for (const doc of documents) {
		const docPath = doc.value.path;
		const localPost = postsByPath.get(docPath);

		if (localPost) {
			matchedCount++;
			const relativeFilePath = path.relative(configDir, localPost.filePath);

			if (!quiet) {
				log.message(`  ✓ ${doc.value.title}`);
				log.message(`    Path: ${docPath}`);
				log.message(`    URI: ${doc.uri}`);
				log.message(`    File: ${path.basename(localPost.filePath)}`);
			}

			// Check if frontmatter needs updating
			const needsFrontmatterUpdate =
				updateFrontmatter && localPost.frontmatter.atUri !== doc.uri;

			if (needsFrontmatterUpdate) {
				frontmatterUpdates.push({
					filePath: localPost.filePath,
					atUri: doc.uri,
					relativeFilePath,
				});
				if (!quiet) {
					log.message(`    → Will update frontmatter`);
				}
			}

			// Compute content hash — if we're updating frontmatter, hash the updated content
			// so the state matches what will be on disk after the update
			let contentHash: string;
			if (needsFrontmatterUpdate) {
				const updatedContent = updateFrontmatterWithAtUri(
					localPost.rawContent,
					doc.uri,
				);
				contentHash = await getContentHash(updatedContent);
			} else {
				contentHash = await getContentHash(localPost.rawContent);
			}

			// Update state
			state.posts[relativeFilePath] = {
				contentHash,
				atUri: doc.uri,
				lastPublished: doc.value.publishedAt,
			};
		} else {
			unmatchedCount++;
			if (!quiet) {
				log.message(`  ✗ ${doc.value.title} (no matching local file)`);
				log.message(`    Path: ${docPath}`);
				log.message(`    URI: ${doc.uri}`);
			}
		}
		if (!quiet) {
			log.message("");
		}
	}

	// Summary (always show, even in quiet mode)
	if (!quiet) {
		log.message("---");
		log.info(`Matched: ${matchedCount} documents`);
		if (unmatchedCount > 0) {
			log.warn(
				`Unmatched: ${unmatchedCount} documents (exist on PDS but not locally)`,
			);
		}
	}

	if (dryRun) {
		if (!quiet) {
			log.info("\nDry run complete. No changes made.");
		}
		return {
			state,
			matchedCount,
			unmatchedCount,
			frontmatterUpdatesApplied: 0,
		};
	}

	// Save updated state
	await saveState(configDir, state);

	// Update frontmatter files
	if (frontmatterUpdates.length > 0) {
		for (const { filePath, atUri } of frontmatterUpdates) {
			const content = await fs.readFile(filePath, "utf-8");
			const updated = updateFrontmatterWithAtUri(content, atUri);
			await fs.writeFile(filePath, updated);
			if (!quiet) {
				log.message(`  Updated: ${path.basename(filePath)}`);
			}
		}
		frontmatterUpdatesApplied = frontmatterUpdates.length;
	}

	return { state, matchedCount, unmatchedCount, frontmatterUpdatesApplied };
}
