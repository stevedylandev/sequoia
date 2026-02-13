import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import { minimatch } from "minimatch";
import type { BlogPost, FrontmatterMapping, PostFrontmatter } from "./types";

export function parseFrontmatter(
	content: string,
	mapping?: FrontmatterMapping,
): {
	frontmatter: PostFrontmatter;
	body: string;
	rawFrontmatter: Record<string, unknown>;
} {
	// Support multiple frontmatter delimiters:
	// --- (YAML) - Jekyll, Astro, most SSGs
	// +++ (TOML) - Hugo
	// *** - Alternative format
	const frontmatterRegex = /^(---|\+\+\+|\*\*\*)\n([\s\S]*?)\n\1\n([\s\S]*)$/;
	const match = content.match(frontmatterRegex);

	if (!match) {
		throw new Error("Could not parse frontmatter");
	}

	const delimiter = match[1];
	const frontmatterStr = match[2] ?? "";
	const body = match[3] ?? "";

	// Determine format based on delimiter:
	// +++ uses TOML (key = value)
	// --- and *** use YAML (key: value)
	const isToml = delimiter === "+++";
	const separator = isToml ? "=" : ":";

	// Parse frontmatter manually
	const raw: Record<string, unknown> = {};
	const lines = frontmatterStr.split("\n");

	let i = 0;
	while (i < lines.length) {
		const line = lines[i];
		if (line === undefined) {
			i++;
			continue;
		}
		const sepIndex = line.indexOf(separator);
		if (sepIndex === -1) {
			i++;
			continue;
		}

		const key = line.slice(0, sepIndex).trim();
		let value = line.slice(sepIndex + 1).trim();

		// Handle quoted strings
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}

		// Handle inline arrays (simple case for tags)
		if (value.startsWith("[") && value.endsWith("]")) {
			const arrayContent = value.slice(1, -1);
			raw[key] = arrayContent
				.split(",")
				.map((item) => item.trim().replace(/^["']|["']$/g, ""));
		} else if (value === "" && !isToml) {
			// Check for YAML-style multiline array (key with no value followed by - items)
			const arrayItems: string[] = [];
			let j = i + 1;
			while (j < lines.length) {
				const nextLine = lines[j];
				if (nextLine === undefined) {
					j++;
					continue;
				}
				// Check if line is a list item (starts with whitespace and -)
				const listMatch = nextLine.match(/^\s+-\s*(.*)$/);
				if (listMatch && listMatch[1] !== undefined) {
					let itemValue = listMatch[1].trim();
					// Remove quotes if present
					if (
						(itemValue.startsWith('"') && itemValue.endsWith('"')) ||
						(itemValue.startsWith("'") && itemValue.endsWith("'"))
					) {
						itemValue = itemValue.slice(1, -1);
					}
					arrayItems.push(itemValue);
					j++;
				} else if (nextLine.trim() === "") {
					// Skip empty lines within the array
					j++;
				} else {
					// Hit a new key or non-list content
					break;
				}
			}
			if (arrayItems.length > 0) {
				raw[key] = arrayItems;
				i = j;
				continue;
			} else {
				raw[key] = value;
			}
		} else if (value === "true") {
			raw[key] = true;
		} else if (value === "false") {
			raw[key] = false;
		} else {
			raw[key] = value;
		}
		i++;
	}

	// Apply field mappings to normalize to standard PostFrontmatter fields
	const frontmatter: Record<string, unknown> = {};

	// Title mapping
	const titleField = mapping?.title || "title";
	frontmatter.title = raw[titleField] || raw.title;

	// Description mapping
	const descField = mapping?.description || "description";
	frontmatter.description = raw[descField] || raw.description;

	// Publish date mapping - check custom field first, then fallbacks
	const dateField = mapping?.publishDate;
	if (dateField && raw[dateField]) {
		frontmatter.publishDate = raw[dateField];
	} else if (raw.publishDate) {
		frontmatter.publishDate = raw.publishDate;
	} else {
		// Fallback to common date field names
		const dateFields = ["pubDate", "date", "createdAt", "created_at"];
		for (const field of dateFields) {
			if (raw[field]) {
				frontmatter.publishDate = raw[field];
				break;
			}
		}
	}

	// Cover image mapping
	const coverField = mapping?.coverImage || "ogImage";
	frontmatter.ogImage = raw[coverField] || raw.ogImage;

	// Tags mapping
	const tagsField = mapping?.tags || "tags";
	frontmatter.tags = raw[tagsField] || raw.tags;

	// Draft mapping
	const draftField = mapping?.draft || "draft";
	const draftValue = raw[draftField] ?? raw.draft;
	if (draftValue !== undefined) {
		frontmatter.draft = draftValue === true || draftValue === "true";
	}

	// Always preserve atUri (internal field)
	frontmatter.atUri = raw.atUri;

	return {
		frontmatter: frontmatter as unknown as PostFrontmatter,
		body,
		rawFrontmatter: raw,
	};
}

export function getSlugFromFilename(filename: string): string {
	return filename
		.replace(/\.mdx?$/, "")
		.toLowerCase()
		.replace(/\s+/g, "-");
}

export interface SlugOptions {
	slugField?: string;
	removeIndexFromSlug?: boolean;
	stripDatePrefix?: boolean;
}

export function getSlugFromOptions(
	relativePath: string,
	rawFrontmatter: Record<string, unknown>,
	options: SlugOptions = {},
): string {
	const {
		slugField,
		removeIndexFromSlug = false,
		stripDatePrefix = false,
	} = options;

	let slug: string;

	// If slugField is set, try to get the value from frontmatter
	if (slugField) {
		const frontmatterValue = rawFrontmatter[slugField];
		if (frontmatterValue && typeof frontmatterValue === "string") {
			// Remove leading slash if present
			slug = frontmatterValue
				.replace(/^\//, "")
				.toLowerCase()
				.replace(/\s+/g, "-");
		} else {
			// Fallback to filepath if frontmatter field not found
			slug = relativePath
				.replace(/\.mdx?$/, "")
				.toLowerCase()
				.replace(/\s+/g, "-");
		}
	} else {
		// Default: use filepath
		slug = relativePath
			.replace(/\.mdx?$/, "")
			.toLowerCase()
			.replace(/\s+/g, "-");
	}

	// Remove /index or /_index suffix if configured
	if (removeIndexFromSlug) {
		slug = slug.replace(/\/_?index$/, "");
	}

	// Strip Jekyll-style date prefix (YYYY-MM-DD-) from filename
	if (stripDatePrefix) {
		slug = slug.replace(/(^|\/)(\d{4}-\d{2}-\d{2})-/g, "$1");
	}

	return slug;
}

export function resolvePathTemplate(
	template: string,
	post: BlogPost,
): string {
	const publishDate = new Date(post.frontmatter.publishDate);
	const year = String(publishDate.getFullYear());
	const month = String(publishDate.getMonth() + 1).padStart(2, "0");
	const day = String(publishDate.getDate()).padStart(2, "0");

	const slugifiedTitle = (post.frontmatter.title || "")
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^\w-]/g, "");

	// Replace known tokens
	let result = template
		.replace(/\{slug\}/g, post.slug)
		.replace(/\{year\}/g, year)
		.replace(/\{month\}/g, month)
		.replace(/\{day\}/g, day)
		.replace(/\{title\}/g, slugifiedTitle);

	// Replace any remaining {field} tokens with raw frontmatter values
	result = result.replace(/\{(\w+)\}/g, (_match, field: string) => {
		const value = post.rawFrontmatter[field];
		if (value != null && typeof value === "string") {
			return value;
		}
		return "";
	});

	// Ensure leading slash
	if (!result.startsWith("/")) {
		result = `/${result}`;
	}

	return result;
}

export function resolvePostPath(post: BlogPost, pathPrefix?: string, pathTemplate?: string): string {
	if (pathTemplate) {
		return resolvePathTemplate(pathTemplate, post);
	}
	const prefix = pathPrefix || "/posts";
	return `${prefix}/${post.slug}`;
}

export async function getContentHash(content: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(content);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function shouldIgnore(relativePath: string, ignorePatterns: string[]): boolean {
	for (const pattern of ignorePatterns) {
		if (minimatch(relativePath, pattern)) {
			return true;
		}
	}
	return false;
}

export interface ScanOptions {
	frontmatterMapping?: FrontmatterMapping;
	ignorePatterns?: string[];
	slugField?: string;
	removeIndexFromSlug?: boolean;
	stripDatePrefix?: boolean;
}

export async function scanContentDirectory(
	contentDir: string,
	frontmatterMappingOrOptions?: FrontmatterMapping | ScanOptions,
	ignorePatterns: string[] = [],
): Promise<BlogPost[]> {
	// Handle both old signature (frontmatterMapping, ignorePatterns) and new signature (options)
	let options: ScanOptions;
	if (
		frontmatterMappingOrOptions &&
		("frontmatterMapping" in frontmatterMappingOrOptions ||
			"ignorePatterns" in frontmatterMappingOrOptions ||
			"slugField" in frontmatterMappingOrOptions)
	) {
		options = frontmatterMappingOrOptions as ScanOptions;
	} else {
		// Old signature: (contentDir, frontmatterMapping?, ignorePatterns?)
		options = {
			frontmatterMapping: frontmatterMappingOrOptions as
				| FrontmatterMapping
				| undefined,
			ignorePatterns,
		};
	}

	const {
		frontmatterMapping,
		ignorePatterns: ignore = [],
		slugField,
		removeIndexFromSlug,
		stripDatePrefix,
	} = options;

	const patterns = ["**/*.md", "**/*.mdx"];
	const posts: BlogPost[] = [];

	for (const pattern of patterns) {
		const files = await glob(pattern, {
			cwd: contentDir,
			absolute: false,
		});

		for (const relativePath of files) {
			// Skip files matching ignore patterns
			if (shouldIgnore(relativePath, ignore)) {
				continue;
			}

			const filePath = path.join(contentDir, relativePath);
			const rawContent = await fs.readFile(filePath, "utf-8");

			try {
				const { frontmatter, body, rawFrontmatter } = parseFrontmatter(
					rawContent,
					frontmatterMapping,
				);
				const slug = getSlugFromOptions(relativePath, rawFrontmatter, {
					slugField,
					removeIndexFromSlug,
					stripDatePrefix,
				});

				posts.push({
					filePath,
					slug,
					frontmatter,
					content: body,
					rawContent,
					rawFrontmatter,
				});
			} catch (error) {
				console.error(`Error parsing ${relativePath}:`, error);
			}
		}
	}

	// Sort by publish date (newest first)
	posts.sort((a, b) => {
		const dateA = new Date(a.frontmatter.publishDate);
		const dateB = new Date(b.frontmatter.publishDate);
		return dateB.getTime() - dateA.getTime();
	});

	return posts;
}

export function updateFrontmatterWithAtUri(
	rawContent: string,
	atUri: string,
): string {
	// Detect which delimiter is used (---, +++, or ***)
	const delimiterMatch = rawContent.match(/^(---|\+\+\+|\*\*\*)/);
	const delimiter = delimiterMatch?.[1] ?? "---";
	const isToml = delimiter === "+++";

	// Format the atUri entry based on frontmatter type
	const atUriEntry = isToml ? `atUri = "${atUri}"` : `atUri: "${atUri}"`;

	// Check if atUri already exists in frontmatter (handle both formats)
	if (rawContent.includes("atUri:") || rawContent.includes("atUri =")) {
		// Replace existing atUri (match both YAML and TOML formats)
		return rawContent.replace(
			/atUri\s*[=:]\s*["']?[^"'\n]+["']?\n?/,
			`${atUriEntry}\n`,
		);
	}

	// Insert atUri before the closing delimiter
	const frontmatterEndIndex = rawContent.indexOf(delimiter, 4);
	if (frontmatterEndIndex === -1) {
		throw new Error("Could not find frontmatter end");
	}

	const beforeEnd = rawContent.slice(0, frontmatterEndIndex);
	const afterEnd = rawContent.slice(frontmatterEndIndex);

	return `${beforeEnd}${atUriEntry}\n${afterEnd}`;
}

export function stripMarkdownForText(markdown: string): string {
	return markdown
		.replace(/#{1,6}\s/g, "") // Remove headers
		.replace(/\*\*([^*]+)\*\*/g, "$1") // Remove bold
		.replace(/\*([^*]+)\*/g, "$1") // Remove italic
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links, keep text
		.replace(/`{3}[\s\S]*?`{3}/g, "") // Remove code blocks
		.replace(/`([^`]+)`/g, "$1") // Remove inline code formatting
		.replace(/!\[.*?\]\(.*?\)/g, "") // Remove images
		.replace(/\n{3,}/g, "\n\n") // Normalize multiple newlines
		.trim();
}
