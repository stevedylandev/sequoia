import { log } from "@clack/prompts";
import { command, flag, option, optional, string } from "cmd-ts";
import { glob } from "glob";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { findConfig, loadConfig, loadState } from "../lib/config";

export const injectCommand = command({
	name: "inject",
	description: "Inject site.standard.document link tags into built HTML files",
	args: {
		outputDir: option({
			long: "output",
			short: "o",
			description: "Output directory to scan for HTML files",
			type: optional(string),
		}),
		dryRun: flag({
			long: "dry-run",
			short: "n",
			description: "Preview what would be injected without making changes",
		}),
	},
	handler: async ({ outputDir: outputDirArg, dryRun }) => {
		// Load config
		const configPath = await findConfig();
		if (!configPath) {
			log.error("No sequoia.json found. Run 'sequoia init' first.");
			process.exit(1);
		}

		const config = await loadConfig(configPath);
		const configDir = path.dirname(configPath);

		// Determine output directory
		const outputDir = outputDirArg || config.outputDir || "./dist";
		const resolvedOutputDir = path.isAbsolute(outputDir)
			? outputDir
			: path.join(configDir, outputDir);

		log.info(`Scanning for HTML files in: ${resolvedOutputDir}`);

		// Load state to get atUri mappings
		const state = await loadState(configDir);

		// Build a map of slug to atUri from state
		// The slug is stored in state by the publish command, using the configured slug options
		const slugToAtUri = new Map<string, string>();
		for (const [filePath, postState] of Object.entries(state.posts)) {
			if (postState.atUri && postState.slug) {
				// Use the slug stored in state (computed by publish with config options)
				slugToAtUri.set(postState.slug, postState.atUri);

				// Also add the last segment for simpler matching
				// e.g., "other/my-other-post" -> also map "my-other-post"
				const lastSegment = postState.slug.split("/").pop();
				if (lastSegment && lastSegment !== postState.slug) {
					slugToAtUri.set(lastSegment, postState.atUri);
				}
			} else if (postState.atUri) {
				// Fallback for older state files without slug field
				// Extract slug from file path (e.g., ./content/blog/my-post.md -> my-post)
				const basename = path.basename(filePath, path.extname(filePath));
				slugToAtUri.set(basename.toLowerCase(), postState.atUri);
			}
		}

		if (slugToAtUri.size === 0) {
			log.warn(
				"No published posts found in state. Run 'sequoia publish' first.",
			);
			return;
		}

		log.info(`Found ${slugToAtUri.size} slug mappings from published posts`);

		// Scan for HTML files
		const htmlFiles = await glob("**/*.html", {
			cwd: resolvedOutputDir,
			absolute: false,
		});

		if (htmlFiles.length === 0) {
			log.warn(`No HTML files found in ${resolvedOutputDir}`);
			return;
		}

		log.info(`Found ${htmlFiles.length} HTML files`);

		let injectedCount = 0;
		let skippedCount = 0;
		let alreadyHasCount = 0;

		for (const file of htmlFiles) {
			const htmlPath = path.join(resolvedOutputDir, file);
			// Try to match this HTML file to a published post
			const relativePath = file;
			const htmlDir = path.dirname(relativePath);
			const htmlBasename = path.basename(relativePath, ".html");

			// Try different matching strategies
			let atUri: string | undefined;

			// Strategy 1: Direct basename match (e.g., my-post.html -> my-post)
			atUri = slugToAtUri.get(htmlBasename);

			// Strategy 2: For index.html, try the directory path
			// e.g., posts/40th-puzzle-box/what-a-gift/index.html -> 40th-puzzle-box/what-a-gift
			if (!atUri && htmlBasename === "index" && htmlDir !== ".") {
				// Try full directory path (for nested subdirectories)
				atUri = slugToAtUri.get(htmlDir);

				// Also try just the last directory segment
				if (!atUri) {
					const lastDir = path.basename(htmlDir);
					atUri = slugToAtUri.get(lastDir);
				}
			}

			// Strategy 3: Full path match (e.g., blog/my-post.html -> blog/my-post)
			if (!atUri && htmlDir !== ".") {
				atUri = slugToAtUri.get(`${htmlDir}/${htmlBasename}`);
			}

			if (!atUri) {
				skippedCount++;
				continue;
			}

			// Read the HTML file
			let content = await fs.readFile(htmlPath, "utf-8");

			// Inject the tags
			let injected = injectLinkTags(
				dryRun,
				relativePath,
				content,
				atUri,
				config.publicationUri,
			);
			switch (injected) {
				case Injected.AlreadyPresent:
					alreadyHasCount++;
					continue;
				case Injected.Skipped:
					skippedCount++;
					continue;
				case Injected.Faked:
					injectedCount++;
					continue;
				default:
					content = injected;
			}

			await fs.writeFile(htmlPath, content);
			log.success(`  Injected into: ${relativePath}`);
			injectedCount++;
		}

		// Summary
		log.message("\n---");
		if (dryRun) {
			log.info("Dry run complete. No changes made.");
		}
		log.info(`Injected: ${injectedCount}`);
		log.info(`Already has tag: ${alreadyHasCount}`);
		log.info(`Skipped (no match): ${skippedCount}`);

		if (skippedCount > 0 && !dryRun) {
			log.info(
				"\nTip: Skipped files had no matching published post. This is normal for non-post pages.",
			);
		}
	},
});

export enum Injected {
	AlreadyPresent = 0,
	Skipped,
	Faked,
}

export function injectLinkTags(
	dryRun: boolean,
	relativePath: string,
	content: string,
	atUri: string,
	publicationUri: string,
): string | Injected {
	// Check if link tags already exist
	let documentLinkTag: string | undefined =
		`<link rel="site.standard.document" href="${atUri}">`;
	let publicationLinkTag: string | undefined =
		`<link rel="site.standard.publication" href="${publicationUri}">`;
	if (content.includes('rel="site.standard.document"')) {
		documentLinkTag = undefined;
	}
	if (content.includes('rel="site.standard.publication"')) {
		publicationLinkTag = undefined;
	}

	if (!documentLinkTag && !publicationLinkTag) {
		return Injected.AlreadyPresent;
	}

	// Find </head> and inject before it
	const headCloseIndex = content.indexOf("</head>");
	if (headCloseIndex === -1) {
		log.warn(`  No </head> found in ${relativePath}, skipping`);
		return Injected.Skipped;
	}

	if (dryRun) {
		log.message(`  Would inject into: ${relativePath}`);
		if (documentLinkTag) {
			log.message(`    ${documentLinkTag}`);
		}
		if (publicationLinkTag) {
			log.message(`    ${publicationLinkTag}`);
		}
		return Injected.Faked;
	}

	// Inject the link tags
	const indent = "  "; // Standard indentation
	const after = content.slice(headCloseIndex);
	content = content.slice(0, headCloseIndex);
	if (documentLinkTag) {
		content += `${indent}${documentLinkTag}\n${indent}`;
	}
	if (publicationLinkTag) {
		content += `${indent}${publicationLinkTag}\n${indent}`;
	}
	content += after;

	return content;
}
