export interface FrontmatterMapping {
	title?: string; // Field name for title (default: "title")
	description?: string; // Field name for description (default: "description")
	publishDate?: string; // Field name for publish date (default: "publishDate", also checks "pubDate", "date", "createdAt", "created_at")
	coverImage?: string; // Field name for cover image (default: "ogImage")
	tags?: string; // Field name for tags (default: "tags")
	draft?: string; // Field name for draft status (default: "draft")
	slugField?: string; // Frontmatter field to use for slug (if set, uses frontmatter value; otherwise uses filepath)
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
	removeIndexFromSlug?: boolean; // Remove "/index" or "/_index" suffix from paths (default: false)
	stripDatePrefix?: boolean; // Remove YYYY-MM-DD- prefix from filenames (Jekyll-style, default: false)
	textContentField?: string; // Frontmatter field to use for textContent instead of markdown body
	bluesky?: BlueskyConfig; // Optional Bluesky posting configuration
}

// Legacy credentials format (for backward compatibility during migration)
export interface LegacyCredentials {
	pdsUrl: string;
	identifier: string;
	password: string;
}

// App password credentials (explicit type)
export interface AppPasswordCredentials {
	type: "app-password";
	pdsUrl: string;
	identifier: string;
	password: string;
}

// OAuth credentials (references stored OAuth session)
// Note: pdsUrl is not needed for OAuth - the OAuth client resolves PDS from the DID
export interface OAuthCredentials {
	type: "oauth";
	did: string;
	handle: string;
}

// Union type for all credential types
export type Credentials = AppPasswordCredentials | OAuthCredentials;

// Helper to check credential type
export function isOAuthCredentials(
	creds: Credentials,
): creds is OAuthCredentials {
	return creds.type === "oauth";
}

export function isAppPasswordCredentials(
	creds: Credentials,
): creds is AppPasswordCredentials {
	return creds.type === "app-password";
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
