import * as path from "path";
import { Glob } from "bun";
import type { PostFrontmatter, BlogPost, FrontmatterMapping } from "./types";

export function parseFrontmatter(content: string, mapping?: FrontmatterMapping): {
  frontmatter: PostFrontmatter;
  body: string;
} {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    throw new Error("Could not parse frontmatter");
  }

  const frontmatterStr = match[1] ?? "";
  const body = match[2] ?? "";

  // Parse YAML-like frontmatter manually
  const raw: Record<string, unknown> = {};
  const lines = frontmatterStr.split("\n");

  for (const line of lines) {
    const colonIndex = line.indexOf(":");
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Handle quoted strings
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Handle arrays (simple case for tags)
    if (value.startsWith("[") && value.endsWith("]")) {
      const arrayContent = value.slice(1, -1);
      raw[key] = arrayContent
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""));
    } else if (value === "true") {
      raw[key] = true;
    } else if (value === "false") {
      raw[key] = false;
    } else {
      raw[key] = value;
    }
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

  // Hidden mapping
  const hiddenField = mapping?.hidden || "hidden";
  frontmatter.hidden = raw[hiddenField] || raw.hidden;

  // Tags mapping
  const tagsField = mapping?.tags || "tags";
  frontmatter.tags = raw[tagsField] || raw.tags;

  // Always preserve atUri (internal field)
  frontmatter.atUri = raw.atUri;

  return { frontmatter: frontmatter as unknown as PostFrontmatter, body };
}

export function getSlugFromFilename(filename: string): string {
  return filename
    .replace(/\.mdx?$/, "")
    .toLowerCase()
    .replace(/\s+/g, "-");
}

export async function getContentHash(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function scanContentDirectory(
  contentDir: string,
  include?: string[],
  exclude?: string[],
  frontmatterMapping?: FrontmatterMapping
): Promise<BlogPost[]> {
  const patterns = include || ["**/*.md", "**/*.mdx"];
  const posts: BlogPost[] = [];

  for (const pattern of patterns) {
    const glob = new Glob(pattern);

    for await (const relativePath of glob.scan({
      cwd: contentDir,
      absolute: false,
    })) {
      // Check exclusions
      if (exclude?.some((ex) => relativePath.includes(ex))) {
        continue;
      }

      const filePath = path.join(contentDir, relativePath);
      const file = Bun.file(filePath);
      const rawContent = await file.text();

      try {
        const { frontmatter, body } = parseFrontmatter(rawContent, frontmatterMapping);
        const filename = path.basename(relativePath);
        const slug = getSlugFromFilename(filename);

        posts.push({
          filePath,
          slug,
          frontmatter,
          content: body,
          rawContent,
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

export function updateFrontmatterWithAtUri(rawContent: string, atUri: string): string {
  // Check if atUri already exists in frontmatter
  if (rawContent.includes("atUri:")) {
    // Replace existing atUri
    return rawContent.replace(/atUri:\s*["']?[^"'\n]+["']?\n?/, `atUri: "${atUri}"\n`);
  }

  // Insert atUri before the closing ---
  const frontmatterEndIndex = rawContent.indexOf("---", 4);
  if (frontmatterEndIndex === -1) {
    throw new Error("Could not find frontmatter end");
  }

  const beforeEnd = rawContent.slice(0, frontmatterEndIndex);
  const afterEnd = rawContent.slice(frontmatterEndIndex);

  return `${beforeEnd}atUri: "${atUri}"\n${afterEnd}`;
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
