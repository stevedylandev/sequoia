import { Agent } from "@atproto/api";
import { Hono } from "hono";
import type { RedisClient } from "bun";
import { createOAuthClient } from "../lib/oauth-client";
import { getSessionDid, setReturnToCookie } from "../lib/session";
import { page, escapeHtml } from "../lib/theme";
import type { Env } from "../env";

type Variables = { env: Env; redis: RedisClient };

const subscribe = new Hono<{ Variables: Variables }>();

const COLLECTION = "site.standard.graph.subscription";
const REDIRECT_DELAY_SECONDS = 5;

// ============================================================================
// Helpers
// ============================================================================

function withReturnToParam(
	returnTo: string | undefined,
	key: string,
	value: string,
): string | undefined {
	if (!returnTo) return undefined;
	try {
		const url = new URL(returnTo);
		url.searchParams.set(key, value);
		return url.toString();
	} catch {
		return returnTo;
	}
}

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
// ============================================================================

subscribe.post("/", async (c) => {
	const env = c.get("env");
	const redis = c.get("redis");

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
		const client = createOAuthClient(redis, env.CLIENT_URL, env.CLIENT_NAME);
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
		const subscribeUrl = `${env.CLIENT_URL}/subscribe?publicationUri=${encodeURIComponent(publicationUri)}`;
		return c.json({ authenticated: false, subscribeUrl }, 401);
	}
});

// ============================================================================
// GET /subscribe
// ============================================================================

subscribe.get("/", async (c) => {
	const env = c.get("env");
	const redis = c.get("redis");

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
			renderHandleForm(publicationUri, returnTo, undefined, action),
		);
	}

	try {
		const client = createOAuthClient(redis, env.CLIENT_URL, env.CLIENT_NAME);
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
					publicationUri,
					null,
					"Unsubscribed",
					existingUri
						? "You've successfully unsubscribed!"
						: "You weren't subscribed to this publication.",
					withReturnToParam(cleanReturnTo, "sequoia_unsubscribed", "1"),
				),
			);
		}

		const existingUri = await findExistingSubscription(
			agent,
			did,
			publicationUri,
		);
		const returnToWithDid = withReturnToParam(returnTo, "sequoia_did", did);

		if (existingUri) {
			return c.html(
				renderSuccess(
					publicationUri,
					existingUri,
					"Subscribed",
					"You're already subscribed to this publication.",
					returnToWithDid,
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
				"Subscribed",
				"You've successfully subscribed!",
				returnToWithDid,
			),
		);
	} catch (error) {
		console.error("Subscribe GET error:", error);
		return c.html(
			renderHandleForm(
				publicationUri,
				returnTo,
				"Session expired. Please sign in again.",
				action,
			),
		);
	}
});

// ============================================================================
// GET /subscribe/check
// ============================================================================

subscribe.get("/check", async (c) => {
	const env = c.get("env");
	const redis = c.get("redis");

	const publicationUri = c.req.query("publicationUri");

	if (!publicationUri || !publicationUri.startsWith("at://")) {
		return c.json({ error: "Missing or invalid publicationUri" }, 400);
	}

	const did = getSessionDid(c) ?? c.req.query("did") ?? null;
	if (!did || !did.startsWith("did:")) {
		return c.json({ authenticated: false }, 401);
	}

	try {
		const client = createOAuthClient(redis, env.CLIENT_URL, env.CLIENT_NAME);
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
});

// ============================================================================
// POST /subscribe/login
// ============================================================================

subscribe.post("/login", async (c) => {
	const env = c.get("env");

	const body = await c.req.parseBody();
	const handle = (body["handle"] as string | undefined)?.trim();
	const publicationUri = body["publicationUri"] as string | undefined;
	const formReturnTo = (body["returnTo"] as string | undefined) || undefined;
	const formAction = (body["action"] as string | undefined) || undefined;

	if (!handle || !publicationUri) {
		return c.html(
			renderError("Missing handle or publication URI."),
			400,
		);
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

// ============================================================================
// HTML rendering
// ============================================================================

function renderHandleForm(
	publicationUri: string,
	returnTo?: string,
	error?: string,
	action?: string,
): string {
	const errorHtml = error
		? `<p class="error">${escapeHtml(error)}</p>`
		: "";
	const returnToInput = returnTo
		? `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />`
		: "";
	const actionInput = action
		? `<input type="hidden" name="action" value="${escapeHtml(action)}" />`
		: "";

	return page(`
		<h1>Subscribe on Bluesky</h1>
		<p>Enter your Bluesky handle to subscribe to this publication.</p>
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
			<button type="submit">Continue on Bluesky</button>
		</form>
	`);
}

function renderSuccess(
	publicationUri: string,
	recordUri: string | null,
	heading: string,
	msg: string,
	returnTo?: string,
): string {
	const escapedPublicationUri = escapeHtml(publicationUri);
	const escapedReturnTo = returnTo ? escapeHtml(returnTo) : "";

	const redirectHtml = returnTo
		? `<p id="redirect-msg">Redirecting to <a href="${escapedReturnTo}">${escapedReturnTo}</a> in <span id="countdown">${REDIRECT_DELAY_SECONDS}</span>\u00a0seconds\u2026</p>
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
		<h1>${escapeHtml(heading)}</h1>
		<p>${msg}</p>
		${redirectHtml}
		<table>
			<colgroup><col style="width:7rem;"><col></colgroup>
			<tbody>
				<tr>
					<td>Publication</td>
					<td>
						<div><code><a href="https://pds.ls/${escapedPublicationUri}">${escapedPublicationUri}</a></code></div>
					</td>
				</tr>
				${
					recordUri
						? `<tr>
					<td>Record</td>
					<td>
						<div><code><a href="https://pds.ls/${escapeHtml(recordUri)}">${escapeHtml(recordUri)}</a></code></div>
					</td>
				</tr>`
						: ""
				}
			</tbody>
		</table>
	`,
		headExtra,
	);
}

function renderError(message: string): string {
	return page(
		`<h1>Error</h1><p class="error">${escapeHtml(message)}</p>`,
	);
}

export default subscribe;
