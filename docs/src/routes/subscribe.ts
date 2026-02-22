import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { createOAuthClient } from "../lib/oauth-client";

interface Env {
	SEQUOIA_SESSIONS: KVNamespace;
	CLIENT_URL: string;
}

const subscribe = new Hono<{ Bindings: Env }>();

const STATE_TTL_SECONDS = 600;

// ============================================================================
// GET /subscribe - Landing page with handle input form
// ============================================================================

subscribe.get("/", (c) => {
	const pub = c.req.query("pub") ?? "";
	const returnUrl = c.req.query("return") ?? "";

	if (!pub) {
		return c.html(renderPage("Missing publication URI", renderError("No publication URI provided.")));
	}

	return c.html(renderPage("Subscribe with Bluesky", renderForm(pub, returnUrl)));
});

// ============================================================================
// POST /subscribe - Store context, initiate OAuth
// ============================================================================

subscribe.post("/", async (c) => {
	let formData: FormData;
	try {
		formData = await c.req.formData();
	} catch {
		return c.html(
			renderPage("Subscribe with Bluesky", renderError("Invalid form submission.")),
			400,
		);
	}

	const handle = (formData.get("handle") as string | null)?.trim() ?? "";
	const pub = (formData.get("pub") as string | null) ?? "";
	const returnUrl = (formData.get("return") as string | null) ?? "";

	if (!handle) {
		return c.html(
			renderPage(
				"Subscribe with Bluesky",
				renderForm(pub, returnUrl, "Please enter your Bluesky handle."),
			),
			400,
		);
	}

	if (!pub.startsWith("at://")) {
		return c.html(
			renderPage("Subscribe with Bluesky", renderError("Invalid publication URI.")),
			400,
		);
	}

	// Validate returnUrl is a well-formed HTTPS URL to prevent open redirect
	if (returnUrl) {
		try {
			const parsed = new URL(returnUrl);
			if (parsed.protocol !== "https:") {
				return c.html(
					renderPage("Subscribe with Bluesky", renderError("Invalid return URL.")),
					400,
				);
			}
		} catch {
			return c.html(
				renderPage("Subscribe with Bluesky", renderError("Invalid return URL.")),
				400,
			);
		}
	}

	try {
		// Store subscribe context in KV
		const ctxKey = `subscribe_ctx:${crypto.randomUUID()}`;
		await c.env.SEQUOIA_SESSIONS.put(
			ctxKey,
			JSON.stringify({ pub, returnUrl: returnUrl || c.env.CLIENT_URL }),
			{ expirationTtl: STATE_TTL_SECONDS },
		);

		// Set subscribe_ctx cookie so the callback can retrieve it
		const isLocalhost = c.env.CLIENT_URL.includes("localhost");
		setCookie(c, "subscribe_ctx", ctxKey, {
			httpOnly: true,
			secure: !isLocalhost,
			sameSite: "Lax",
			path: "/",
			maxAge: STATE_TTL_SECONDS,
		});

		// Initiate OAuth via the shared client
		const client = createOAuthClient(c.env.SEQUOIA_SESSIONS, c.env.CLIENT_URL);
		const authUrl = await client.authorize(handle, {
			scope: "atproto transition:generic",
		});

		return c.redirect(authUrl.toString(), 302);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "An unexpected error occurred.";
		return c.html(
			renderPage(
				"Subscribe with Bluesky",
				renderForm(pub, returnUrl, message),
			),
			400,
		);
	}
});

// ============================================================================
// HTML helpers
// ============================================================================

function renderPage(title: string, content: string): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)} — Sequoia</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #F5F3EF;
      color: #2C2C2C;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: #ffffff;
      border-radius: 12px;
      padding: 2.5rem;
      max-width: 480px;
      width: 100%;
      box-shadow: 0 1px 3px rgba(44, 44, 44, 0.1), 0 4px 16px rgba(44, 44, 44, 0.06);
    }
    .logo {
      display: flex;
      align-items: center;
      gap: 0.625rem;
      margin-bottom: 2rem;
      text-decoration: none;
      color: inherit;
    }
    .logo-text {
      font-size: 1.25rem;
      font-weight: 600;
      color: #3A5A40;
    }
    h1 {
      font-size: 1.375rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #2C2C2C;
    }
    .subtitle {
      color: #6B6B6B;
      font-size: 0.9375rem;
      margin-bottom: 1.75rem;
      line-height: 1.5;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.375rem;
      color: #4A4A4A;
    }
    input[type="text"] {
      width: 100%;
      padding: 0.625rem 0.875rem;
      border: 1px solid #D5D1C8;
      border-radius: 8px;
      font-size: 1rem;
      font-family: inherit;
      color: #2C2C2C;
      background: #ffffff;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
      margin-bottom: 1.25rem;
    }
    input[type="text"]:focus {
      outline: none;
      border-color: #3A5A40;
      box-shadow: 0 0 0 3px rgba(58, 90, 64, 0.12);
    }
    .btn {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: #3A5A40;
      color: #ffffff;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      font-weight: 500;
      cursor: pointer;
      font-family: inherit;
      transition: background-color 0.15s ease;
    }
    .btn:hover { background: #2E4832; }
    .btn svg { width: 1.125rem; height: 1.125rem; }
    .error-msg {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #dc2626;
      border-radius: 8px;
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      margin-bottom: 1.25rem;
    }
    .error-box {
      text-align: center;
      color: #6B6B6B;
    }
    .footer {
      margin-top: 2rem;
      padding-top: 1.25rem;
      border-top: 1px solid #E5E2DB;
      text-align: center;
      font-size: 0.8125rem;
      color: #8B8B8B;
    }
    .footer a { color: #3A5A40; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <a href="https://sequoia.pub" class="logo">
      <svg width="28" height="28" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="100" height="100" rx="20" fill="#3A5A40"/>
        <path d="M50 15 L72 40 L64 40 L64 85 L36 85 L36 40 L28 40 Z" fill="#ffffff"/>
      </svg>
      <span class="logo-text">Sequoia</span>
    </a>
    ${content}
    <div class="footer">
      Powered by <a href="https://sequoia.pub">Sequoia</a> &amp; the <a href="https://atproto.com">AT Protocol</a>
    </div>
  </div>
</body>
</html>`;
}

const BSKY_ICON = `<svg viewBox="0 0 600 530" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z"/>
</svg>`;

function renderForm(pub: string, returnUrl: string, errorMsg?: string): string {
	const errorHtml = errorMsg
		? `<div class="error-msg">${escapeHtml(errorMsg)}</div>`
		: "";

	return `
    <h1>Subscribe with Bluesky</h1>
    <p class="subtitle">Enter your Bluesky handle to subscribe to this publication via the AT Protocol.</p>
    ${errorHtml}
    <form method="POST" action="/subscribe">
      <input type="hidden" name="pub" value="${escapeHtml(pub)}" />
      <input type="hidden" name="return" value="${escapeHtml(returnUrl)}" />
      <label for="handle">Your Bluesky handle</label>
      <input
        type="text"
        id="handle"
        name="handle"
        placeholder="you.bsky.social"
        autocomplete="username"
        autocapitalize="none"
        spellcheck="false"
        required
      />
      <button type="submit" class="btn">
        ${BSKY_ICON}
        Subscribe
      </button>
    </form>`;
}

function renderError(message: string): string {
	return `
    <div class="error-box">
      <p>${escapeHtml(message)}</p>
    </div>`;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#x27;");
}

export default subscribe;
