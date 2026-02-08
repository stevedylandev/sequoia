/**
 * Sequoia Comments - A Bluesky-powered comments component
 *
 * A self-contained Web Component that displays comments from Bluesky posts
 * linked to documents via the AT Protocol.
 *
 * Usage:
 *   <sequoia-comments></sequoia-comments>
 *
 * The component looks for a document URI in two places:
 *   1. The `document-uri` attribute on the element
 *   2. A <link rel="site.standard.document" href="at://..."> tag in the document head
 *
 * Attributes:
 *   - document-uri: AT Protocol URI for the document (optional if link tag exists)
 *   - depth: Maximum depth of nested replies to fetch (default: 6)
 *   - hide: Set to "auto" to hide if no document link is detected
 *
 * CSS Custom Properties:
 *   - --sequoia-fg-color: Text color (default: #1f2937)
 *   - --sequoia-bg-color: Background color (default: #ffffff)
 *   - --sequoia-border-color: Border color (default: #e5e7eb)
 *   - --sequoia-accent-color: Accent/link color (default: #2563eb)
 *   - --sequoia-secondary-color: Secondary text color (default: #6b7280)
 *   - --sequoia-border-radius: Border radius (default: 8px)
 */

// ============================================================================
// Styles
// ============================================================================

const styles = `
:host {
	display: block;
	font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	color: var(--sequoia-fg-color, #1f2937);
	line-height: 1.5;
}

* {
	box-sizing: border-box;
}

.sequoia-comments-container {
	max-width: 100%;
}

.sequoia-loading,
.sequoia-error,
.sequoia-empty,
.sequoia-warning {
	padding: 1rem;
	border-radius: var(--sequoia-border-radius, 8px);
	text-align: center;
}

.sequoia-loading {
	background: var(--sequoia-bg-color, #ffffff);
	border: 1px solid var(--sequoia-border-color, #e5e7eb);
	color: var(--sequoia-secondary-color, #6b7280);
}

.sequoia-loading-spinner {
	display: inline-block;
	width: 1.25rem;
	height: 1.25rem;
	border: 2px solid var(--sequoia-border-color, #e5e7eb);
	border-top-color: var(--sequoia-accent-color, #2563eb);
	border-radius: 50%;
	animation: sequoia-spin 0.8s linear infinite;
	margin-right: 0.5rem;
	vertical-align: middle;
}

@keyframes sequoia-spin {
	to { transform: rotate(360deg); }
}

.sequoia-error {
	background: #fef2f2;
	border: 1px solid #fecaca;
	color: #dc2626;
}

.sequoia-warning {
	background: #fffbeb;
	border: 1px solid #fde68a;
	color: #d97706;
}

.sequoia-empty {
	background: var(--sequoia-bg-color, #ffffff);
	border: 1px solid var(--sequoia-border-color, #e5e7eb);
	color: var(--sequoia-secondary-color, #6b7280);
}

.sequoia-comments-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1rem;
	padding-bottom: 0.75rem;
}

.sequoia-comments-title {
	font-size: 1.125rem;
	font-weight: 600;
	margin: 0;
}

.sequoia-reply-button {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem 1rem;
	background: var(--sequoia-accent-color, #2563eb);
	color: #ffffff;
	border: none;
	border-radius: var(--sequoia-border-radius, 8px);
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
	text-decoration: none;
	transition: background-color 0.15s ease;
}

.sequoia-reply-button:hover {
	background: color-mix(in srgb, var(--sequoia-accent-color, #2563eb) 85%, black);
}

.sequoia-reply-button svg {
	width: 1rem;
	height: 1rem;
}

.sequoia-comments-list {
	display: flex;
	flex-direction: column;
}

.sequoia-thread {
	border-top: 1px solid var(--sequoia-border-color, #e5e7eb);
	padding-bottom: 1rem;
}

.sequoia-thread + .sequoia-thread {
	margin-top: 0.5rem;
}

.sequoia-thread:last-child {
	border-bottom: 1px solid var(--sequoia-border-color, #e5e7eb);
}

.sequoia-comment {
	display: flex;
	gap: 0.75rem;
	padding-top: 1rem;
}

.sequoia-comment-avatar-column {
	display: flex;
	flex-direction: column;
	align-items: center;
	flex-shrink: 0;
	width: 2.5rem;
	position: relative;
}

.sequoia-comment-avatar {
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 50%;
	background: var(--sequoia-border-color, #e5e7eb);
	object-fit: cover;
	flex-shrink: 0;
	position: relative;
	z-index: 1;
}

.sequoia-comment-avatar-placeholder {
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 50%;
	background: var(--sequoia-border-color, #e5e7eb);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	color: var(--sequoia-secondary-color, #6b7280);
	font-weight: 600;
	font-size: 1rem;
	position: relative;
	z-index: 1;
}

.sequoia-thread-line {
	position: absolute;
	top: 2.5rem;
	bottom: calc(-1rem - 0.5rem);
	left: 50%;
	transform: translateX(-50%);
	width: 2px;
	background: var(--sequoia-border-color, #e5e7eb);
}

.sequoia-comment-content {
	flex: 1;
	min-width: 0;
}

.sequoia-comment-header {
	display: flex;
	align-items: baseline;
	gap: 0.5rem;
	margin-bottom: 0.25rem;
	flex-wrap: wrap;
}

.sequoia-comment-author {
	font-weight: 600;
	color: var(--sequoia-fg-color, #1f2937);
	text-decoration: none;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sequoia-comment-author:hover {
	color: var(--sequoia-accent-color, #2563eb);
}

.sequoia-comment-handle {
	font-size: 0.875rem;
	color: var(--sequoia-secondary-color, #6b7280);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sequoia-comment-time {
	font-size: 0.875rem;
	color: var(--sequoia-secondary-color, #6b7280);
	flex-shrink: 0;
}

.sequoia-comment-time::before {
	content: "·";
	margin-right: 0.5rem;
}

.sequoia-comment-text {
	margin: 0;
	white-space: pre-wrap;
	word-wrap: break-word;
}

.sequoia-comment-text a {
	color: var(--sequoia-accent-color, #2563eb);
	text-decoration: none;
}

.sequoia-comment-text a:hover {
	text-decoration: underline;
}

.sequoia-bsky-logo {
	width: 1rem;
	height: 1rem;
}
`;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a relative time string (e.g., "2 hours ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted relative time
 */
function formatRelativeTime(dateString) {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);
	const diffWeeks = Math.floor(diffDays / 7);
	const diffMonths = Math.floor(diffDays / 30);
	const diffYears = Math.floor(diffDays / 365);

	if (diffSeconds < 60) {
		return "just now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	if (diffDays < 7) {
		return `${diffDays}d ago`;
	}
	if (diffWeeks < 4) {
		return `${diffWeeks}w ago`;
	}
	if (diffMonths < 12) {
		return `${diffMonths}mo ago`;
	}
	return `${diffYears}y ago`;
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} Escaped HTML
 */
function escapeHtml(text) {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

/**
 * Convert post text with facets to HTML
 * @param {string} text - Post text
 * @param {Array<{index: {byteStart: number, byteEnd: number}, features: Array<{$type: string, uri?: string, did?: string, tag?: string}>}>} [facets] - Rich text facets
 * @returns {string} HTML string with links
 */
function renderTextWithFacets(text, facets) {
	if (!facets || facets.length === 0) {
		return escapeHtml(text);
	}

	// Convert text to bytes for proper indexing
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const textBytes = encoder.encode(text);

	// Sort facets by start index
	const sortedFacets = [...facets].sort(
		(a, b) => a.index.byteStart - b.index.byteStart,
	);

	let result = "";
	let lastEnd = 0;

	for (const facet of sortedFacets) {
		const { byteStart, byteEnd } = facet.index;

		// Add text before this facet
		if (byteStart > lastEnd) {
			const beforeBytes = textBytes.slice(lastEnd, byteStart);
			result += escapeHtml(decoder.decode(beforeBytes));
		}

		// Get the facet text
		const facetBytes = textBytes.slice(byteStart, byteEnd);
		const facetText = decoder.decode(facetBytes);

		// Find the first renderable feature
		const feature = facet.features[0];
		if (feature) {
			if (feature.$type === "app.bsky.richtext.facet#link") {
				result += `<a href="${escapeHtml(feature.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
			} else if (feature.$type === "app.bsky.richtext.facet#mention") {
				result += `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
			} else if (feature.$type === "app.bsky.richtext.facet#tag") {
				result += `<a href="https://bsky.app/hashtag/${escapeHtml(feature.tag)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
			} else {
				result += escapeHtml(facetText);
			}
		} else {
			result += escapeHtml(facetText);
		}

		lastEnd = byteEnd;
	}

	// Add remaining text
	if (lastEnd < textBytes.length) {
		const remainingBytes = textBytes.slice(lastEnd);
		result += escapeHtml(decoder.decode(remainingBytes));
	}

	return result;
}

/**
 * Get initials from a name for avatar placeholder
 * @param {string} name - Display name
 * @returns {string} Initials (1-2 characters)
 */
function getInitials(name) {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}
	return name.substring(0, 2).toUpperCase();
}

// ============================================================================
// AT Protocol Client Functions
// ============================================================================

/**
 * Parse an AT URI into its components
 * Format: at://did/collection/rkey
 * @param {string} atUri - AT Protocol URI
 * @returns {{did: string, collection: string, rkey: string} | null} Parsed components or null
 */
function parseAtUri(atUri) {
	const match = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
	if (!match) return null;
	return {
		did: match[1],
		collection: match[2],
		rkey: match[3],
	};
}

/**
 * Resolve a DID to its PDS URL
 * Supports did:plc and did:web methods
 * @param {string} did - Decentralized Identifier
 * @returns {Promise<string>} PDS URL
 */
async function resolvePDS(did) {
	let pdsUrl;

	if (did.startsWith("did:plc:")) {
		// Fetch DID document from plc.directory
		const didDocUrl = `https://plc.directory/${did}`;
		const didDocResponse = await fetch(didDocUrl);
		if (!didDocResponse.ok) {
			throw new Error(`Could not fetch DID document: ${didDocResponse.status}`);
		}
		const didDoc = await didDocResponse.json();

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
		const didDoc = await didDocResponse.json();

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
 * @param {string} did - DID of the repository owner
 * @param {string} collection - Collection name
 * @param {string} rkey - Record key
 * @returns {Promise<any>} Record value
 */
async function getRecord(did, collection, rkey) {
	const pdsUrl = await resolvePDS(did);

	const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
	url.searchParams.set("repo", did);
	url.searchParams.set("collection", collection);
	url.searchParams.set("rkey", rkey);

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(`Failed to fetch record: ${response.status}`);
	}

	const data = await response.json();
	return data.value;
}

/**
 * Fetch a document record from its AT URI
 * @param {string} atUri - AT Protocol URI for the document
 * @returns {Promise<{$type: string, title: string, site: string, path: string, textContent: string, publishedAt: string, canonicalUrl?: string, description?: string, tags?: string[], bskyPostRef?: {uri: string, cid: string}}>} Document record
 */
async function getDocument(atUri) {
	const parsed = parseAtUri(atUri);
	if (!parsed) {
		throw new Error(`Invalid AT URI: ${atUri}`);
	}

	return getRecord(parsed.did, parsed.collection, parsed.rkey);
}

/**
 * Fetch a post thread from the public Bluesky API
 * @param {string} postUri - AT Protocol URI for the post
 * @param {number} [depth=6] - Maximum depth of replies to fetch
 * @returns {Promise<ThreadViewPost>} Thread view post
 */
async function getPostThread(postUri, depth = 6) {
	const url = new URL(
		"https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread",
	);
	url.searchParams.set("uri", postUri);
	url.searchParams.set("depth", depth.toString());

	const response = await fetch(url.toString());
	if (!response.ok) {
		throw new Error(`Failed to fetch post thread: ${response.status}`);
	}

	const data = await response.json();

	if (data.thread.$type !== "app.bsky.feed.defs#threadViewPost") {
		throw new Error("Post not found or blocked");
	}

	return data.thread;
}

/**
 * Build a Bluesky app URL for a post
 * @param {string} postUri - AT Protocol URI for the post
 * @returns {string} Bluesky app URL
 */
function buildBskyAppUrl(postUri) {
	const parsed = parseAtUri(postUri);
	if (!parsed) {
		throw new Error(`Invalid post URI: ${postUri}`);
	}

	return `https://bsky.app/profile/${parsed.did}/post/${parsed.rkey}`;
}

/**
 * Type guard for ThreadViewPost
 * @param {any} post - Post to check
 * @returns {boolean} True if post is a ThreadViewPost
 */
function isThreadViewPost(post) {
	return post?.$type === "app.bsky.feed.defs#threadViewPost";
}

// ============================================================================
// Bluesky Icon
// ============================================================================

const BLUESKY_ICON = `<svg class="sequoia-bsky-logo" viewBox="0 0 600 530" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/>
</svg>`;

// ============================================================================
// Web Component
// ============================================================================

// SSR-safe base class - use HTMLElement in browser, empty class in Node.js
const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

class SequoiaComments extends BaseElement {
	constructor() {
		super();
		const shadow = this.attachShadow({ mode: "open" });

		const styleTag = document.createElement("style");
		shadow.appendChild(styleTag);
		styleTag.innerText = styles;

		const container = document.createElement("div");
		shadow.appendChild(container);
		container.className = "sequoia-comments-container";
		container.part = "container";

		this.commentsContainer = container;
		this.state = { type: "loading" };
		this.abortController = null;

	}

	static get observedAttributes() {
		return ["document-uri", "depth", "hide"];
	}

	connectedCallback() {
		this.render();
		this.loadComments();
	}

	disconnectedCallback() {
		this.abortController?.abort();
	}

	attributeChangedCallback() {
		if (this.isConnected) {
			this.loadComments();
		}
	}

	get documentUri() {
		// First check attribute
		const attrUri = this.getAttribute("document-uri");
		if (attrUri) {
			return attrUri;
		}

		// Then scan for link tag in document head
		const linkTag = document.querySelector(
			'link[rel="site.standard.document"]',
		);
		return linkTag?.href ?? null;
	}

	get depth() {
		const depthAttr = this.getAttribute("depth");
		return depthAttr ? parseInt(depthAttr, 10) : 6;
	}

	get hide() {
		const hideAttr = this.getAttribute("hide");
		return hideAttr === "auto";
	}

	async loadComments() {
		// Cancel any in-flight request
		this.abortController?.abort();
		this.abortController = new AbortController();

		this.state = { type: "loading" };
		this.render();

		const docUri = this.documentUri;
		if (!docUri) {
			this.state = { type: "no-document" };
			this.render();
			return;
		}

		try {
			// Fetch the document record
			const document = await getDocument(docUri);

			// Check if document has a Bluesky post reference
			if (!document.bskyPostRef) {
				this.state = { type: "no-comments-enabled" };
				this.render();
				return;
			}

			const postUrl = buildBskyAppUrl(document.bskyPostRef.uri);

			// Fetch the post thread
			const thread = await getPostThread(document.bskyPostRef.uri, this.depth);

			// Check if there are any replies
			const replies = thread.replies?.filter(isThreadViewPost) ?? [];
			if (replies.length === 0) {
				this.state = { type: "empty", postUrl };
				this.render();
				return;
			}

			this.state = { type: "loaded", thread, postUrl };
			this.render();
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to load comments";
			this.state = { type: "error", message };
			this.render();
		}
	}

	render() {
		switch (this.state.type) {
			case "loading":
				this.commentsContainer.innerHTML = `
					<div class="sequoia-loading">
						<span class="sequoia-loading-spinner"></span>
						Loading comments...
					</div>
				`;
				break;

			case "no-document":
				this.commentsContainer.innerHTML = `
					<div class="sequoia-warning">
						No document found. Add a <code>&lt;link rel="site.standard.document" href="at://..."&gt;</code> tag to your page.
					</div>
				`;
				if (this.hide) {
					this.commentsContainer.style.display = 'none';
				}
				break;

			case "no-comments-enabled":
				this.commentsContainer.innerHTML = `
					<div class="sequoia-empty">
						Comments are not enabled for this post.
					</div>
				`;
				break;

			case "empty":
				this.commentsContainer.innerHTML = `
					<div class="sequoia-comments-header">
						<h3 class="sequoia-comments-title">Comments</h3>
						<a href="${this.state.postUrl}" target="_blank" rel="noopener noreferrer" class="sequoia-reply-button">
							${BLUESKY_ICON}
							Reply on Bluesky
						</a>
					</div>
					<div class="sequoia-empty">
						No comments yet. Be the first to reply on Bluesky!
					</div>
				`;
				break;

			case "error":
				this.commentsContainer.innerHTML = `
					<div class="sequoia-error">
						Failed to load comments: ${escapeHtml(this.state.message)}
					</div>
				`;
				break;

			case "loaded": {
				const replies =
					this.state.thread.replies?.filter(isThreadViewPost) ?? [];
				const threadsHtml = replies
					.map((reply) => this.renderThread(reply))
					.join("");
				const commentCount = this.countComments(replies);

				this.commentsContainer.innerHTML = `
					<div class="sequoia-comments-header">
						<h3 class="sequoia-comments-title">${commentCount} Comment${commentCount !== 1 ? "s" : ""}</h3>
						<a href="${this.state.postUrl}" target="_blank" rel="noopener noreferrer" class="sequoia-reply-button">
							${BLUESKY_ICON}
							Reply on Bluesky
						</a>
					</div>
					<div class="sequoia-comments-list">
						${threadsHtml}
					</div>
				`;
				break;
			}
		}
	}

	/**
	 * Flatten a thread into a linear list of comments
	 * @param {ThreadViewPost} thread - Thread to flatten
	 * @returns {Array<{post: any, hasMoreReplies: boolean}>} Flattened comments
	 */
	flattenThread(thread) {
		const result = [];
		const nestedReplies = thread.replies?.filter(isThreadViewPost) ?? [];

		result.push({
			post: thread.post,
			hasMoreReplies: nestedReplies.length > 0,
		});

		// Recursively flatten nested replies
		for (const reply of nestedReplies) {
			result.push(...this.flattenThread(reply));
		}

		return result;
	}

	/**
	 * Render a complete thread (top-level comment + all nested replies)
	 */
	renderThread(thread) {
		const flatComments = this.flattenThread(thread);
		const commentsHtml = flatComments
			.map((item, index) =>
				this.renderComment(item.post, item.hasMoreReplies, index),
			)
			.join("");

		return `<div class="sequoia-thread">${commentsHtml}</div>`;
	}

	/**
	 * Render a single comment
	 * @param {any} post - Post data
	 * @param {boolean} showThreadLine - Whether to show the connecting thread line
	 * @param {number} _index - Index in the flattened thread (0 = top-level)
	 */
	renderComment(post, showThreadLine = false, _index = 0) {
		const author = post.author;
		const displayName = author.displayName || author.handle;
		const avatarHtml = author.avatar
			? `<img class="sequoia-comment-avatar" src="${escapeHtml(author.avatar)}" alt="${escapeHtml(displayName)}" loading="lazy" />`
			: `<div class="sequoia-comment-avatar-placeholder">${getInitials(displayName)}</div>`;

		const profileUrl = `https://bsky.app/profile/${author.did}`;
		const textHtml = renderTextWithFacets(post.record.text, post.record.facets);
		const timeAgo = formatRelativeTime(post.record.createdAt);
		const threadLineHtml = showThreadLine
			? '<div class="sequoia-thread-line"></div>'
			: "";

		return `
			<div class="sequoia-comment">
				<div class="sequoia-comment-avatar-column">
					${avatarHtml}
					${threadLineHtml}
				</div>
				<div class="sequoia-comment-content">
					<div class="sequoia-comment-header">
						<a href="${profileUrl}" target="_blank" rel="noopener noreferrer" class="sequoia-comment-author">
							${escapeHtml(displayName)}
						</a>
						<span class="sequoia-comment-handle">@${escapeHtml(author.handle)}</span>
						<span class="sequoia-comment-time">${timeAgo}</span>
					</div>
					<p class="sequoia-comment-text">${textHtml}</p>
				</div>
			</div>
		`;
	}

	countComments(replies) {
		let count = 0;
		for (const reply of replies) {
			count += 1;
			const nested = reply.replies?.filter(isThreadViewPost) ?? [];
			count += this.countComments(nested);
		}
		return count;
	}
}

// Register the custom element
if (typeof customElements !== "undefined") {
	customElements.define("sequoia-comments", SequoiaComments);
}

// Export for module usage
export { SequoiaComments };
