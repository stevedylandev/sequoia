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

const recommend = new Hono<{ Bindings: Env }>();

const COLLECTION = "site.standard.graph.recommend";

// ============================================================================
// POST /recommend
// ============================================================================

recommend.post("/", async (c) => {
	let documentUri: string;
	try {
		const body = await c.req.json<{ documentUri?: string }>();
		documentUri = body.documentUri ?? "";
	} catch {
		return c.json({ error: "Invalid JSON body" }, 400);
	}

	if (!documentUri || !documentUri.startsWith("at://")) {
		return c.json({ error: "Missing or invalid documentUri" }, 400);
	}

	const did = getSessionDid(c);
	if (!did) {
		const subscribeUrl = `${c.env.CLIENT_URL}/recommend?documentUri=${encodeURIComponent(documentUri)}`;
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
			"document",
			documentUri,
		);
		if (existingUri) {
			return c.json({
				recommended: true,
				existing: true,
				recordUri: existingUri,
			});
		}

		const result = await agent.com.atproto.repo.createRecord({
			repo: did,
			collection: COLLECTION,
			record: {
				$type: COLLECTION,
				document: documentUri,
				createdAt: new Date().toISOString(),
			},
		});

		return c.json({
			recommended: true,
			existing: false,
			recordUri: result.data.uri,
		});
	} catch (error) {
		console.error("Recommend POST error:", error);
		const subscribeUrl = `${c.env.CLIENT_URL}/recommend?documentUri=${encodeURIComponent(documentUri)}`;
		return c.json({ authenticated: false, subscribeUrl }, 401);
	}
});

// ============================================================================
// GET /recommend?documentUri=at://...
//
// Full-page OAuth + recommendation flow. Unauthenticated users land here after
// the component redirects them, and authenticated users land here after the
// OAuth callback (via the login_return_to cookie set in POST /recommend/login).
// ============================================================================

recommend.get("/", async (c) => {
	const documentUri = c.req.query("documentUri");
	const action = c.req.query("action");
	const styleHref = await getVocsStyleHref(c.env.ASSETS, c.req.url);

	if (action && action !== "remove") {
		return c.html(renderError(`Unsupported action: ${action}`, styleHref), 400);
	}

	if (!documentUri || !documentUri.startsWith("at://")) {
		return c.html(
			renderError("Missing or invalid document URI.", styleHref),
			400,
		);
	}

	// Prefer an explicit returnTo query param (survives the OAuth round-trip);
	// fall back to the Referer header on the first visit, ignoring self-referrals.
	const referer = c.req.header("referer");
	const returnTo =
		c.req.query("returnTo") ??
		(referer && !referer.includes("/recommend") ? referer : undefined);

	const did = getSessionDid(c);
	if (!did) {
		return c.html(
			renderHandleForm(
				{
					resourceUri: documentUri,
					resourceField: "documentUri",
					loginPath: "/recommend/login",
					title: "Recommend on Sequoia",
					description: "Enter your Bluesky handle to recommend this document.",
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

		if (action === "remove") {
			const existingUri = await findExistingRecord(
				agent,
				did,
				COLLECTION,
				"document",
				documentUri,
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
					{
						resourceUri: documentUri,
						resourceLabel: "Document",
						recordUri: null,
						heading: "Recommendation Removed \u2713",
						msg: existingUri
							? "You've successfully removed your recommendation."
							: "You hadn't recommended this document.",
						returnTo: withReturnToParam(returnTo, "sequoia_did", did),
					},
					styleHref,
				),
			);
		}

		const existingUri = await findExistingRecord(
			agent,
			did,
			COLLECTION,
			"document",
			documentUri,
		);
		const returnToWithDid = withReturnToParam(returnTo, "sequoia_did", did);

		if (existingUri) {
			return c.html(
				renderSuccess(
					{
						resourceUri: documentUri,
						resourceLabel: "Document",
						recordUri: existingUri,
						heading: "Recommended \u2713",
						msg: "You've already recommended this document.",
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
				document: documentUri,
				createdAt: new Date().toISOString(),
			},
		});

		return c.html(
			renderSuccess(
				{
					resourceUri: documentUri,
					resourceLabel: "Document",
					recordUri: result.data.uri,
					heading: "Recommended \u2713",
					msg: "You've successfully recommended this document!",
					returnTo: returnToWithDid,
				},
				styleHref,
			),
		);
	} catch (error) {
		console.error("Recommend GET error:", error);
		// Session expired - ask the user to sign in again
		return c.html(
			renderHandleForm(
				{
					resourceUri: documentUri,
					resourceField: "documentUri",
					loginPath: "/recommend/login",
					title: "Recommend on Sequoia",
					description: "Enter your Bluesky handle to recommend this document.",
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
// GET /recommend/check?documentUri=at://...
//
// JSON-only endpoint for the web component to check recommendation status.
//
// Responses:
//   200 { recommended: true, recordUri: string }
//   200 { recommended: false }
//   400 { error: string }
//   401 { authenticated: false }
// ============================================================================

recommend.get("/check", async (c) => {
	const documentUri = c.req.query("documentUri");

	if (!documentUri || !documentUri.startsWith("at://")) {
		return c.json({ error: "Missing or invalid documentUri" }, 400);
	}

	// Prefer the server-side session DID; fall back to a client-provided DID
	// (stored by the web component from a previous recommend flow).
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
			"document",
			documentUri,
		);
		return recordUri
			? c.json({ recommended: true, recordUri })
			: c.json({ recommended: false });
	} catch {
		return c.json({ authenticated: false }, 401);
	}
});

// ============================================================================
// POST /recommend/login
//
// Handles the handle-entry form submission. Stores the return URL in a cookie
// so the OAuth callback in auth.ts can redirect back to /recommend after auth.
// ============================================================================

recommend.post("/login", async (c) => {
	const body = await c.req.parseBody();
	const handle = (body.handle as string | undefined)?.trim();
	const documentUri = body.documentUri as string | undefined;
	const formReturnTo = (body.returnTo as string | undefined) || undefined;
	const formAction = (body.action as string | undefined) || undefined;

	if (!handle || !documentUri) {
		const styleHref = await getVocsStyleHref(c.env.ASSETS, c.req.url);
		return c.html(
			renderError("Missing handle or document URI.", styleHref),
			400,
		);
	}

	const returnTo =
		`${c.env.CLIENT_URL}/recommend?documentUri=${encodeURIComponent(documentUri)}` +
		(formAction ? `&action=${encodeURIComponent(formAction)}` : "") +
		(formReturnTo ? `&returnTo=${encodeURIComponent(formReturnTo)}` : "");
	setReturnToCookie(c, returnTo, c.env.CLIENT_URL);

	return c.redirect(
		`${c.env.CLIENT_URL}/oauth/login?handle=${encodeURIComponent(handle)}`,
	);
});

export default recommend;
