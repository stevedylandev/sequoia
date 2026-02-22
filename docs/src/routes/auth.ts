import { Hono } from "hono";
import { createOAuthClient } from "../lib/oauth-client";
import {
	getSessionDid,
	setSessionCookie,
	clearSessionCookie,
} from "../lib/session";

interface Env {
	SEQUOIA_SESSIONS: KVNamespace;
	CLIENT_URL: string;
}

const auth = new Hono<{ Bindings: Env }>();

// OAuth client metadata endpoint
auth.get("/client-metadata.json", (c) => {
	const clientId = `${c.env.CLIENT_URL}/oauth/client-metadata.json`;
	const redirectUri = `${c.env.CLIENT_URL}/oauth/callback`;

	return c.json({
		client_id: clientId,
		client_name: "Sequoia",
		client_uri: c.env.CLIENT_URL,
		redirect_uris: [redirectUri],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		scope: "atproto transition:generic",
		token_endpoint_auth_method: "none",
		application_type: "web",
		dpop_bound_access_tokens: true,
	});
});

// Start OAuth login flow
auth.get("/login", async (c) => {
	try {
		const handle = c.req.query("handle");
		if (!handle) {
			return c.redirect(`${c.env.CLIENT_URL}/?error=missing_handle`);
		}

		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const authUrl = await client.authorize(handle, {
			scope: "atproto transition:generic",
		});

		return c.redirect(authUrl.toString());
	} catch (error) {
		console.error("Login error:", error);
		return c.redirect(`${c.env.CLIENT_URL}/?error=login_failed`);
	}
});

// OAuth callback handler
auth.get("/callback", async (c) => {
	try {
		const params = new URLSearchParams(c.req.url.split("?")[1] || "");

		if (params.get("error")) {
			const error = params.get("error");
			console.error("OAuth error:", error, params.get("error_description"));
			return c.redirect(
				`${c.env.CLIENT_URL}/?error=${encodeURIComponent(error!)}`,
			);
		}

		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const { session } = await client.callback(params);

		// Resolve handle from DID
		let handle: string | undefined;
		try {
			const identity = await client.identityResolver.resolve(session.did);
			handle = identity.handle;
		} catch {
			// Handle resolution is best-effort
		}

		// Store handle in KV alongside the session for quick lookup
		if (handle) {
			await c.env.SEQUOIA_SESSIONS.put(`oauth_handle:${session.did}`, handle, {
				expirationTtl: 60 * 60 * 24 * 14,
			});
		}

		setSessionCookie(c, session.did, c.env.CLIENT_URL);
		return c.redirect(`${c.env.CLIENT_URL}/`);
	} catch (error) {
		console.error("Callback error:", error);
		return c.redirect(`${c.env.CLIENT_URL}/?error=callback_failed`);
	}
});

// Logout endpoint
auth.post("/logout", async (c) => {
	const did = getSessionDid(c);

	if (did) {
		try {
			const client = createOAuthClient(
				c.env.SEQUOIA_SESSIONS,
				c.env.CLIENT_URL,
			);
			await client.revoke(did);
		} catch (error) {
			console.error("Revoke error:", error);
		}
		await c.env.SEQUOIA_SESSIONS.delete(`oauth_handle:${did}`);
	}

	clearSessionCookie(c, c.env.CLIENT_URL);
	return c.json({ success: true });
});

// Check auth status
auth.get("/status", async (c) => {
	const did = getSessionDid(c);

	if (!did) {
		return c.json({ authenticated: false });
	}

	try {
		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const session = await client.restore(did);

		const handle = await c.env.SEQUOIA_SESSIONS.get(
			`oauth_handle:${session.did}`,
		);

		return c.json({
			authenticated: true,
			did: session.did,
			handle: handle || undefined,
		});
	} catch (error) {
		console.error("Session restore failed:", error);
		clearSessionCookie(c, c.env.CLIENT_URL);
		return c.json({ authenticated: false });
	}
});

export default auth;
