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

const subscribe = new Hono<{ Variables: Variables }>();

const COLLECTION = "site.standard.graph.subscription";

// ============================================================================
// POST /subscribe
// ============================================================================

subscribe.post("/", async (c) => {
	const env = c.get("env");
	const db = c.get("db");

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
		const subscribeUrl = `${env.CLIENT_URL}/subscribe?publicationUri=${encodeURIComponent(publicationUri)}`;
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
		const subscribeUrl = `${env.CLIENT_URL}/subscribe?publicationUri=${encodeURIComponent(publicationUri)}`;
		return c.json({ authenticated: false, subscribeUrl }, 401);
	}
});

// ============================================================================
// GET /subscribe
// ============================================================================

subscribe.get("/", async (c) => {
	const env = c.get("env");
	const db = c.get("db");

	const publicationUri = c.req.query("publicationUri");
	const action = c.req.query("action");

	if (action && action !== "unsubscribe") {
		return c.html(renderError(`Unsupported action: ${action}`), 400);
	}

	if (!publicationUri || !publicationUri.startsWith("at://")) {
		return c.html(renderError("Missing or invalid publication URI."), 400);
	}

	const referer = c.req.header("referer");
	const returnTo =
		c.req.query("returnTo") ??
		(referer && !referer.includes("/subscribe") ? referer : undefined);

	const did = getSessionDid(c);
	if (!did) {
		return c.html(
			renderHandleForm({
				resourceUri: publicationUri,
				resourceField: "publicationUri",
				loginPath: "/subscribe/login",
				title: "Subscribe on Sequoia",
				description:
					"Enter your Bluesky handle to subscribe to this publication.",
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
				renderSuccess({
					resourceUri: publicationUri,
					resourceLabel: "Publication",
					recordUri: null,
					heading: "Unsubscribed",
					msg: existingUri
						? "You've successfully unsubscribed!"
						: "You weren't subscribed to this publication.",
					returnTo: withReturnToParam(
						cleanReturnTo,
						"sequoia_unsubscribed",
						"1",
					),
				}),
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
				renderSuccess({
					resourceUri: publicationUri,
					resourceLabel: "Publication",
					recordUri: existingUri,
					heading: "Subscribed",
					msg: "You're already subscribed to this publication.",
					returnTo: returnToWithDid,
				}),
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
			renderSuccess({
				resourceUri: publicationUri,
				resourceLabel: "Publication",
				recordUri: result.data.uri,
				heading: "Subscribed",
				msg: "You've successfully subscribed!",
				returnTo: returnToWithDid,
			}),
		);
	} catch (error) {
		console.error("Subscribe GET error:", error);
		return c.html(
			renderHandleForm({
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
			}),
		);
	}
});

// ============================================================================
// GET /subscribe/check
// ============================================================================

subscribe.get("/check", async (c) => {
	const env = c.get("env");
	const db = c.get("db");

	const publicationUri = c.req.query("publicationUri");

	if (!publicationUri || !publicationUri.startsWith("at://")) {
		return c.json({ error: "Missing or invalid publicationUri" }, 400);
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
// ============================================================================

subscribe.post("/login", async (c) => {
	const env = c.get("env");

	const body = await c.req.parseBody();
	const handle = (body.handle as string | undefined)?.trim();
	const publicationUri = body.publicationUri as string | undefined;
	const formReturnTo = (body.returnTo as string | undefined) || undefined;
	const formAction = (body.action as string | undefined) || undefined;

	if (!handle || !publicationUri) {
		return c.html(renderError("Missing handle or publication URI."), 400);
	}

	const returnTo =
		`${env.CLIENT_URL}/subscribe?publicationUri=${encodeURIComponent(publicationUri)}` +
		(formAction ? `&action=${encodeURIComponent(formAction)}` : "") +
		(formReturnTo ? `&returnTo=${encodeURIComponent(formReturnTo)}` : "");
	setReturnToCookie(c, returnTo, env.CLIENT_URL);

	return c.redirect(
		`${env.CLIENT_URL}/oauth/login?handle=${encodeURIComponent(handle)}`,
	);
});

export default subscribe;
