import { Agent } from "@atproto/api";
import { Hono } from "hono";
import type { Database } from "bun:sqlite";
import { createOAuthClient } from "../lib/oauth-client";
import { getSessionDid, setReturnToCookie } from "../lib/session";
import type { Env } from "../env";
import {
	findExistingRecord,
	renderError,
	renderHandleForm,
	renderSuccess,
	withReturnToParam,
} from "./lib";

type Variables = { env: Env; db: Database };

const recommend = new Hono<{ Variables: Variables }>();

const COLLECTION = "site.standard.graph.recommend";

// ============================================================================
// POST /recommend
// ============================================================================

recommend.post("/", async (c) => {
	const env = c.get("env");
	const db = c.get("db");

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
		const subscribeUrl = `${env.CLIENT_URL}/recommend?documentUri=${encodeURIComponent(documentUri)}`;
		return c.json({ authenticated: false, subscribeUrl }, 401);
	}

	try {
		const client = createOAuthClient(db, env.CLIENT_URL, env.CLIENT_NAME);
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
		const subscribeUrl = `${env.CLIENT_URL}/recommend?documentUri=${encodeURIComponent(documentUri)}`;
		return c.json({ authenticated: false, subscribeUrl }, 401);
	}
});

// ============================================================================
// GET /recommend
// ============================================================================

recommend.get("/", async (c) => {
	const env = c.get("env");
	const db = c.get("db");

	const documentUri = c.req.query("documentUri");
	const action = c.req.query("action");

	if (action && action !== "remove") {
		return c.html(renderError(`Unsupported action: ${action}`), 400);
	}

	if (!documentUri || !documentUri.startsWith("at://")) {
		return c.html(renderError("Missing or invalid document URI."), 400);
	}

	const referer = c.req.header("referer");
	const returnTo =
		c.req.query("returnTo") ??
		(referer && !referer.includes("/recommend") ? referer : undefined);

	const did = getSessionDid(c);
	if (!did) {
		return c.html(
			renderHandleForm({
				resourceUri: documentUri,
				resourceField: "documentUri",
				loginPath: "/recommend/login",
				title: "Recommend on Sequoia",
				description: "Enter your Bluesky handle to recommend this document.",
				buttonLabel: "Continue on Bluesky",
				returnTo,
				action,
			}),
		);
	}

	try {
		const client = createOAuthClient(db, env.CLIENT_URL, env.CLIENT_NAME);
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
				renderSuccess({
					resourceUri: documentUri,
					resourceLabel: "Document",
					recordUri: null,
					heading: "Recommendation Removed",
					msg: existingUri
						? "You've successfully removed your recommendation."
						: "You hadn't recommended this document.",
					returnTo: withReturnToParam(returnTo, "sequoia_did", did),
				}),
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
				renderSuccess({
					resourceUri: documentUri,
					resourceLabel: "Document",
					recordUri: existingUri,
					heading: "Recommended",
					msg: "You've already recommended this document.",
					returnTo: returnToWithDid,
				}),
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
			renderSuccess({
				resourceUri: documentUri,
				resourceLabel: "Document",
				recordUri: result.data.uri,
				heading: "Recommended",
				msg: "You've successfully recommended this document!",
				returnTo: returnToWithDid,
			}),
		);
	} catch (error) {
		console.error("Recommend GET error:", error);
		return c.html(
			renderHandleForm({
				resourceUri: documentUri,
				resourceField: "documentUri",
				loginPath: "/recommend/login",
				title: "Recommend on Sequoia",
				description: "Enter your Bluesky handle to recommend this document.",
				buttonLabel: "Continue on Bluesky",
				returnTo,
				error: "Session expired. Please sign in again.",
				action,
			}),
		);
	}
});

// ============================================================================
// GET /recommend/check
// ============================================================================

recommend.get("/check", async (c) => {
	const env = c.get("env");
	const db = c.get("db");

	const documentUri = c.req.query("documentUri");

	if (!documentUri || !documentUri.startsWith("at://")) {
		return c.json({ error: "Missing or invalid documentUri" }, 400);
	}

	const did = getSessionDid(c) ?? c.req.query("did") ?? null;
	if (!did || !did.startsWith("did:")) {
		return c.json({ authenticated: false }, 401);
	}

	try {
		const client = createOAuthClient(db, env.CLIENT_URL, env.CLIENT_NAME);
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
// ============================================================================

recommend.post("/login", async (c) => {
	const env = c.get("env");

	const body = await c.req.parseBody();
	const handle = (body.handle as string | undefined)?.trim();
	const documentUri = body.documentUri as string | undefined;
	const formReturnTo = (body.returnTo as string | undefined) || undefined;
	const formAction = (body.action as string | undefined) || undefined;

	if (!handle || !documentUri) {
		return c.html(renderError("Missing handle or document URI."), 400);
	}

	const returnTo =
		`${env.CLIENT_URL}/recommend?documentUri=${encodeURIComponent(documentUri)}` +
		(formAction ? `&action=${encodeURIComponent(formAction)}` : "") +
		(formReturnTo ? `&returnTo=${encodeURIComponent(formReturnTo)}` : "");
	setReturnToCookie(c, returnTo, env.CLIENT_URL);

	return c.redirect(
		`${env.CLIENT_URL}/oauth/login?handle=${encodeURIComponent(handle)}`,
	);
});

export default recommend;
