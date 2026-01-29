#!/usr/bin/env bun

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = "./docs/dist";
const ogImageUrl = "https://sequoia.pub/og.png";

// Function to recursively find all HTML files
function findHtmlFiles(dir: string): string[] {
	const files: string[] = [];
	const entries = readdirSync(dir);

	for (const entry of entries) {
		const fullPath = join(dir, entry);
		const stat = statSync(fullPath);

		if (stat.isDirectory()) {
			files.push(...findHtmlFiles(fullPath));
		} else if (entry.endsWith(".html")) {
			files.push(fullPath);
		}
	}

	return files;
}

// Function to inject OG image meta tags
async function injectOgImageTags(filePath: string) {
	const file = Bun.file(filePath);
	let content = await file.text();

	// Check if og:image already exists
	if (content.includes('property="og:image"')) {
		console.log(`⏭️  Skipping ${filePath} - og:image already exists`);
		return;
	}

	// Find the position to inject the meta tag
	// We'll insert it after og:description if it exists, or before twitter:card
	const ogDescriptionMatch = content.match(
		/<meta property="og:description"[^>]*>/,
	);
	const twitterCardMatch = content.match(/<meta name="twitter:card"[^>]*>/);

	let insertPosition: number;
	if (ogDescriptionMatch && ogDescriptionMatch.index !== undefined) {
		insertPosition = ogDescriptionMatch.index + ogDescriptionMatch[0].length;
	} else if (twitterCardMatch && twitterCardMatch.index !== undefined) {
		insertPosition = twitterCardMatch.index;
	} else {
		// Fallback: insert before </head>
		const headCloseMatch = content.indexOf("</head>");
		if (headCloseMatch === -1) {
			console.log(`⚠️  Warning: Could not find insertion point in ${filePath}`);
			return;
		}
		insertPosition = headCloseMatch;
	}

	// Inject the og:image and twitter:image meta tags
	const ogImageTag = `<meta property="og:image" content="${ogImageUrl}"/>`;
	const twitterImageTag = `<meta name="twitter:image" content="${ogImageUrl}"/>`;
	const newContent =
		content.slice(0, insertPosition) +
		ogImageTag +
		twitterImageTag +
		content.slice(insertPosition);

	// Write the modified content back to the file
	await Bun.write(filePath, newContent);
	console.log(`✅ Injected og:image tags into ${filePath}`);
}

// Main execution
async function main() {
	console.log("🔍 Finding HTML files in dist directory...");
	const htmlFiles = findHtmlFiles(distDir);
	console.log(`📄 Found ${htmlFiles.length} HTML files`);

	for (const file of htmlFiles) {
		await injectOgImageTags(file);
	}

	console.log("\n✨ Done! All HTML files have been processed.");
}

main();
