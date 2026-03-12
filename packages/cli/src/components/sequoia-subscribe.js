/**
 * Sequoia Subscribe - An AT Protocol-powered subscribe component
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
 *   - button-type: Branding style — "sequoia" (default), "bluesky", "blacksky", "atmosphere", or "plain"
 *   - label: Override the subscribe button label text
 *   - unsubscribe-label: Override the unsubscribe button label text
 *   - hide: Set to "auto" to hide if no publication URI is detected
 *
 * CSS Custom Properties:
 *   - --sequoia-fg-color: Text color (default: #1f2937)
 *   - --sequoia-bg-color: Background color (default: #ffffff)
 *   - --sequoia-border-color: Border color (default: #e5e7eb)
 *   - --sequoia-accent-color: Accent/button color (default: #2563eb)
 *   - --sequoia-secondary-color: Secondary text color (default: #6b7280)
 *   - --sequoia-border-radius: Border radius (default: 8px)
 *   - --sequoia-icon-display: Icon display mode (default: inline-block) — set to "none" to hide
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
	display: var(--sequoia-icon-display, inline-block);
	width: 1rem;
	height: 1rem;
	flex-shrink: 0;
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

const BLACKSKY_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-0.0620117 0.348442 87.9941 74.9653" fill="currentColor"><path d="M41.9565 74.9643L24.0161 74.9653L41.9565 74.9643ZM63.8511 74.9653H45.9097L63.8501 74.9643V57.3286H63.8511V74.9653ZM45.9097 44.5893C45.9099 49.2737 49.7077 53.0707 54.3921 53.0707H63.8501V57.3286H54.3921C49.7077 57.3286 45.9099 61.1257 45.9097 65.81V74.9643H41.9565V65.81C41.9563 61.1258 38.1593 57.3287 33.4751 57.3286H24.0161V53.0707H33.4741C38.1587 53.0707 41.9565 49.2729 41.9565 44.5883V35.1303H45.9097V44.5893ZM63.8511 53.0707H63.8501V35.1303H63.8511V53.0707Z"/><path d="M52.7272 9.83198C49.4148 13.1445 49.4148 18.5151 52.7272 21.8275L59.4155 28.5158L56.4051 31.5262L49.7169 24.8379C46.4044 21.5254 41.0338 21.5254 37.7213 24.8379L31.2482 31.3111L28.4527 28.5156L34.9259 22.0424C38.2383 18.7299 38.2383 13.3594 34.9259 10.0469L28.2378 3.35883L31.2482 0.348442L37.9365 7.03672C41.2489 10.3492 46.6195 10.3492 49.932 7.03672L56.6203 0.348442L59.4155 3.14371L52.7272 9.83198Z"/><path d="M24.3831 23.2335C23.1706 27.7584 25.8559 32.4095 30.3808 33.6219L39.5172 36.07L38.4154 40.182L29.2793 37.734C24.7544 36.5215 20.1033 39.2068 18.8909 43.7317L16.5215 52.5745L12.7028 51.5513L15.0721 42.7088C16.2846 38.1839 13.5993 33.5328 9.07434 32.3204L-0.0620117 29.8723L1.03987 25.76L10.1762 28.2081C14.7011 29.4206 19.3522 26.7352 20.5647 22.2103L23.0127 13.074L26.8311 14.0971L24.3831 23.2335Z"/><path d="M67.3676 22.0297C68.5801 26.5546 73.2311 29.2399 77.756 28.0275L86.8923 25.5794L87.9941 29.6914L78.8578 32.1394C74.3329 33.3519 71.6476 38.003 72.86 42.5279L75.2294 51.3707L71.411 52.3938L69.0417 43.5513C67.8293 39.0264 63.1782 36.3411 58.6533 37.5535L49.5169 40.0016L48.415 35.8894L57.5514 33.4413C62.0763 32.2288 64.7616 27.5778 63.5492 23.0528L61.1011 13.9165L64.9195 12.8934L67.3676 22.0297Z"/></svg>`;

const SEQUOIA_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 95 151" fill="none" stroke="currentColor" stroke-width="10.5" stroke-linecap="round" stroke-linejoin="round"><path d="M47.25 145.217V54.2167M68.25 111.596C74.6356 107.909 79.9382 102.606 83.6245 96.2201C87.3108 89.8341 89.251 82.5902 89.25 75.2167C89.2641 64.2875 85.0033 53.7863 77.378 45.9567C78.8172 41.2475 79.1324 36.2663 78.2981 31.4132C77.4638 26.5601 75.5033 21.9701 72.574 18.0118C69.6448 14.0535 65.8283 10.8371 61.4309 8.62081C57.0335 6.4045 52.1778 5.25 47.2535 5.25C42.3292 5.25 37.4734 6.4045 33.0761 8.62081C28.6787 10.8371 24.8622 14.0535 21.9329 18.0118C19.0037 21.9701 17.0432 26.5601 16.2089 31.4132C15.3746 36.2663 15.6897 41.2475 17.129 45.9567C9.50114 53.7851 5.23776 64.2866 5.25003 75.2167C5.25003 90.7567 13.699 104.337 26.25 111.596M47.25 96.2167L64.75 78.7167M47.25 82.2167L29.75 64.7167M33.25 145.217H61.25"/></svg>`;

const ATMOSPHERE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 114 114" fill="currentColor"><path d="M56.9119 114C48.655 114 41.0566 112.632 34.1167 109.896C27.1769 107.16 21.1488 103.284 16.0326 98.268C10.9125 93.2969 6.87661 87.3195 4.17911 80.712C1.39304 73.9733 0 66.652 0 58.748C0 49.324 1.44369 40.964 4.33108 33.668C7.26912 26.372 11.3216 20.2413 16.4885 15.276C21.6743 10.2798 27.829 6.39999 34.5726 3.876C41.4618 1.292 48.8322 0 56.6839 0C66.3085 0 74.7427 1.49467 81.9865 4.484C89.2303 7.47333 95.2583 11.5267 100.071 16.644C104.833 21.6798 108.483 27.6613 110.784 34.2C113.115 40.736 114.178 47.576 113.976 54.72C113.722 64.5493 111.671 72.0986 107.821 77.368C103.971 82.5866 97.9938 85.196 89.8888 85.196C85.7259 85.2315 81.6218 84.2118 77.9594 82.232C74.4587 80.3688 71.7969 77.2446 70.513 73.492L74.92 73.72C72.8431 77.6213 70.0064 80.3573 66.4098 81.928C62.9411 83.4714 59.1886 84.2738 55.3922 84.284C50.2759 84.284 45.7676 83.1946 41.8671 81.016C37.9939 78.8144 34.8103 75.5775 32.673 71.668C30.4442 67.6653 29.3297 63.0293 29.3297 57.76C29.3297 52.3387 30.4948 47.652 32.825 43.7C35.0512 39.7998 38.3119 36.5909 42.247 34.428C46.1981 32.2493 50.6559 31.16 55.6201 31.16C58.9128 31.16 62.332 31.844 65.8779 33.212C69.4745 34.58 72.2606 36.5053 74.2362 38.988L71.1208 42.94V33.288H81.3027L81.0747 60.572C81.0747 64.4733 81.8345 67.412 83.3542 69.388C84.8739 71.364 87.1281 72.352 90.1168 72.352C92.7509 72.352 94.7771 71.6173 96.1955 70.148C97.6645 68.628 98.6776 66.576 99.2348 63.992C99.8841 61.0707 100.24 58.092 100.299 55.1C100.451 47.2467 99.2855 40.6347 96.8033 35.264C94.3212 29.8933 90.9526 25.5613 86.6975 22.268C82.5822 18.9703 77.857 16.5168 72.7925 15.048C67.7269 13.528 62.6866 12.768 57.6717 12.768C50.5799 12.768 44.2732 13.908 38.7517 16.188C33.2302 18.4173 28.5699 21.584 24.7707 25.688C21.0222 29.7413 18.1855 34.5547 16.2605 40.128C14.3863 45.6507 13.4998 51.7307 13.6011 58.368C13.8037 64.9547 14.9941 70.8826 17.1723 76.152C19.2339 81.2487 22.3399 85.857 26.2904 89.68C30.2557 93.4697 34.9649 96.3941 40.1194 98.268C45.4383 100.244 51.2637 101.232 57.5957 101.232C61.1416 101.232 64.6622 100.827 68.1575 100.016C71.7034 99.256 74.9453 98.1666 77.8834 96.748L82.2145 108.604C78.314 110.428 74.2108 111.771 69.9051 112.632C65.6345 113.546 61.2791 114.004 56.9119 114ZM56.304 71.364C59.9006 71.364 62.9146 70.3253 65.3461 68.248C67.7775 66.1706 68.9933 62.6493 68.9933 57.684C68.9933 53.1747 67.9042 49.78 65.726 47.5C63.5984 45.1693 60.5844 44.004 56.6839 44.004C52.0742 44.004 48.6296 45.22 46.3501 47.652C44.0706 50.084 42.9308 53.428 42.9308 57.684C42.9308 62.0413 44.0959 65.4106 46.4261 67.792C48.8069 70.1733 52.0996 71.364 56.304 71.364Z"/></svg>`;

// ============================================================================
// Button Type Configuration
// ============================================================================

const BUTTON_TYPES = {
	sequoia: {
		icon: SEQUOIA_ICON,
		subscribe: "Subscribe on Sequoia",
		unsubscribe: "Unsubscribe",
	},
	bluesky: {
		icon: BLUESKY_ICON,
		subscribe: "Subscribe on Bluesky",
		unsubscribe: "Unsubscribe",
	},
	blacksky: {
		icon: BLACKSKY_ICON,
		subscribe: "Subscribe on Blacksky",
		unsubscribe: "Unsubscribe",
	},
	atmosphere: {
		icon: ATMOSPHERE_ICON,
		subscribe: "Subscribe on Atmosphere",
		unsubscribe: "Unsubscribe",
	},
	plain: { icon: "", subscribe: "Subscribe", unsubscribe: "Unsubscribe" },
};

// ============================================================================
// DID Storage
// ============================================================================

/**
 * Store the subscriber DID. Tries a cookie first; falls back to localStorage.
 * @param {string} did
 */
function storeSubscriberDid(did) {
	try {
		const expires = new Date(
			Date.now() + 365 * 24 * 60 * 60 * 1000,
		).toUTCString();
		document.cookie = `sequoia_did=${encodeURIComponent(did)}; Expires=${expires}; Path=/; SameSite=Lax; Secure`;
	} catch {
		// Cookie write may fail in some embedded contexts
	}
	try {
		localStorage.setItem("sequoia_did", did);
	} catch {
		// localStorage may be unavailable
	}
}

/**
 * Retrieve the stored subscriber DID. Checks cookie first, then localStorage.
 * @returns {string | null}
 */
function getStoredSubscriberDid() {
	try {
		const match = document.cookie.match(/(?:^|;\s*)sequoia_did=([^;]+)/);
		if (match) {
			const did = decodeURIComponent(match[1]);
			if (did.startsWith("did:")) return did;
		}
	} catch {
		// ignore
	}
	try {
		const did = localStorage.getItem("sequoia_did");
		if (did?.startsWith("did:")) return did;
	} catch {
		// ignore
	}
	return null;
}

/**
 * Remove the stored subscriber DID from both cookie and localStorage.
 */
function clearSubscriberDid() {
	try {
		document.cookie =
			"sequoia_did=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax; Secure";
	} catch {
		// ignore
	}
	try {
		localStorage.removeItem("sequoia_did");
	} catch {
		// ignore
	}
}

/**
 * Check the current page URL for sequoia_did / sequoia_unsubscribed params
 * set by the subscribe redirect flow. Consumes them by removing from the URL.
 */
function consumeReturnParams() {
	const url = new URL(window.location.href);
	const did = url.searchParams.get("sequoia_did");
	const unsubscribed = url.searchParams.get("sequoia_unsubscribed");

	let changed = false;

	if (unsubscribed === "1") {
		clearSubscriberDid();
		url.searchParams.delete("sequoia_unsubscribed");
		changed = true;
	}

	if (did && did.startsWith("did:")) {
		storeSubscriberDid(did);
		url.searchParams.delete("sequoia_did");
		changed = true;
	}

	if (changed) {
		const cleanUrl = url.pathname + (url.search || "") + (url.hash || "");
		try {
			window.history.replaceState(null, "", cleanUrl);
		} catch {
			// ignore
		}
	}
}

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
		this.subscribed = false;
		this.state = { type: "idle" };
		this.abortController = null;
		this.render();
	}

	static get observedAttributes() {
		return [
			"publication-uri",
			"callback-uri",
			"label",
			"unsubscribe-label",
			"button-type",
			"hide",
		];
	}

	connectedCallback() {
		consumeReturnParams();
		this.checkPublication();
	}

	disconnectedCallback() {
		this.abortController?.abort();
	}

	attributeChangedCallback() {
		if (this.state.type === "error" || this.state.type === "no-publication") {
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
		return this.getAttribute("label") ?? null;
	}

	get unsubscribeLabel() {
		return this.getAttribute("unsubscribe-label") ?? null;
	}

	get buttonType() {
		const val = this.getAttribute("button-type");
		return val && val in BUTTON_TYPES ? val : "sequoia";
	}

	get hide() {
		const hideAttr = this.getAttribute("hide");
		return hideAttr === "auto";
	}

	async checkPublication() {
		this.abortController?.abort();
		this.abortController = new AbortController();

		try {
			const uri = this.publicationUri ?? (await fetchPublicationUri());
			this.checkSubscription(uri);
		} catch {
			this.state = { type: "no-publication" };
			this.render();
		}
	}

	async checkSubscription(publicationUri) {
		try {
			const checkUrl = new URL(`${this.callbackUri}/check`);
			checkUrl.searchParams.set("publicationUri", publicationUri);

			// Pass the stored DID so the server can check without a session cookie
			const storedDid = getStoredSubscriberDid();
			if (storedDid) {
				checkUrl.searchParams.set("did", storedDid);
			}

			const res = await fetch(checkUrl.toString(), {
				credentials: "include",
			});
			if (!res.ok) return;
			const data = await res.json();
			if (data.subscribed) {
				this.subscribed = true;
				this.render();
			}
		} catch {
			// Ignore errors — show default subscribe button
		}
	}

	async handleClick() {
		if (this.state.type === "loading") {
			return;
		}

		// Unsubscribe: redirect to full-page unsubscribe flow
		if (this.subscribed) {
			const publicationUri =
				this.publicationUri ?? (await fetchPublicationUri());
			window.location.href = `${this.callbackUri}?publicationUri=${encodeURIComponent(publicationUri)}&action=unsubscribe`;
			return;
		}

		this.state = { type: "loading" };
		this.render();

		try {
			const publicationUri =
				this.publicationUri ?? (await fetchPublicationUri());

			const response = await fetch(this.callbackUri, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				credentials: "include",
				referrerPolicy: "no-referrer-when-downgrade",
				body: JSON.stringify({ publicationUri }),
			});

			const data = await response.json();

			if (response.status === 401 && data.authenticated === false) {
				// Redirect to the hosted subscribe page to complete OAuth,
				// passing the current page URL (without credentials) as returnTo.
				const subscribeUrl = new URL(data.subscribeUrl);
				const pageUrl = new URL(window.location.href);
				pageUrl.username = "";
				pageUrl.password = "";
				subscribeUrl.searchParams.set("returnTo", pageUrl.toString());
				window.location.href = subscribeUrl.toString();
				return;
			}

			if (!response.ok) {
				throw new Error(data.error ?? `HTTP ${response.status}`);
			}

			const { recordUri } = data;

			// Store the DID from the record URI (at://did:aaa:bbb/...)
			if (recordUri) {
				const didMatch = recordUri.match(/^at:\/\/(did:[^/]+)/);
				if (didMatch) {
					storeSubscriberDid(didMatch[1]);
				}
			}

			this.subscribed = true;
			this.state = { type: "idle" };
			this.render();

			this.dispatchEvent(
				new CustomEvent("sequoia-subscribed", {
					bubbles: true,
					composed: true,
					detail: { publicationUri, recordUri },
				}),
			);
		} catch (error) {
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
		const config = BUTTON_TYPES[this.buttonType] ?? BUTTON_TYPES.sequoia;

		const icon = isLoading
			? `<span class="sequoia-loading-spinner"></span>`
			: config.icon;

		const label = this.subscribed
			? (this.unsubscribeLabel ?? config.unsubscribe)
			: (this.label ?? config.subscribe);

		const errorHtml =
			type === "error"
				? `<span class="sequoia-error-message">${escapeHtml(this.state.message)}</span>`
				: "";

		this.wrapper.innerHTML = `
			<button
				class="sequoia-subscribe-button"
				type="button"
				part="button"
				${isLoading ? "disabled" : ""}
				aria-label="${label}"
			>
				${icon}
				${label}
			</button>
			${errorHtml}
		`;

		const btn = this.wrapper.querySelector("button");
		btn?.addEventListener("click", () => this.handleClick());
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
