/**
 * Strong reference for AT Protocol records (com.atproto.repo.strongRef)
 */
export interface StrongRef {
	uri: string; // at:// URI format
	cid: string; // Content ID
}

/**
 * Basic profile view from Bluesky API
 */
export interface ProfileViewBasic {
	did: string;
	handle: string;
	displayName?: string;
	avatar?: string;
}

/**
 * Post record content from app.bsky.feed.post
 */
export interface PostRecord {
	$type: "app.bsky.feed.post";
	text: string;
	createdAt: string;
	reply?: {
		root: StrongRef;
		parent: StrongRef;
	};
	facets?: Array<{
		index: { byteStart: number; byteEnd: number };
		features: Array<
			| { $type: "app.bsky.richtext.facet#link"; uri: string }
			| { $type: "app.bsky.richtext.facet#mention"; did: string }
			| { $type: "app.bsky.richtext.facet#tag"; tag: string }
		>;
	}>;
}

/**
 * Post view from Bluesky API
 */
export interface PostView {
	uri: string;
	cid: string;
	author: ProfileViewBasic;
	record: PostRecord;
	replyCount?: number;
	repostCount?: number;
	likeCount?: number;
	indexedAt: string;
}

/**
 * Thread view post from app.bsky.feed.getPostThread
 */
export interface ThreadViewPost {
	$type: "app.bsky.feed.defs#threadViewPost";
	post: PostView;
	parent?: ThreadViewPost | BlockedPost | NotFoundPost;
	replies?: Array<ThreadViewPost | BlockedPost | NotFoundPost>;
}

/**
 * Blocked post placeholder
 */
export interface BlockedPost {
	$type: "app.bsky.feed.defs#blockedPost";
	uri: string;
	blocked: true;
}

/**
 * Not found post placeholder
 */
export interface NotFoundPost {
	$type: "app.bsky.feed.defs#notFoundPost";
	uri: string;
	notFound: true;
}

/**
 * Type guard for ThreadViewPost
 */
export function isThreadViewPost(
	post: ThreadViewPost | BlockedPost | NotFoundPost | undefined,
): post is ThreadViewPost {
	return post?.$type === "app.bsky.feed.defs#threadViewPost";
}

/**
 * Document record from site.standard.document
 */
export interface DocumentRecord {
	$type: "site.standard.document";
	title: string;
	site: string;
	path: string;
	textContent: string;
	publishedAt: string;
	canonicalUrl?: string;
	description?: string;
	tags?: string[];
	bskyPostRef?: StrongRef;
}

/**
 * DID document structure
 */
export interface DIDDocument {
	id: string;
	service?: Array<{
		id: string;
		type: string;
		serviceEndpoint: string;
	}>;
}

/**
 * Response from com.atproto.repo.getRecord
 */
export interface GetRecordResponse<T> {
	uri: string;
	cid: string;
	value: T;
}

/**
 * Response from app.bsky.feed.getPostThread
 */
export interface GetPostThreadResponse {
	thread: ThreadViewPost | BlockedPost | NotFoundPost;
}
