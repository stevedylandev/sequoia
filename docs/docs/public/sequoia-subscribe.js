/**
 * Sequoia Subscribe - A Bluesky-powered subscribe button
 *
 * A self-contained Web Component that lets readers subscribe to AT Protocol
 * publications directly from your website via OAuth.
 *
 * Usage:
 *   <sequoia-subscribe></sequoia-subscribe>
 *
 * The component looks for a publication URI in three places (in priority order):
 *   1. The `publication-uri` attribute on the element
 *   2. A <link rel="site.standard.publication" href="at://..."> tag in the document head
 *   3. Fetch /.well-known/site.standard.publication from current origin
 *
 * Attributes:
 *   - publication-uri: AT URI of the publication (optional if discovered automatically)
 *   - callback-url: Override callback URL (default: https://sequoia.pub/subscribe)
 *   - hide: Set to "auto" to hide if no publication URI found
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
	display: inline-block;
	font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	color: var(--sequoia-fg-color, #1f2937);
	line-height: 1.5;
}

* {
	box-sizing: border-box;
}

.sequoia-subscribe-container {
	display: inline-block;
}

.sequoia-subscribe-button {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1.125rem;
	background: var(--sequoia-accent-color, #2563eb);
	color: #ffffff;
	border: none;
	border-radius: var(--sequoia-border-radius, 8px);
	font-size: 0.9375rem;
	font-weight: 500;
	cursor: pointer;
	text-decoration: none;
	transition: background-color 0.15s ease, opacity 0.15s ease;
	font-family: inherit;
}

.sequoia-subscribe-button:hover:not(:disabled) {
	background: color-mix(in srgb, var(--sequoia-accent-color, #2563eb) 85%, black);
}

.sequoia-subscribe-button:disabled {
	opacity: 0.7;
	cursor: not-allowed;
}

.sequoia-subscribe-button svg {
	width: 1.125rem;
	height: 1.125rem;
	flex-shrink: 0;
}

.sequoia-success {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	background: #f0fdf4;
	border: 1px solid #86efac;
	color: #15803d;
	border-radius: var(--sequoia-border-radius, 8px);
	font-size: 0.875rem;
	font-weight: 500;
}

.sequoia-error-inline {
	display: inline-flex;
	align-items: center;
	gap: 0.5rem;
	padding: 0.5rem 1rem;
	background: #fef2f2;
	border: 1px solid #fecaca;
	color: #dc2626;
	border-radius: var(--sequoia-border-radius, 8px);
	font-size: 0.875rem;
}
`;

// ============================================================================
// Icons
// ============================================================================

const BELL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
</svg>`;

// ============================================================================
// Web Component
// ============================================================================

// SSR-safe base class - use HTMLElement in browser, empty class in Node.js
const BaseElement = typeof HTMLElement !== "undefined" ? HTMLElement : class {};

class SequoiaSubscribe extends BaseElement {
	constructor() {
		super();
		const shadow = this.attachShadow({ mode: "open" });

		const styleTag = document.createElement("style");
		shadow.appendChild(styleTag);
		styleTag.innerText = styles;

		const container = document.createElement("div");
		shadow.appendChild(container);
		container.className = "sequoia-subscribe-container";
		container.part = "container";

		this.subscribeContainer = container;
		this.state = { type: "loading" };
	}

	static get observedAttributes() {
		return ["publication-uri", "callback-url", "hide"];
	}

	connectedCallback() {
		// Check for return state from OAuth callback first
		const returnState = this._checkReturnState();
		if (returnState) {
			this.state = returnState;
			this.render();
			// Auto-clear feedback after 5 seconds, then rediscover
			setTimeout(() => {
				const url = new URL(window.location.href);
				url.searchParams.delete("subscribed");
				url.searchParams.delete("subscribe_error");
				history.replaceState(null, "", url.toString());
				this.discover();
			}, 5000);
			return;
		}
		this.discover();
	}

	attributeChangedCallback() {
		if (this.isConnected) {
			this.discover();
		}
	}

	_checkReturnState() {
		if (typeof window === "undefined") return null;
		const params = new URLSearchParams(window.location.search);
		if (params.get("subscribed") === "true") {
			return { type: "subscribed" };
		}
		const errMsg = params.get("subscribe_error");
		if (errMsg) {
			return { type: "error", message: decodeURIComponent(errMsg) };
		}
		return null;
	}

	get publicationUri() {
		return this.getAttribute("publication-uri");
	}

	get callbackUrl() {
		return (
			this.getAttribute("callback-url") || "https://sequoia.pub/subscribe"
		);
	}

	get hideAuto() {
		return this.getAttribute("hide") === "auto";
	}

	async discover() {
		this.state = { type: "loading" };
		this.render();

		// 1. Check attribute
		const attrUri = this.publicationUri;
		if (attrUri) {
			this.state = { type: "idle", pubUri: attrUri };
			this.render();
			return;
		}

		// 2. Check <link rel="site.standard.publication"> tag
		const linkTag = document.querySelector(
			'link[rel="site.standard.publication"]',
		);
		const linkHref = linkTag?.getAttribute("href");
		if (linkHref?.startsWith("at://")) {
			this.state = { type: "idle", pubUri: linkHref };
			this.render();
			return;
		}

		// 3. Fetch /.well-known/site.standard.publication
		try {
			const resp = await fetch("/.well-known/site.standard.publication");
			if (resp.ok) {
				const text = await resp.text();
				const uri = text.trim();
				if (uri.startsWith("at://")) {
					this.state = { type: "idle", pubUri: uri };
					this.render();
					return;
				}
			}
		} catch {
			// Network error or not found - fall through to no-publication
		}

		this.state = { type: "no-publication" };
		this.render();
	}

	_onSubscribeClick() {
		if (this.state.type !== "idle") return;
		const pubUri = this.state.pubUri;
		const returnUrl = window.location.href;

		const url = new URL(this.callbackUrl);
		url.searchParams.set("pub", pubUri);
		url.searchParams.set("return", returnUrl);

		this.state = { type: "redirecting" };
		this.render();
		window.location.href = url.toString();
	}

	_escapeHtml(text) {
		const div = document.createElement("div");
		div.textContent = text;
		return div.innerHTML;
	}

	render() {
		switch (this.state.type) {
			case "loading":
				this.subscribeContainer.innerHTML = `
					<button class="sequoia-subscribe-button" disabled part="button">
						${BELL_ICON}
						Subscribe with Bluesky
					</button>
				`;
				break;

			case "no-publication":
				if (this.hideAuto) {
					this.subscribeContainer.innerHTML = "";
					this.style.display = "none";
				} else {
					this.subscribeContainer.innerHTML = `
						<button class="sequoia-subscribe-button" disabled part="button">
							${BELL_ICON}
							Subscribe with Bluesky
						</button>
					`;
				}
				break;

			case "idle": {
				const btn = document.createElement("button");
				btn.className = "sequoia-subscribe-button";
				btn.setAttribute("part", "button");
				btn.innerHTML = `${BELL_ICON} Subscribe with Bluesky`;
				btn.addEventListener("click", () => this._onSubscribeClick());
				this.subscribeContainer.innerHTML = "";
				this.subscribeContainer.appendChild(btn);
				break;
			}

			case "redirecting":
				this.subscribeContainer.innerHTML = `
					<button class="sequoia-subscribe-button" disabled part="button">
						${BELL_ICON}
						Redirecting...
					</button>
				`;
				break;

			case "subscribed":
				this.subscribeContainer.innerHTML = `
					<span class="sequoia-success" part="success">
						&#10003; Subscribed!
					</span>
				`;
				break;

			case "error":
				this.subscribeContainer.innerHTML = `
					<span class="sequoia-error-inline" part="error">
						Failed to subscribe: ${this._escapeHtml(this.state.message || "Unknown error")}
					</span>
				`;
				break;
		}
	}
}

// Register the custom element
if (typeof customElements !== "undefined") {
	customElements.define("sequoia-subscribe", SequoiaSubscribe);
}

// Export for module usage
export { SequoiaSubscribe };
