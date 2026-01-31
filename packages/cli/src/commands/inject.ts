import * as fs from "fs/promises";
import { command, flag, option, optional, string } from "cmd-ts";
import { log } from "@clack/prompts";
import * as path from "path";
import { glob } from "glob";
import { loadConfig, loadState, findConfig } from "../lib/config";

export const injectCommand = command({
	name: "inject",
	description:
		"Inject site.standard.document link tags into built HTML files",
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

		// Generic filenames where the slug is the parent directory, not the filename
		// Covers: SvelteKit (+page), Astro/Hugo (index), Next.js (page), etc.
		const genericFilenames = new Set([
			"+page",
			"index",
			"_index",
			"page",
			"readme",
		]);

		// Build a map of slug/path to atUri from state
		const pathToAtUri = new Map<string, string>();
		for (const [filePath, postState] of Object.entries(state.posts)) {
			if (postState.atUri) {
				// Extract slug from file path (e.g., ./content/blog/my-post.md -> my-post)
				let basename = path.basename(filePath, path.extname(filePath));

				// If the filename is a generic convention name, use the parent directory as slug
				if (genericFilenames.has(basename.toLowerCase())) {
					// Split path and filter out route groups like (blog-article)
					const pathParts = filePath
						.split(/[/\\]/)
						.filter((p) => p && !(p.startsWith("(") && p.endsWith(")")));
					// The slug should be the second-to-last part (last is the filename)
					if (pathParts.length >= 2) {
						const slug = pathParts[pathParts.length - 2];
						if (slug && slug !== "." && slug !== "content" && slug !== "routes" && slug !== "src") {
							basename = slug;
						}
					}
				}

				pathToAtUri.set(basename, postState.atUri);

				// Also add variations that might match HTML file paths
				// e.g., /blog/my-post, /posts/my-post, my-post/index
				const dirName = path.basename(path.dirname(filePath));
				// Skip route groups and common directory names
				if (dirName !== "." && dirName !== "content" && !(dirName.startsWith("(") && dirName.endsWith(")"))) {
					pathToAtUri.set(`${dirName}/${basename}`, postState.atUri);
				}
			}
		}

		if (pathToAtUri.size === 0) {
			log.warn(
				"No published posts found in state. Run 'sequoia publish' first.",
			);
			return;
		}

		log.info(`Found ${pathToAtUri.size} published posts in state`);

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
			atUri = pathToAtUri.get(htmlBasename);

			// Strategy 2: Directory name for index.html (e.g., my-post/index.html -> my-post)
			if (!atUri && htmlBasename === "index" && htmlDir !== ".") {
				const slug = path.basename(htmlDir);
				atUri = pathToAtUri.get(slug);

				// Also try parent/slug pattern
				if (!atUri) {
					const parentDir = path.dirname(htmlDir);
					if (parentDir !== ".") {
						atUri = pathToAtUri.get(`${path.basename(parentDir)}/${slug}`);
					}
				}
			}

			// Strategy 3: Full path match (e.g., blog/my-post.html -> blog/my-post)
			if (!atUri && htmlDir !== ".") {
				atUri = pathToAtUri.get(`${htmlDir}/${htmlBasename}`);
			}

			if (!atUri) {
				skippedCount++;
				continue;
			}

			// Read the HTML file
			let content = await fs.readFile(htmlPath, "utf-8");

			// Check if link tag already exists
			const linkTag = `<link rel="site.standard.document" href="${atUri}">`;
			if (content.includes('rel="site.standard.document"')) {
				alreadyHasCount++;
				continue;
			}

			// Find </head> and inject before it
			const headCloseIndex = content.indexOf("</head>");
			if (headCloseIndex === -1) {
				log.warn(`  No </head> found in ${relativePath}, skipping`);
				skippedCount++;
				continue;
			}

			if (dryRun) {
				log.message(`  Would inject into: ${relativePath}`);
				log.message(`    ${linkTag}`);
				injectedCount++;
				continue;
			}

			// Inject the link tag
			const indent = "  "; // Standard indentation
			content =
				content.slice(0, headCloseIndex) +
				`${indent}${linkTag}\n${indent}` +
				content.slice(headCloseIndex);

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
