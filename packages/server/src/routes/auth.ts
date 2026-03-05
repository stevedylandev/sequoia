import { Hono } from "hono";
import type { RedisClient } from "bun";
import { createOAuthClient, OAUTH_SCOPE } from "../lib/oauth-client";
import {
	getSessionDid,
	setSessionCookie,
	clearSessionCookie,
	getReturnToCookie,
	clearReturnToCookie,
} from "../lib/session";
import type { Env } from "../env";

type Variables = { env: Env; redis: RedisClient };

const auth = new Hono<{ Variables: Variables }>();

// OAuth client metadata endpoint
auth.get("/client-metadata.json", (c) => {
	const env = c.get("env");
	const clientId = `${env.CLIENT_URL}/oauth/client-metadata.json`;
	const redirectUri = `${env.CLIENT_URL}/oauth/callback`;

	return c.json({
		client_id: clientId,
		client_name: env.CLIENT_NAME,
		client_uri: env.CLIENT_URL,
		redirect_uris: [redirectUri],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		scope: OAUTH_SCOPE,
		token_endpoint_auth_method: "none",
		application_type: "web",
		dpop_bound_access_tokens: true,
	});
});

// Start OAuth login flow
auth.get("/login", async (c) => {
	const env = c.get("env");
	const redis = c.get("redis");

	try {
		const handle = c.req.query("handle");
		if (!handle) {
			return c.redirect(`${env.CLIENT_URL}/?error=missing_handle`);
		}

		const client = createOAuthClient(redis, env.CLIENT_URL, env.CLIENT_NAME);
		const authUrl = await client.authorize(handle, {
			scope: OAUTH_SCOPE,
		});

		return c.redirect(authUrl.toString());
	} catch (error) {
		console.error("Login error:", error);
		return c.redirect(`${env.CLIENT_URL}/?error=login_failed`);
	}
});

// OAuth callback handler
auth.get("/callback", async (c) => {
	const env = c.get("env");
	const redis = c.get("redis");

	try {
		const params = new URLSearchParams(c.req.url.split("?")[1] || "");

		if (params.get("error")) {
			const error = params.get("error");
			console.error("OAuth error:", error, params.get("error_description"));
			return c.redirect(
				`${env.CLIENT_URL}/?error=${encodeURIComponent(error!)}`,
			);
		}

		const client = createOAuthClient(redis, env.CLIENT_URL, env.CLIENT_NAME);
		const { session } = await client.callback(params);

		// Resolve handle from DID
		let handle: string | undefined;
		try {
			const identity = await client.identityResolver.resolve(session.did);
			handle = identity.handle;
		} catch {
			// Handle resolution is best-effort
		}

		// Store handle in Redis alongside the session for quick lookup
		if (handle) {
			const key = `oauth_handle:${session.did}`;
			await redis.set(key, handle);
			await redis.expire(key, 60 * 60 * 24 * 14);
		}

		setSessionCookie(c, session.did, env.CLIENT_URL);

		// If a subscribe flow set a return URL before initiating OAuth, honor it
		const returnTo = getReturnToCookie(c);
		clearReturnToCookie(c, env.CLIENT_URL);

		return c.redirect(returnTo ?? `${env.CLIENT_URL}/`);
	} catch (error) {
		console.error("Callback error:", error);
		return c.redirect(`${env.CLIENT_URL}/?error=callback_failed`);
	}
});

// Logout endpoint
auth.post("/logout", async (c) => {
	const env = c.get("env");
	const redis = c.get("redis");
	const did = getSessionDid(c);

	if (did) {
		try {
			const client = createOAuthClient(redis, env.CLIENT_URL, env.CLIENT_NAME);
			await client.revoke(did);
		} catch (error) {
			console.error("Revoke error:", error);
		}
		await redis.del(`oauth_handle:${did}`);
	}

	clearSessionCookie(c, env.CLIENT_URL);
	return c.json({ success: true });
});

// Check auth status
auth.get("/status", async (c) => {
	const env = c.get("env");
	const redis = c.get("redis");
	const did = getSessionDid(c);

	if (!did) {
		return c.json({ authenticated: false });
	}

	try {
		const client = createOAuthClient(redis, env.CLIENT_URL, env.CLIENT_NAME);
		const session = await client.restore(did);

		const handle = await redis.get(`oauth_handle:${session.did}`);

		return c.json({
			authenticated: true,
			did: session.did,
			handle: handle || undefined,
		});
	} catch (error) {
		console.error("Session restore failed:", error);
		clearSessionCookie(c, env.CLIENT_URL);
		return c.json({ authenticated: false });
	}
});

export default auth;
