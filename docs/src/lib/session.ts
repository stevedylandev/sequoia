import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";

const SESSION_COOKIE_NAME = "session_id";
const RETURN_TO_COOKIE_NAME = "login_return_to";
const SESSION_TTL = 60 * 60 * 24 * 14; // 14 days in seconds
const RETURN_TO_TTL = 600; // 10 minutes in seconds

function baseCookieOptions(clientUrl: string) {
	const isLocalhost = clientUrl.includes("localhost");
	const hostname = new URL(clientUrl).hostname;
	return {
		httpOnly: true as const,
		// Allow the SESSION_COOKIE_NAME to be sent for existing subscription checks.
		sameSite: "None" as const,
		path: "/",
		...(isLocalhost ? {} : { domain: `.${hostname}`, secure: true }),
	};
}

/**
 * Get DID from session cookie
 */
export function getSessionDid(c: Context): string | null {
	const value = getCookie(c, SESSION_COOKIE_NAME);
	return value ? decodeURIComponent(value) : null;
}

/**
 * Set session cookie with the user's DID
 */
export function setSessionCookie(
	c: Context,
	did: string,
	clientUrl: string,
): void {
	setCookie(c, SESSION_COOKIE_NAME, encodeURIComponent(did), {
		...baseCookieOptions(clientUrl),
		maxAge: SESSION_TTL,
	});
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(c: Context, clientUrl: string): void {
	deleteCookie(c, SESSION_COOKIE_NAME, baseCookieOptions(clientUrl));
}

/**
 * Get the post-OAuth return-to URL from the short-lived cookie
 */
export function getReturnToCookie(c: Context): string | null {
	const value = getCookie(c, RETURN_TO_COOKIE_NAME);
	return value ? decodeURIComponent(value) : null;
}

/**
 * Set a short-lived cookie that redirects back after OAuth completes
 */
export function setReturnToCookie(
	c: Context,
	returnTo: string,
	clientUrl: string,
): void {
	setCookie(c, RETURN_TO_COOKIE_NAME, encodeURIComponent(returnTo), {
		...baseCookieOptions(clientUrl),
		maxAge: RETURN_TO_TTL,
	});
}

/**
 * Clear the return-to cookie
 */
export function clearReturnToCookie(c: Context, clientUrl: string): void {
	deleteCookie(c, RETURN_TO_COOKIE_NAME, baseCookieOptions(clientUrl));
}
