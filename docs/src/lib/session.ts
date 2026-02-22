import type { Context } from "hono";

const SESSION_COOKIE_NAME = "session_id";
const SESSION_TTL = 60 * 60 * 24 * 14; // 14 days in seconds

/**
 * Get DID from session cookie
 */
export function getSessionDid(c: Context): string | null {
	const cookie = c.req.header("Cookie");
	if (!cookie) return null;

	const match = cookie.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
	return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Set session cookie with the user's DID
 */
export function setSessionCookie(
	c: Context,
	did: string,
	clientUrl: string,
): void {
	const isLocalhost = clientUrl.includes("localhost");
	const domain = isLocalhost ? "" : "; Domain=.sequoia.pub";
	const secure = isLocalhost ? "" : "; Secure";

	c.header(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=${encodeURIComponent(did)}; HttpOnly; SameSite=Lax; Path=/${domain}${secure}; Max-Age=${SESSION_TTL}`,
	);
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(c: Context, clientUrl: string): void {
	const isLocalhost = clientUrl.includes("localhost");
	const domain = isLocalhost ? "" : "; Domain=.sequoia.pub";
	const secure = isLocalhost ? "" : "; Secure";

	c.header(
		"Set-Cookie",
		`${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/${domain}${secure}; Max-Age=0`,
	);
}
