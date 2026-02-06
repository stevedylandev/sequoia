import {
	buildBskyAppUrl,
	getDocument,
	getPostThread,
} from "../../lib/atproto-client";
import type { ThreadViewPost } from "../../types/bluesky";
import { isThreadViewPost } from "../../types/bluesky";
import { styles } from "./styles";
import { formatRelativeTime, getInitials, renderTextWithFacets } from "./utils";

/**
 * Component state
 */
type State =
	| { type: "loading" }
	| { type: "loaded"; thread: ThreadViewPost; postUrl: string }
	| { type: "no-document" }
	| { type: "no-comments-enabled" }
	| { type: "empty"; postUrl: string }
	| { type: "error"; message: string };

/**
 * Bluesky butterfly SVG icon
 */
const BLUESKY_ICON = `<svg class="sequoia-bsky-logo" viewBox="0 0 600 530" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/>
</svg>`;

// SSR-safe base class - use HTMLElement in browser, empty class in Node.js
const BaseElement =
	typeof HTMLElement !== "undefined"
		? HTMLElement
		: (class {} as typeof HTMLElement);

export class SequoiaComments extends BaseElement {
	private shadow: ShadowRoot;
	private state: State = { type: "loading" };
	private abortController: AbortController | null = null;

	static get observedAttributes(): string[] {
		return ["document-uri", "depth"];
	}

	constructor() {
		super();
		this.shadow = this.attachShadow({ mode: "open" });
	}

	connectedCallback(): void {
		this.render();
		this.loadComments();
	}

	disconnectedCallback(): void {
		this.abortController?.abort();
	}

	attributeChangedCallback(): void {
		if (this.isConnected) {
			this.loadComments();
		}
	}

	private get documentUri(): string | null {
		// First check attribute
		const attrUri = this.getAttribute("document-uri");
		if (attrUri) {
			return attrUri;
		}

		// Then scan for link tag in document head
		const linkTag = document.querySelector<HTMLLinkElement>(
			'link[rel="site.standard.document"]',
		);
		return linkTag?.href ?? null;
	}

	private get depth(): number {
		const depthAttr = this.getAttribute("depth");
		return depthAttr ? Number.parseInt(depthAttr, 10) : 6;
	}

	private async loadComments(): Promise<void> {
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

	private render(): void {
		const styleTag = `<style>${styles}</style>`;

		switch (this.state.type) {
			case "loading":
				this.shadow.innerHTML = `
					${styleTag}
					<div class="sequoia-comments-container">
						<div class="sequoia-loading">
							<span class="sequoia-loading-spinner"></span>
							Loading comments...
						</div>
					</div>
				`;
				break;

			case "no-document":
				this.shadow.innerHTML = `
					${styleTag}
					<div class="sequoia-comments-container">
						<div class="sequoia-warning">
							No document found. Add a <code>&lt;link rel="site.standard.document" href="at://..."&gt;</code> tag to your page.
						</div>
					</div>
				`;
				break;

			case "no-comments-enabled":
				this.shadow.innerHTML = `
					${styleTag}
					<div class="sequoia-comments-container">
						<div class="sequoia-empty">
							Comments are not enabled for this post.
						</div>
					</div>
				`;
				break;

			case "empty":
				this.shadow.innerHTML = `
					${styleTag}
					<div class="sequoia-comments-container">
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
					</div>
				`;
				break;

			case "error":
				this.shadow.innerHTML = `
					${styleTag}
					<div class="sequoia-comments-container">
						<div class="sequoia-error">
							Failed to load comments: ${this.escapeHtml(this.state.message)}
						</div>
					</div>
				`;
				break;

			case "loaded": {
				const replies = this.state.thread.replies?.filter(isThreadViewPost) ?? [];
				const commentsHtml = replies.map((reply) => this.renderComment(reply)).join("");
				const commentCount = this.countComments(replies);

				this.shadow.innerHTML = `
					${styleTag}
					<div class="sequoia-comments-container">
						<div class="sequoia-comments-header">
							<h3 class="sequoia-comments-title">${commentCount} Comment${commentCount !== 1 ? "s" : ""}</h3>
							<a href="${this.state.postUrl}" target="_blank" rel="noopener noreferrer" class="sequoia-reply-button">
								${BLUESKY_ICON}
								Reply on Bluesky
							</a>
						</div>
						<div class="sequoia-comments-list">
							${commentsHtml}
						</div>
					</div>
				`;
				break;
			}
		}
	}

	private renderComment(thread: ThreadViewPost): string {
		const { post } = thread;
		const author = post.author;
		const displayName = author.displayName || author.handle;
		const avatarHtml = author.avatar
			? `<img class="sequoia-comment-avatar" src="${this.escapeHtml(author.avatar)}" alt="${this.escapeHtml(displayName)}" loading="lazy" />`
			: `<div class="sequoia-comment-avatar-placeholder">${getInitials(displayName)}</div>`;

		const profileUrl = `https://bsky.app/profile/${author.did}`;
		const textHtml = renderTextWithFacets(post.record.text, post.record.facets);
		const timeAgo = formatRelativeTime(post.record.createdAt);

		// Render nested replies
		const nestedReplies = thread.replies?.filter(isThreadViewPost) ?? [];
		const repliesHtml =
			nestedReplies.length > 0
				? `<div class="sequoia-comment-replies">${nestedReplies.map((r) => this.renderComment(r)).join("")}</div>`
				: "";

		return `
			<div class="sequoia-comment">
				<div class="sequoia-comment-header">
					${avatarHtml}
					<div class="sequoia-comment-meta">
						<a href="${profileUrl}" target="_blank" rel="noopener noreferrer" class="sequoia-comment-author">
							${this.escapeHtml(displayName)}
						</a>
						<span class="sequoia-comment-handle">@${this.escapeHtml(author.handle)}</span>
					</div>
					<span class="sequoia-comment-time">${timeAgo}</span>
				</div>
				<p class="sequoia-comment-text">${textHtml}</p>
				${repliesHtml}
			</div>
		`;
	}

	private countComments(replies: ThreadViewPost[]): number {
		let count = 0;
		for (const reply of replies) {
			count += 1;
			const nested = reply.replies?.filter(isThreadViewPost) ?? [];
			count += this.countComments(nested);
		}
		return count;
	}

	private escapeHtml(text: string): string {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}
}
