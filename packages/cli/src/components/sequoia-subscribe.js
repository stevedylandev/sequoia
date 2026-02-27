/**
 * Sequoia Subscribe - A Bluesky-powered subscribe component
 *
 * A self-contained Web Component that lets users subscribe to a publication
 * via the AT Protocol by creating a site.standard.graph.subscription record.
 *
 * Usage:
 *   <sequoia-subscribe></sequoia-subscribe>
 *
 * The component resolves the publication AT URI from the host site's
 * /.well-known/site.standard.publication endpoint.
 *
 * Attributes:
 *   - publication-uri: Override the publication AT URI (optional)
 *   - callback-uri: Redirect URI after OAuth authentication (default: "https://sequoia.pub/subscribe")
 *   - label: Button label text (default: "Subscribe on Bluesky")
 *   - hide: Set to "auto" to hide if no publication URI is detected
 *
 * CSS Custom Properties:
 *   - --sequoia-fg-color: Text color (default: #1f2937)
 *   - --sequoia-bg-color: Background color (default: #ffffff)
 *   - --sequoia-border-color: Border color (default: #e5e7eb)
 *   - --sequoia-accent-color: Accent/button color (default: #2563eb)
 *   - --sequoia-secondary-color: Secondary text color (default: #6b7280)
 *   - --sequoia-border-radius: Border radius (default: 8px)
 *
 * Events:
 *   - sequoia-subscribed: Fired when the subscription is created successfully.
 *     detail: { publicationUri: string, recordUri: string }
 *   - sequoia-subscribe-error: Fired when the subscription fails.
 *     detail: { message: string }
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

.sequoia-subscribe-button {
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
	font-family: inherit;
}

.sequoia-subscribe-button:hover:not(:disabled) {
	background: color-mix(in srgb, var(--sequoia-accent-color, #2563eb) 85%, black);
}

.sequoia-subscribe-button:disabled {
	opacity: 0.6;
	cursor: not-allowed;
}

.sequoia-subscribe-button svg {
	width: 1rem;
	height: 1rem;
	flex-shrink: 0;
}

.sequoia-subscribe-button--success {
	background: #16a34a;
}

.sequoia-subscribe-button--success:hover:not(:disabled) {
	background: color-mix(in srgb, #16a34a 85%, black);
}

.sequoia-loading-spinner {
	display: inline-block;
	width: 1rem;
	height: 1rem;
	border: 2px solid rgba(255, 255, 255, 0.4);
	border-top-color: #ffffff;
	border-radius: 50%;
	animation: sequoia-spin 0.8s linear infinite;
	flex-shrink: 0;
}

@keyframes sequoia-spin {
	to { transform: rotate(360deg); }
}

.sequoia-error-message {
	display: inline-block;
	font-size: 0.8125rem;
	color: #dc2626;
	margin-top: 0.375rem;
}
`;

// ============================================================================
// Icons
// ============================================================================

const BLUESKY_ICON = `<svg class="sequoia-bsky-logo" viewBox="0 0 600 530" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/>
</svg>`;

const CHECK_ICON = `<svg viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
</svg>`;

// ============================================================================
// AT Protocol Functions
// ============================================================================

/**
 * Fetch the publication AT URI from the host site's well-known endpoint.
 * @param {string} [origin] - Origin to fetch from (defaults to current page origin)
 * @returns {Promise<string>} Publication AT URI
 */
async function fetchPublicationUri(origin) {
	const base = origin ?? window.location.origin;
	const url = `${base}/.well-known/site.standard.publication`;
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Could not fetch publication URI: ${response.status}`);
	}

	// Accept either plain text (the AT URI itself) or JSON with a `uri` field.
	const contentType = response.headers.get("content-type") ?? "";
	if (contentType.includes("application/json")) {
		const data = await response.json();
		const uri = data?.uri ?? data?.atUri ?? data?.publication;
		if (!uri) {
			throw new Error("Publication response did not contain a URI");
		}
		return uri;
	}

	const text = (await response.text()).trim();
	if (!text.startsWith("at://")) {
		throw new Error(`Unexpected publication URI format: ${text}`);
	}
	return text;
}

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
		styleTag.innerText = styles;
		shadow.appendChild(styleTag);

		const wrapper = document.createElement("div");
		shadow.appendChild(wrapper);
		wrapper.part = "container";

		this.wrapper = wrapper;
		this.state = { type: "idle" };
		this.abortController = null;
		this.render();
	}

	static get observedAttributes() {
		return ["publication-uri", "callback-uri", "label", "hide"];
	}

	connectedCallback() {
		// Pre-check publication availability so hide="auto" can take effect
		if (!this.publicationUri) {
			this.checkPublication();
		}
	}

	disconnectedCallback() {
		this.abortController?.abort();
	}

	attributeChangedCallback() {
		// Reset to idle if attributes change after an error or success
		if (
			this.state.type === "error" ||
			this.state.type === "subscribed" ||
			this.state.type === "no-publication"
		) {
			this.state = { type: "idle" };
		}
		this.render();
	}

	get publicationUri() {
		return this.getAttribute("publication-uri") ?? null;
	}

	get callbackUri() {
		return this.getAttribute("callback-uri") ?? "https://sequoia.pub/subscribe";
	}

	get label() {
		return this.getAttribute("label") ?? "Subscribe on Bluesky";
	}

	get hide() {
		const hideAttr = this.getAttribute("hide");
		return hideAttr === "auto";
	}

	async checkPublication() {
		this.abortController?.abort();
		this.abortController = new AbortController();

		try {
			await fetchPublicationUri();
		} catch {
			this.state = { type: "no-publication" };
			this.render();
		}
	}

	async handleClick() {
		if (this.state.type === "loading" || this.state.type === "subscribed") {
			return;
		}

		this.state = { type: "loading" };
		this.render();

		try {
			const publicationUri =
				this.publicationUri ?? (await fetchPublicationUri());

			// POST to the callbackUri (e.g. https://sequoia.pub/subscribe).
			// If the server reports the user isn't authenticated it returns a
			// subscribeUrl for the full-page OAuth + subscription flow.
			const response = await fetch(this.callbackUri, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ publicationUri }),
			});

			const data = await response.json();

			if (response.status === 401 && data.authenticated === false) {
				// Redirect to the hosted subscribe page to complete OAuth
				window.location.href = data.subscribeUrl;
				return;
			}

			if (!response.ok) {
				throw new Error(data.error ?? `HTTP ${response.status}`);
			}

			const { recordUri } = data;
			this.state = { type: "subscribed", recordUri, publicationUri };
			this.render();

			this.dispatchEvent(
				new CustomEvent("sequoia-subscribed", {
					bubbles: true,
					composed: true,
					detail: { publicationUri, recordUri },
				}),
			);
		} catch (error) {
			// Don't overwrite state if we already navigated away
			if (this.state.type !== "loading") return;

			const message =
				error instanceof Error ? error.message : "Failed to subscribe";
			this.state = { type: "error", message };
			this.render();

			this.dispatchEvent(
				new CustomEvent("sequoia-subscribe-error", {
					bubbles: true,
					composed: true,
					detail: { message },
				}),
			);
		}
	}

	render() {
		const { type } = this.state;

		if (type === "no-publication") {
			if (this.hide) {
				this.wrapper.innerHTML = "";
				this.wrapper.style.display = "none";
			}
			return;
		}

		const isLoading = type === "loading";
		const isSubscribed = type === "subscribed";

		const icon = isLoading
			? `<span class="sequoia-loading-spinner"></span>`
			: isSubscribed
				? CHECK_ICON
				: BLUESKY_ICON;

		const label = isSubscribed ? "Subscribed" : this.label;
		const buttonClass = [
			"sequoia-subscribe-button",
			isSubscribed ? "sequoia-subscribe-button--success" : "",
		]
			.filter(Boolean)
			.join(" ");

		const errorHtml =
			type === "error"
				? `<span class="sequoia-error-message">${escapeHtml(this.state.message)}</span>`
				: "";

		this.wrapper.innerHTML = `
			<button
				class="${buttonClass}"
				type="button"
				part="button"
				${isLoading || isSubscribed ? "disabled" : ""}
				aria-label="${isSubscribed ? "Subscribed" : this.label}"
			>
				${icon}
				${label}
			</button>
			${errorHtml}
		`;

		if (type !== "subscribed") {
			const btn = this.wrapper.querySelector("button");
			btn?.addEventListener("click", () => this.handleClick());
		}
	}
}

/**
 * Escape HTML special characters (no DOM dependency for SSR).
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// Register the custom element
if (typeof customElements !== "undefined") {
	customElements.define("sequoia-subscribe", SequoiaSubscribe);
}

// Export for module usage
export { SequoiaSubscribe };
