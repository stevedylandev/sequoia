import { Agent } from "@atproto/api";
import { Hono } from "hono";
import { createOAuthClient } from "../lib/oauth-client";
import { getSessionDid, setReturnToCookie } from "../lib/session";
import {
	findExistingRecord,
	renderError,
	renderHandleForm,
	renderSuccess,
	withReturnToParam,
} from "./lib";

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

// ============================================================================
// Helpers
// ============================================================================

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

		const existingUri = await findExistingRecord(
			agent,
			did,
			COLLECTION,
			"publication",
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
			renderHandleForm(
				{
					resourceUri: publicationUri,
					resourceField: "publicationUri",
					loginPath: "/subscribe/login",
					title: "Subscribe on Sequoia",
					description:
						"Enter your Bluesky handle to subscribe to this publication.",
					buttonLabel: "Continue on Bluesky",
					returnTo,
					action,
				},
				styleHref,
			),
		);
	}

	try {
		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const session = await client.restore(did);
		const agent = new Agent(session);

		if (action === "unsubscribe") {
			const existingUri = await findExistingRecord(
				agent,
				did,
				COLLECTION,
				"publication",
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

			// Strip sequoia_did from returnTo so the component doesn't re-store it
			let cleanReturnTo = returnTo;
			if (cleanReturnTo) {
				try {
					const rtUrl = new URL(cleanReturnTo);
					rtUrl.searchParams.delete("sequoia_did");
					cleanReturnTo = rtUrl.toString();
				} catch {
					// keep as-is
				}
			}

			return c.html(
				renderSuccess(
					{
						resourceUri: publicationUri,
						resourceLabel: "Publication",
						recordUri: null,
						heading: "Unsubscribed ✓",
						msg: existingUri
							? "You've successfully unsubscribed!"
							: "You weren't subscribed to this publication.",
						returnTo: withReturnToParam(
							cleanReturnTo,
							"sequoia_unsubscribed",
							"1",
						),
					},
					styleHref,
				),
			);
		}

		const existingUri = await findExistingRecord(
			agent,
			did,
			COLLECTION,
			"publication",
			publicationUri,
		);
		const returnToWithDid = withReturnToParam(returnTo, "sequoia_did", did);

		if (existingUri) {
			return c.html(
				renderSuccess(
					{
						resourceUri: publicationUri,
						resourceLabel: "Publication",
						recordUri: existingUri,
						heading: "Subscribed ✓",
						msg: "You're already subscribed to this publication.",
						returnTo: returnToWithDid,
					},
					styleHref,
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
				{
					resourceUri: publicationUri,
					resourceLabel: "Publication",
					recordUri: result.data.uri,
					heading: "Subscribed ✓",
					msg: "You've successfully subscribed!",
					returnTo: returnToWithDid,
				},
				styleHref,
			),
		);
	} catch (error) {
		console.error("Subscribe GET error:", error);
		// Session expired - ask the user to sign in again
		return c.html(
			renderHandleForm(
				{
					resourceUri: publicationUri,
					resourceField: "publicationUri",
					loginPath: "/subscribe/login",
					title: "Subscribe on Sequoia",
					description:
						"Enter your Bluesky handle to subscribe to this publication.",
					buttonLabel: "Continue on Bluesky",
					returnTo,
					error: "Session expired. Please sign in again.",
					action,
				},
				styleHref,
			),
		);
	}
});

// ============================================================================
// GET /subscribe/check?publicationUri=at://...
//
// JSON-only endpoint for the web component to check subscription status.
//
// Responses:
//   200 { subscribed: true, recordUri: string }
//   200 { subscribed: false }
//   400 { error: string }
//   401 { authenticated: false }
// ============================================================================

subscribe.get("/check", async (c) => {
	const publicationUri = c.req.query("publicationUri");

	if (!publicationUri || !publicationUri.startsWith("at://")) {
		return c.json({ error: "Missing or invalid publicationUri" }, 400);
	}

	// Prefer the server-side session DID; fall back to a client-provided DID
	// (stored by the web component from a previous subscribe flow).
	const did = getSessionDid(c) ?? c.req.query("did") ?? null;
	if (!did || !did.startsWith("did:")) {
		return c.json({ authenticated: false }, 401);
	}

	try {
		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const session = await client.restore(did);
		const agent = new Agent(session);
		const recordUri = await findExistingRecord(
			agent,
			did,
			COLLECTION,
			"publication",
			publicationUri,
		);
		return recordUri
			? c.json({ subscribed: true, recordUri })
			: c.json({ subscribed: false });
	} catch {
		return c.json({ authenticated: false }, 401);
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
	const handle = (body.handle as string | undefined)?.trim();
	const publicationUri = body.publicationUri as string | undefined;
	const formReturnTo = (body.returnTo as string | undefined) || undefined;
	const formAction = (body.action as string | undefined) || undefined;

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

export default subscribe;
