export interface FrontmatterMapping {
	title?: string; // Field name for title (default: "title")
	description?: string; // Field name for description (default: "description")
	publishDate?: string; // Field name for publish date (default: "publishDate", also checks "pubDate", "date", "createdAt", "created_at")
	coverImage?: string; // Field name for cover image (default: "ogImage")
	tags?: string; // Field name for tags (default: "tags")
}

export interface PublisherConfig {
	siteUrl: string;
	contentDir: string;
	imagesDir?: string; // Directory containing cover images
	publicDir?: string; // Static/public folder for .well-known files (default: public)
	outputDir?: string; // Built output directory for inject command
	pathPrefix?: string; // URL path prefix for posts (default: /posts)
	publicationUri: string;
	pdsUrl?: string;
	identity?: string; // Which stored identity to use (matches identifier)
	frontmatter?: FrontmatterMapping; // Custom frontmatter field mappings
	ignore?: string[]; // Glob patterns for files to ignore (e.g., ["_index.md", "**/drafts/**"])
	slugSource?: "filename" | "path" | "frontmatter"; // How to generate slugs (default: "filename")
	slugField?: string; // Frontmatter field to use when slugSource is "frontmatter" (default: "slug")
	removeIndexFromSlug?: boolean; // Remove "/index" or "/_index" suffix from paths (default: false)
	textContentField?: string; // Frontmatter field to use for textContent instead of markdown body
}

export interface Credentials {
	pdsUrl: string;
	identifier: string;
	password: string;
}

export interface PostFrontmatter {
	title: string;
	description?: string;
	publishDate: string;
	tags?: string[];
	ogImage?: string;
	atUri?: string;
}

export interface BlogPost {
	filePath: string;
	slug: string;
	frontmatter: PostFrontmatter;
	content: string;
	rawContent: string;
	rawFrontmatter: Record<string, unknown>; // For accessing custom fields like textContentField
}

export interface BlobRef {
	$link: string;
}

export interface BlobObject {
	$type: "blob";
	ref: BlobRef;
	mimeType: string;
	size: number;
}

export interface PublisherState {
	posts: Record<string, PostState>;
}

export interface PostState {
	contentHash: string;
	atUri?: string;
	lastPublished?: string;
	slug?: string; // The generated slug for this post (used by inject command)
}

export interface PublicationRecord {
	$type: "site.standard.publication";
	url: string;
	name: string;
	description?: string;
	icon?: BlobObject;
	createdAt: string;
	preferences?: {
		showInDiscover?: boolean;
	};
}
