import { Agent, AtpAgent } from "@atproto/api";
import * as mimeTypes from "mime-types";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { stripMarkdownForText, resolvePostPath } from "./markdown";
import { getOAuthClient } from "./oauth-client";
import type {
	BlobObject,
	BlogPost,
	Credentials,
	PublicationRecord,
	PublisherConfig,
	StrongRef,
} from "./types";
import { isAppPasswordCredentials, isOAuthCredentials } from "./types";

/**
 * Type guard to check if a record value is a DocumentRecord
 */
function isDocumentRecord(value: unknown): value is DocumentRecord {
	if (!value || typeof value !== "object") return false;
	const v = value as Record<string, unknown>;
	return (
		v.$type === "site.standard.document" &&
		typeof v.title === "string" &&
		typeof v.site === "string" &&
		typeof v.path === "string" &&
		typeof v.textContent === "string" &&
		typeof v.publishedAt === "string"
	);
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Resolve a handle to a DID
 */
export async function resolveHandleToDid(handle: string): Promise<string> {
	if (handle.startsWith("did:")) {
		return handle;
	}

	// Try to resolve handle via Bluesky API
	const resolveUrl = `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`;
	const resolveResponse = await fetch(resolveUrl);
	if (!resolveResponse.ok) {
		throw new Error("Could not resolve handle");
	}
	const resolveData = (await resolveResponse.json()) as { did: string };
	return resolveData.did;
}

export async function resolveHandleToPDS(handle: string): Promise<string> {
	// First, resolve the handle to a DID
	const did = await resolveHandleToDid(handle);

	// Now resolve the DID to get the PDS URL from the DID document
	let pdsUrl: string | undefined;

	if (did.startsWith("did:plc:")) {
		// Fetch DID document from plc.directory
		const didDocUrl = `https://plc.directory/${did}`;
		const didDocResponse = await fetch(didDocUrl);
		if (!didDocResponse.ok) {
			throw new Error("Could not fetch DID document");
		}
		const didDoc = (await didDocResponse.json()) as {
			service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
		};

		// Find the PDS service endpoint
		const pdsService = didDoc.service?.find(
			(s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
		);
		pdsUrl = pdsService?.serviceEndpoint;
	} else if (did.startsWith("did:web:")) {
		// For did:web, fetch the DID document from the domain
		const domain = did.replace("did:web:", "");
		const didDocUrl = `https://${domain}/.well-known/did.json`;
		const didDocResponse = await fetch(didDocUrl);
		if (!didDocResponse.ok) {
			throw new Error("Could not fetch DID document");
		}
		const didDoc = (await didDocResponse.json()) as {
			service?: Array<{ id: string; type: string; serviceEndpoint: string }>;
		};

		const pdsService = didDoc.service?.find(
			(s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
		);
		pdsUrl = pdsService?.serviceEndpoint;
	}

	if (!pdsUrl) {
		throw new Error("Could not find PDS URL for user");
	}

	return pdsUrl;
}

export interface CreatePublicationOptions {
	url: string;
	name: string;
	description?: string;
	iconPath?: string;
	showInDiscover?: boolean;
}

export async function createAgent(credentials: Credentials): Promise<Agent> {
	if (isOAuthCredentials(credentials)) {
		// OAuth flow - restore session from stored tokens
		const client = await getOAuthClient();
		try {
			const oauthSession = await client.restore(credentials.did);
			// Wrap the OAuth session in an Agent which provides the atproto API
			return new Agent(oauthSession);
		} catch (error) {
			if (error instanceof Error) {
				// Check for common OAuth errors
				if (
					error.message.includes("expired") ||
					error.message.includes("revoked")
				) {
					throw new Error(
						`OAuth session expired or revoked. Please run 'sequoia login' to re-authenticate.`,
					);
				}
			}
			throw error;
		}
	}

	// App password flow
	if (!isAppPasswordCredentials(credentials)) {
		throw new Error("Invalid credential type");
	}
	const agent = new AtpAgent({ service: credentials.pdsUrl });

	await agent.login({
		identifier: credentials.identifier,
		password: credentials.password,
	});

	return agent;
}

export async function uploadImage(
	agent: Agent,
	imagePath: string,
): Promise<BlobObject | undefined> {
	if (!(await fileExists(imagePath))) {
		return undefined;
	}

	try {
		const imageBuffer = await fs.readFile(imagePath);
		const mimeType = mimeTypes.lookup(imagePath) || "application/octet-stream";

		const response = await agent.com.atproto.repo.uploadBlob(
			new Uint8Array(imageBuffer),
			{
				encoding: mimeType,
			},
		);

		return {
			$type: "blob",
			ref: {
				$link: response.data.blob.ref.toString(),
			},
			mimeType,
			size: imageBuffer.byteLength,
		};
	} catch (error) {
		console.error(`Error uploading image ${imagePath}:`, error);
		return undefined;
	}
}

export async function resolveImagePath(
	ogImage: string,
	imagesDir: string | undefined,
	contentDir: string,
): Promise<string | null> {
	// Try multiple resolution strategies

	// 1. If imagesDir is specified, look there
	if (imagesDir) {
		// Get the base name of the images directory (e.g., "blog-images" from "public/blog-images")
		const imagesDirBaseName = path.basename(imagesDir);

		// Check if ogImage contains the images directory name and extract the relative path
		// e.g., "/blog-images/other/file.png" with imagesDirBaseName "blog-images" -> "other/file.png"
		const imagesDirIndex = ogImage.indexOf(imagesDirBaseName);
		let relativePath: string;

		if (imagesDirIndex !== -1) {
			// Extract everything after "blog-images/"
			const afterImagesDir = ogImage.substring(
				imagesDirIndex + imagesDirBaseName.length,
			);
			// Remove leading slash if present
			relativePath = afterImagesDir.replace(/^[/\\]/, "");
		} else {
			// Fall back to just the filename
			relativePath = path.basename(ogImage);
		}

		const imagePath = path.join(imagesDir, relativePath);
		if (await fileExists(imagePath)) {
			const stat = await fs.stat(imagePath);
			if (stat.size > 0) {
				return imagePath;
			}
		}
	}

	// 2. Try the ogImage path directly (if it's absolute)
	if (path.isAbsolute(ogImage)) {
		return ogImage;
	}

	// 3. Try relative to content directory
	const contentRelative = path.join(contentDir, ogImage);
	if (await fileExists(contentRelative)) {
		const stat = await fs.stat(contentRelative);
		if (stat.size > 0) {
			return contentRelative;
		}
	}

	return null;
}

export async function createDocument(
	agent: Agent,
	post: BlogPost,
	config: PublisherConfig,
	coverImage?: BlobObject,
): Promise<string> {
	const postPath = resolvePostPath(
		post,
		config.pathPrefix,
		config.pathTemplate,
	);
	const publishDate = new Date(post.frontmatter.publishDate);

	// Determine textContent: use configured field from frontmatter, or fallback to markdown body
	let textContent: string;
	if (
		config.textContentField &&
		post.rawFrontmatter?.[config.textContentField]
	) {
		textContent = String(post.rawFrontmatter[config.textContentField]);
	} else {
		textContent = stripMarkdownForText(post.content);
	}

	const record: Record<string, unknown> = {
		$type: "site.standard.document",
		title: post.frontmatter.title,
		site: config.publicationUri,
		path: postPath,
		textContent: textContent.slice(0, 10000),
		publishedAt: publishDate.toISOString(),
		canonicalUrl: `${config.siteUrl}${postPath}`,
	};

	if (post.frontmatter.description) {
		record.description = post.frontmatter.description;
	}

	if (coverImage) {
		record.coverImage = coverImage;
	}

	if (post.frontmatter.tags && post.frontmatter.tags.length > 0) {
		record.tags = post.frontmatter.tags;
	}

	const response = await agent.com.atproto.repo.createRecord({
		repo: agent.did!,
		collection: "site.standard.document",
		record,
	});

	return response.data.uri;
}

export async function updateDocument(
	agent: Agent,
	post: BlogPost,
	atUri: string,
	config: PublisherConfig,
	coverImage?: BlobObject,
): Promise<void> {
	// Parse the atUri to get the collection and rkey
	// Format: at://did:plc:xxx/collection/rkey
	const uriMatch = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
	if (!uriMatch) {
		throw new Error(`Invalid atUri format: ${atUri}`);
	}

	const [, , collection, rkey] = uriMatch;

	const postPath = resolvePostPath(
		post,
		config.pathPrefix,
		config.pathTemplate,
	);
	const publishDate = new Date(post.frontmatter.publishDate);

	// Determine textContent: use configured field from frontmatter, or fallback to markdown body
	let textContent: string;
	if (
		config.textContentField &&
		post.rawFrontmatter?.[config.textContentField]
	) {
		textContent = String(post.rawFrontmatter[config.textContentField]);
	} else {
		textContent = stripMarkdownForText(post.content);
	}

	// Fetch existing record to preserve PDS-side fields (e.g. bskyPostRef)
	const existingResponse = await agent.com.atproto.repo.getRecord({
		repo: agent.did!,
		collection: collection!,
		rkey: rkey!,
	});
	const existingRecord = existingResponse.data.value as Record<string, unknown>;

	const record: Record<string, unknown> = {
		...existingRecord,
		$type: "site.standard.document",
		title: post.frontmatter.title,
		site: config.publicationUri,
		path: postPath,
		textContent: textContent.slice(0, 10000),
		publishedAt: publishDate.toISOString(),
		canonicalUrl: `${config.siteUrl}${postPath}`,
	};

	if (post.frontmatter.description) {
		record.description = post.frontmatter.description;
	}

	if (coverImage) {
		record.coverImage = coverImage;
	}

	if (post.frontmatter.tags && post.frontmatter.tags.length > 0) {
		record.tags = post.frontmatter.tags;
	}

	await agent.com.atproto.repo.putRecord({
		repo: agent.did!,
		collection: collection!,
		rkey: rkey!,
		record,
	});
}

export function parseAtUri(
	atUri: string,
): { did: string; collection: string; rkey: string } | null {
	const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
	if (!match) return null;
	return {
		did: match[1]!,
		collection: match[2]!,
		rkey: match[3]!,
	};
}

export interface DocumentRecord {
	$type: "site.standard.document";
	title: string;
	site: string;
	path: string;
	textContent: string;
	publishedAt: string;
	canonicalUrl?: string;
	description?: string;
	coverImage?: BlobObject;
	tags?: string[];
	location?: string;
}

export interface ListDocumentsResult {
	uri: string;
	cid: string;
	value: DocumentRecord;
}

export async function listDocuments(
	agent: Agent,
	publicationUri?: string,
): Promise<ListDocumentsResult[]> {
	const documents: ListDocumentsResult[] = [];
	let cursor: string | undefined;

	do {
		const response = await agent.com.atproto.repo.listRecords({
			repo: agent.did!,
			collection: "site.standard.document",
			limit: 100,
			cursor,
		});

		for (const record of response.data.records) {
			if (!isDocumentRecord(record.value)) {
				continue;
			}

			// If publicationUri is specified, only include documents from that publication
			if (publicationUri && record.value.site !== publicationUri) {
				continue;
			}

			documents.push({
				uri: record.uri,
				cid: record.cid,
				value: record.value,
			});
		}

		cursor = response.data.cursor;
	} while (cursor);

	return documents;
}

export async function createPublication(
	agent: Agent,
	options: CreatePublicationOptions,
): Promise<string> {
	let icon: BlobObject | undefined;

	if (options.iconPath) {
		icon = await uploadImage(agent, options.iconPath);
	}

	const record: Record<string, unknown> = {
		$type: "site.standard.publication",
		url: options.url,
		name: options.name,
		createdAt: new Date().toISOString(),
	};

	if (options.description) {
		record.description = options.description;
	}

	if (icon) {
		record.icon = icon;
	}

	if (options.showInDiscover !== undefined) {
		record.preferences = {
			showInDiscover: options.showInDiscover,
		};
	}

	const response = await agent.com.atproto.repo.createRecord({
		repo: agent.did!,
		collection: "site.standard.publication",
		record,
	});

	return response.data.uri;
}

export interface GetPublicationResult {
	uri: string;
	cid: string;
	value: PublicationRecord;
}

export async function getPublication(
	agent: Agent,
	publicationUri: string,
): Promise<GetPublicationResult | null> {
	const parsed = parseAtUri(publicationUri);
	if (!parsed) {
		return null;
	}

	try {
		const response = await agent.com.atproto.repo.getRecord({
			repo: parsed.did,
			collection: parsed.collection,
			rkey: parsed.rkey,
		});

		return {
			uri: publicationUri,
			cid: response.data.cid!,
			value: response.data.value as unknown as PublicationRecord,
		};
	} catch {
		return null;
	}
}

export interface UpdatePublicationOptions {
	url?: string;
	name?: string;
	description?: string;
	iconPath?: string;
	showInDiscover?: boolean;
}

export async function updatePublication(
	agent: Agent,
	publicationUri: string,
	options: UpdatePublicationOptions,
	existingRecord: PublicationRecord,
): Promise<void> {
	const parsed = parseAtUri(publicationUri);
	if (!parsed) {
		throw new Error(`Invalid publication URI: ${publicationUri}`);
	}

	// Build updated record, preserving createdAt and $type
	const record: Record<string, unknown> = {
		$type: existingRecord.$type,
		url: options.url ?? existingRecord.url,
		name: options.name ?? existingRecord.name,
		createdAt: existingRecord.createdAt,
	};

	// Handle description - can be cleared with empty string
	if (options.description !== undefined) {
		if (options.description) {
			record.description = options.description;
		}
		// If empty string, don't include description (clears it)
	} else if (existingRecord.description) {
		record.description = existingRecord.description;
	}

	// Handle icon - upload new if provided, otherwise keep existing
	if (options.iconPath) {
		const icon = await uploadImage(agent, options.iconPath);
		if (icon) {
			record.icon = icon;
		}
	} else if (existingRecord.icon) {
		record.icon = existingRecord.icon;
	}

	// Handle preferences
	if (options.showInDiscover !== undefined) {
		record.preferences = {
			showInDiscover: options.showInDiscover,
		};
	} else if (existingRecord.preferences) {
		record.preferences = existingRecord.preferences;
	}

	await agent.com.atproto.repo.putRecord({
		repo: parsed.did,
		collection: parsed.collection,
		rkey: parsed.rkey,
		record,
	});
}

// --- Bluesky Post Creation ---

export interface CreateBlueskyPostOptions {
	title: string;
	description?: string;
	bskyPost?: string;
	canonicalUrl: string;
	coverImage?: BlobObject;
	publishedAt: string; // Used as createdAt for the post
}

/**
 * Count graphemes in a string (for Bluesky's 300 grapheme limit)
 */
function countGraphemes(str: string): number {
	// Use Intl.Segmenter if available, otherwise fallback to spread operator
	if (typeof Intl !== "undefined" && Intl.Segmenter) {
		const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
		return [...segmenter.segment(str)].length;
	}
	return [...str].length;
}

/**
 * Truncate a string to a maximum number of graphemes
 */
function truncateToGraphemes(str: string, maxGraphemes: number): string {
	if (typeof Intl !== "undefined" && Intl.Segmenter) {
		const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
		const segments = [...segmenter.segment(str)];
		if (segments.length <= maxGraphemes) return str;
		return `${segments
			.slice(0, maxGraphemes - 3)
			.map((s) => s.segment)
			.join("")}...`;
	}
	// Fallback
	const chars = [...str];
	if (chars.length <= maxGraphemes) return str;
	return `${chars.slice(0, maxGraphemes - 3).join("")}...`;
}

/**
 * Create a Bluesky post with external link embed
 */
export async function createBlueskyPost(
	agent: Agent,
	options: CreateBlueskyPostOptions,
): Promise<StrongRef> {
	const {
		title,
		description,
		bskyPost,
		canonicalUrl,
		coverImage,
		publishedAt,
	} = options;

	// Build post text: title + description
	// Max 300 graphemes for Bluesky posts
	const MAX_GRAPHEMES = 300;

	let postText: string;

	if (bskyPost) {
		// Custom bsky post overrides any default behavior
		postText = bskyPost;
	} else if (description) {
		// Try: title + description
		const fullText = `${title}\n\n${description}`;
		if (countGraphemes(fullText) <= MAX_GRAPHEMES) {
			postText = fullText;
		} else {
			// Truncate description to fit
			const availableForDesc =
				MAX_GRAPHEMES - countGraphemes(title) - countGraphemes("\n\n");
			if (availableForDesc > 10) {
				const truncatedDesc = truncateToGraphemes(
					description,
					availableForDesc,
				);
				postText = `${title}\n\n${truncatedDesc}`;
			} else {
				// Just title
				postText = `${title}`;
			}
		}
	} else {
		// Just title
		postText = `${title}`;
	}

	// Final truncation in case title or bskyPost are longer than expected
	if (countGraphemes(postText) > MAX_GRAPHEMES) {
		postText = truncateToGraphemes(postText, MAX_GRAPHEMES);
	}

	// Build external embed
	const embed: Record<string, unknown> = {
		$type: "app.bsky.embed.external",
		external: {
			uri: canonicalUrl,
			title: title.substring(0, 500), // Max 500 chars for title
			description: (description || "").substring(0, 1000), // Max 1000 chars for description
		},
	};

	// Add thumbnail if coverImage is available
	if (coverImage) {
		(embed.external as Record<string, unknown>).thumb = coverImage;
	}

	// Create the post record
	const record: Record<string, unknown> = {
		$type: "app.bsky.feed.post",
		text: postText,
		embed,
		createdAt: new Date(publishedAt).toISOString(),
	};

	const response = await agent.com.atproto.repo.createRecord({
		repo: agent.did!,
		collection: "app.bsky.feed.post",
		record,
	});

	return {
		uri: response.data.uri,
		cid: response.data.cid,
	};
}

/**
 * Add bskyPostRef to an existing document record
 */
export async function addBskyPostRefToDocument(
	agent: Agent,
	documentAtUri: string,
	bskyPostRef: StrongRef,
): Promise<void> {
	const parsed = parseAtUri(documentAtUri);
	if (!parsed) {
		throw new Error(`Invalid document URI: ${documentAtUri}`);
	}

	// Fetch existing record
	const existingRecord = await agent.com.atproto.repo.getRecord({
		repo: parsed.did,
		collection: parsed.collection,
		rkey: parsed.rkey,
	});

	// Add bskyPostRef to the record
	const updatedRecord = {
		...(existingRecord.data.value as Record<string, unknown>),
		bskyPostRef,
	};

	// Update the record
	await agent.com.atproto.repo.putRecord({
		repo: parsed.did,
		collection: parsed.collection,
		rkey: parsed.rkey,
		record: updatedRecord,
	});
}
