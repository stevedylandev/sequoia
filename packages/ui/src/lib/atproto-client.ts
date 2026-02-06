import type {
	DIDDocument,
	DocumentRecord,
	GetPostThreadResponse,
	GetRecordResponse,
	ThreadViewPost,
} from "../types/bluesky";

/**
 * Parse an AT URI into its components
 * Format: at://did/collection/rkey
 */
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

/**
 * Resolve a DID to its PDS URL
 * Supports did:plc and did:web methods
 */
export async function resolvePDS(did: string): Promise<string> {
	let pdsUrl: string | undefined;

	if (did.startsWith("did:plc:")) {
		// Fetch DID document from plc.directory
		const didDocUrl = `https://plc.directory/${did}`;
		const didDocResponse = await fetch(didDocUrl);
		if (!didDocResponse.ok) {
			throw new Error(`Could not fetch DID document: ${didDocResponse.status}`);
		}
		const didDoc: DIDDocument = await didDocResponse.json();

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
			throw new Error(`Could not fetch DID document: ${didDocResponse.status}`);
		}
		const didDoc: DIDDocument = await didDocResponse.json();

		const pdsService = didDoc.service?.find(
			(s) => s.id === "#atproto_pds" || s.type === "AtprotoPersonalDataServer",
		);
		pdsUrl = pdsService?.serviceEndpoint;
	} else {
		throw new Error(`Unsupported DID method: ${did}`);
	}

	if (!pdsUrl) {
		throw new Error("Could not find PDS URL for user");
	}

	return pdsUrl;
}

/**
 * Fetch a record from a PDS using the public API
 */
export async function getRecord<T>(
	did: string,
	collection: string,
	rkey: string,
): Promise<T> {
	const pdsUrl = await resolvePDS(did);

	const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
	url.searchParams.set("repo", did);
	url.searchParams.set("collection", collection);
	url.searchParams.set("rkey", rkey);

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(`Failed to fetch record: ${response.status}`);
	}

	const data: GetRecordResponse<T> = await response.json();
	return data.value;
}

/**
 * Fetch a document record from its AT URI
 */
export async function getDocument(atUri: string): Promise<DocumentRecord> {
	const parsed = parseAtUri(atUri);
	if (!parsed) {
		throw new Error(`Invalid AT URI: ${atUri}`);
	}

	return getRecord<DocumentRecord>(parsed.did, parsed.collection, parsed.rkey);
}

/**
 * Fetch a post thread from the public Bluesky API
 */
export async function getPostThread(
	postUri: string,
	depth = 6,
): Promise<ThreadViewPost> {
	const url = new URL(
		"https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread",
	);
	url.searchParams.set("uri", postUri);
	url.searchParams.set("depth", depth.toString());

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(`Failed to fetch post thread: ${response.status}`);
	}

	const data: GetPostThreadResponse = await response.json();

	if (data.thread.$type !== "app.bsky.feed.defs#threadViewPost") {
		throw new Error("Post not found or blocked");
	}

	return data.thread as ThreadViewPost;
}

/**
 * Build a Bluesky app URL for a post
 */
export function buildBskyAppUrl(postUri: string): string {
	const parsed = parseAtUri(postUri);
	if (!parsed) {
		throw new Error(`Invalid post URI: ${postUri}`);
	}

	return `https://bsky.app/profile/${parsed.did}/post/${parsed.rkey}`;
}
