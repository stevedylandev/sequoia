export interface FrontmatterMapping {
	title?: string; // Field name for title (default: "title")
	description?: string; // Field name for description (default: "description")
	publishDate?: string; // Field name for publish date (default: "publishDate", also checks "pubDate", "date", "createdAt", "created_at")
	coverImage?: string; // Field name for cover image (default: "ogImage")
	tags?: string; // Field name for tags (default: "tags")
	draft?: string; // Field name for draft status (default: "draft")
}

// Strong reference for Bluesky post (com.atproto.repo.strongRef)
export interface StrongRef {
	uri: string; // at:// URI format
	cid: string; // Content ID
}

// Bluesky posting configuration
export interface BlueskyConfig {
	enabled: boolean;
	maxAgeDays?: number; // Only post if published within N days (default: 7)
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
	bluesky?: BlueskyConfig; // Optional Bluesky posting configuration
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
	draft?: boolean;
}

export interface BlogPost {
	filePath: string;
	slug: string;
	frontmatter: PostFrontmatter;
	content: string;
	rawContent: string;
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
	bskyPostRef?: StrongRef; // Reference to corresponding Bluesky post
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
