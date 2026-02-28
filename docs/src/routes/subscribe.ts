import { Agent } from "@atproto/api";
import { Hono } from "hono";
import { createOAuthClient } from "../lib/oauth-client";
import { getSessionDid, setReturnToCookie } from "../lib/session";

interface Env {
	ASSETS: Fetcher;
	SEQUOIA_SESSIONS: KVNamespace;
	CLIENT_URL: string;
}

// Cache the vocs-generated stylesheet href across requests (changes on rebuild).
let _vocsStyleHref: string | null = null;

async function getVocsStyleHref(
	assets: Fetcher,
	baseUrl: string,
): Promise<string> {
	if (_vocsStyleHref) return _vocsStyleHref;
	try {
		const indexUrl = new URL("/", baseUrl).toString();
		const res = await assets.fetch(indexUrl);
		const html = await res.text();
		const match = html.match(/<link[^>]+href="(\/assets\/style[^"]+\.css)"/);
		if (match?.[1]) {
			_vocsStyleHref = match[1];
			return match[1];
		}
	} catch {
		// Fall back to the custom stylesheet which at least provides --sequoia-* vars
	}
	return "/styles.css";
}

const subscribe = new Hono<{ Bindings: Env }>();

const COLLECTION = "site.standard.graph.subscription";
const REDIRECT_DELAY_SECONDS = 5;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Scan the user's repo for an existing site.standard.graph.subscription
 * matching the given publication URI. Returns the record AT-URI if found.
 */
async function findExistingSubscription(
	agent: Agent,
	did: string,
	publicationUri: string,
): Promise<string | null> {
	let cursor: string | undefined;

	do {
		const result = await agent.com.atproto.repo.listRecords({
			repo: did,
			collection: COLLECTION,
			limit: 100,
			cursor,
		});

		for (const record of result.data.records) {
			const value = record.value as { publication?: string };
			if (value.publication === publicationUri) {
				return record.uri;
			}
		}

		cursor = result.data.cursor;
	} while (cursor);

	return null;
}

// ============================================================================
// POST /subscribe
//
// Called via fetch() from the sequoia-subscribe web component.
// Body JSON: { publicationUri: string }
//
// Responses:
//   200 { subscribed: true, existing: boolean, recordUri: string }
//   400 { error: string }
//   401 { authenticated: false, subscribeUrl: string }
// ============================================================================

subscribe.post("/", async (c) => {
	let publicationUri: string;
	try {
		const body = await c.req.json<{ publicationUri?: string }>();
		publicationUri = body.publicationUri ?? "";
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!publicationUri || !publicationUri.startsWith("at://")) {
		return c.json({ error: "Missing or invalid publicationUri" }, 400);
	}

	const did = getSessionDid(c);
	if (!did) {
		const subscribeUrl = `${c.env.CLIENT_URL}/subscribe?publicationUri=${encodeURIComponent(publicationUri)}`;
		return c.json({ authenticated: false, subscribeUrl }, 401);
	}

	try {
		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const session = await client.restore(did);
		const agent = new Agent(session);

		const existingUri = await findExistingSubscription(
			agent,
			did,
			publicationUri,
		);
		if (existingUri) {
			return c.json({
				subscribed: true,
				existing: true,
				recordUri: existingUri,
			});
		}

		const result = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: COLLECTION,
			record: {
				$type: COLLECTION,
				publication: publicationUri,
			},
		});

		return c.json({
			subscribed: true,
			existing: false,
			recordUri: result.data.uri,
		});
	} catch (error) {
		console.error("Subscribe POST error:", error);
		// Treat expired/missing session as unauthenticated
		const subscribeUrl = `${c.env.CLIENT_URL}/subscribe?publicationUri=${encodeURIComponent(publicationUri)}`;
		return c.json({ authenticated: false, subscribeUrl }, 401);
	}
});

// ============================================================================
// GET /subscribe?publicationUri=at://...
//
// Full-page OAuth + subscription flow. Unauthenticated users land here after
// the component redirects them, and authenticated users land here after the
// OAuth callback (via the login_return_to cookie set in POST /subscribe/login).
// ============================================================================

subscribe.get("/", async (c) => {
	const publicationUri = c.req.query("publicationUri");
	const action = c.req.query("action");
	const wantsJson = c.req.header("accept")?.includes("application/json");

	// JSON path: subscription status check for the web component.
	if (wantsJson) {
		if (action && action !== "unsubscribe") {
			return c.json({ error: `Unsupported action: ${action}` }, 400);
		}
		if (!publicationUri || !publicationUri.startsWith("at://")) {
			return c.json({ error: "Missing or invalid publicationUri" }, 400);
		}
		const did = getSessionDid(c);
		if (!did) {
			return c.json({ authenticated: false }, 401);
		}
		try {
			const client = createOAuthClient(
				c.env.SEQUOIA_SESSIONS,
				c.env.CLIENT_URL,
			);
			const session = await client.restore(did);
			const agent = new Agent(session);
			const recordUri = await findExistingSubscription(
				agent,
				did,
				publicationUri,
			);
			return recordUri
				? c.json({ subscribed: true, recordUri })
				: c.json({ subscribed: false });
		} catch {
			return c.json({ authenticated: false }, 401);
		}
	}

	// HTML path: full-page subscribe/unsubscribe flow.
	const styleHref = await getVocsStyleHref(c.env.ASSETS, c.req.url);

	if (action && action !== "unsubscribe") {
		return c.html(renderError(`Unsupported action: ${action}`, styleHref), 400);
	}

	if (!publicationUri || !publicationUri.startsWith("at://")) {
		return c.html(
			renderError("Missing or invalid publication URI.", styleHref),
			400,
		);
	}

	// Prefer an explicit returnTo query param (survives the OAuth round-trip);
	// fall back to the Referer header on the first visit, ignoring self-referrals.
	const referer = c.req.header("referer");
	const returnTo =
		c.req.query("returnTo") ??
		(referer && !referer.includes("/subscribe") ? referer : undefined);

	const did = getSessionDid(c);
	if (!did) {
		return c.html(
			renderHandleForm(publicationUri, styleHref, returnTo, undefined, action),
		);
	}

	try {
		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const session = await client.restore(did);
		const agent = new Agent(session);

		if (action === "unsubscribe") {
			const existingUri = await findExistingSubscription(
				agent,
				did,
				publicationUri,
			);
			if (existingUri) {
				const rkey = existingUri.split("/").pop()!;
				await agent.com.atproto.repo.deleteRecord({
					repo: did,
					collection: COLLECTION,
					rkey,
				});
			}
			return c.html(
				renderSuccess(
					publicationUri,
					null,
					"Unsubscribed ✓",
					existingUri
						? "You've successfully unsubscribed!"
						: "You weren't subscribed to this publication.",
					styleHref,
					returnTo,
				),
			);
		}

		const existingUri = await findExistingSubscription(
			agent,
			did,
			publicationUri,
		);
		if (existingUri) {
			return c.html(
				renderSuccess(
					publicationUri,
					existingUri,
					"Subscribed ✓",
					"You're already subscribed to this publication.",
					styleHref,
					returnTo,
				),
			);
		}

		const result = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: COLLECTION,
			record: {
				$type: COLLECTION,
				publication: publicationUri,
			},
		});

		return c.html(
			renderSuccess(
				publicationUri,
				result.data.uri,
				"Subscribed ✓",
				"You've successfully subscribed!",
				styleHref,
				returnTo,
			),
		);
	} catch (error) {
		console.error("Subscribe GET error:", error);
		// Session expired - ask the user to sign in again
		return c.html(
			renderHandleForm(
				publicationUri,
				styleHref,
				returnTo,
				"Session expired. Please sign in again.",
				action,
			),
		);
	}
});

// ============================================================================
// POST /subscribe/login
//
// Handles the handle-entry form submission. Stores the return URL in a cookie
// so the OAuth callback in auth.ts can redirect back to /subscribe after auth.
// ============================================================================

subscribe.post("/login", async (c) => {
	const body = await c.req.parseBody();
	const handle = (body["handle"] as string | undefined)?.trim();
	const publicationUri = body["publicationUri"] as string | undefined;
	const formReturnTo = (body["returnTo"] as string | undefined) || undefined;
	const formAction = (body["action"] as string | undefined) || undefined;

	if (!handle || !publicationUri) {
		const styleHref = await getVocsStyleHref(c.env.ASSETS, c.req.url);
		return c.html(
			renderError("Missing handle or publication URI.", styleHref),
			400,
		);
	}

	const returnTo =
		`${c.env.CLIENT_URL}/subscribe?publicationUri=${encodeURIComponent(publicationUri)}` +
		(formAction ? `&action=${encodeURIComponent(formAction)}` : "") +
		(formReturnTo ? `&returnTo=${encodeURIComponent(formReturnTo)}` : "");
	setReturnToCookie(c, returnTo, c.env.CLIENT_URL);

	return c.redirect(
		`${c.env.CLIENT_URL}/oauth/login?handle=${encodeURIComponent(handle)}`,
	);
});

// ============================================================================
// HTML rendering
// ============================================================================

function renderHandleForm(
	publicationUri: string,
	styleHref: string,
	returnTo?: string,
	error?: string,
	action?: string,
): string {
	const errorHtml = error
		? `<p class="vocs_Paragraph error">${escapeHtml(error)}</p>`
		: "";
	const returnToInput = returnTo
		? `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />`
		: "";
	const actionInput = action
		? `<input type="hidden" name="action" value="${escapeHtml(action)}" />`
		: "";

	return page(
		`
		<h1 class="vocs_H1 vocs_Heading">Subscribe on Bluesky</h1>
		<p class="vocs_Paragraph">Enter your Bluesky handle to subscribe to this publication.</p>
		${errorHtml}
		<form method="POST" action="/subscribe/login">
			<input type="hidden" name="publicationUri" value="${escapeHtml(publicationUri)}" />
			${returnToInput}
			${actionInput}
			<input
				type="text"
				name="handle"
				placeholder="you.bsky.social"
				autocomplete="username"
				required
				autofocus
			/>
			<button type="submit" class="vocs_Button_button vocs_Button_button_accent">Continue on Bluesky</button>
		</form>
	`,
		styleHref,
	);
}

function renderSuccess(
	publicationUri: string,
	recordUri: string | null,
	heading: string,
	msg: string,
	styleHref: string,
	returnTo?: string,
): string {
	const escapedPublicationUri = escapeHtml(publicationUri);
	const escapedReturnTo = returnTo ? escapeHtml(returnTo) : "";

	const redirectHtml = returnTo
		? `<p class="vocs_Paragraph" id="redirect-msg">Redirecting to <a class="vocs_Anchor" href="${escapedReturnTo}">${escapedReturnTo}</a> in <span id="countdown">${REDIRECT_DELAY_SECONDS}</span>\u00a0seconds\u2026</p>
		<script>
		(function(){
			var secs = ${REDIRECT_DELAY_SECONDS};
			var el = document.getElementById('countdown');
			var iv = setInterval(function(){
				secs--;
				if (el) el.textContent = String(secs);
				if (secs <= 0) { clearInterval(iv); location.href = ${JSON.stringify(returnTo)}; }
			}, 1000);
		})();
		</script>`
		: "";
	const headExtra = returnTo
		? `<meta http-equiv="refresh" content="${REDIRECT_DELAY_SECONDS};url=${escapedReturnTo}" />`
		: "";

	return page(
		`
		<h1 class="vocs_H1 vocs_Heading">${escapeHtml(heading)}</h1>
		<p class="vocs_Paragraph">${msg}</p>
		${redirectHtml}
		<table class="vocs_Table" style="display:table;table-layout:fixed;width:100%;overflow:hidden;">
			<colgroup><col style="width:7rem;"><col></colgroup>
			<tbody>
				<tr class="vocs_TableRow">
					<td class="vocs_TableCell">Publication</td>
					<td class="vocs_TableCell" style="overflow:hidden;">
						<div style="overflow-x:auto;white-space:nowrap;"><code class="vocs_Code"><a href="https://pds.ls/${escapedPublicationUri}">${escapedPublicationUri}</a></code></div>
					</td>
				</tr>
				${
					recordUri
						? `<tr class="vocs_TableRow">
					<td class="vocs_TableCell">Record</td>
					<td class="vocs_TableCell" style="overflow:hidden;">
						<div style="overflow-x:auto;white-space:nowrap;"><code class="vocs_Code"><a href="https://pds.ls/${escapeHtml(recordUri)}">${escapeHtml(recordUri)}</a></code></div>
					</td>
				</tr>`
						: ""
				}
			</tbody>
		</table>
	`,
		styleHref,
		headExtra,
	);
}

function renderError(message: string, styleHref: string): string {
	return page(
		`<h1 class="vocs_H1 vocs_Heading">Error</h1><p class="vocs_Paragraph error">${escapeHtml(message)}</p>`,
		styleHref,
	);
}

function page(body: string, styleHref: string, headExtra = ""): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sequoia · Subscribe</title>
  <link rel="stylesheet" href="${styleHref}" />
  <script>if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')</script>
  ${headExtra}
  <style>
    .page-container {
      max-width: calc(var(--vocs-content_width, 480px) / 1.6);
      margin: 4rem auto;
      padding: 0 var(--vocs-space_20, 1.25rem);
    }
    .vocs_Heading { margin-bottom: var(--vocs-space_12, .75rem); }
    .vocs_Paragraph { margin-bottom: var(--vocs-space_16, 1rem); }
    input[type="text"] {
      padding: var(--vocs-space_8, .5rem) var(--vocs-space_12, .75rem);
      border: 1px solid var(--vocs-color_border, #D5D1C8);
      border-radius: var(--vocs-borderRadius_6, 6px);
      margin-bottom: var(--vocs-space_20, 1.25rem);
	  min-width: 30vh;
	  width: 100%;
      font-size: var(--vocs-fontSize_16, 1rem);
      font-family: inherit;
      background: var(--vocs-color_background, #F5F3EF);
      color: var(--vocs-color_text, #2C2C2C);
    }
    input[type="text"]:focus {
      border-color: var(--vocs-color_borderAccent, #3A5A40);
      outline: 2px solid var(--vocs-color_borderAccent, #3A5A40);
      outline-offset: 2px;
    }
    .error { color: var(--vocs-color_dangerText, #8B3A3A); }
  </style>
</head>
<body>
  <div class="page-container">
    ${body}
  </div>
</body>
</html>`;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export default subscribe;
