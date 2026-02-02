import * as http from "node:http";
import { log, note, select, spinner, text } from "@clack/prompts";
import { command, flag, option, optional, string } from "cmd-ts";
import { resolveHandleToDid } from "../lib/atproto";
import {
	getCallbackPort,
	getCallbackUrl,
	getOAuthClient,
	getOAuthScope,
} from "../lib/oauth-client";
import {
	deleteOAuthSession,
	getOAuthStorePath,
	listOAuthSessions,
} from "../lib/oauth-store";
import { exitOnCancel } from "../lib/prompts";

const CALLBACK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export const loginCommand = command({
	name: "login",
	description: "Login with OAuth (browser-based authentication)",
	args: {
		logout: option({
			long: "logout",
			description: "Remove OAuth session for a specific DID",
			type: optional(string),
		}),
		list: flag({
			long: "list",
			description: "List all stored OAuth sessions",
		}),
	},
	handler: async ({ logout, list }) => {
		// List sessions
		if (list) {
			const sessions = await listOAuthSessions();
			if (sessions.length === 0) {
				log.info("No OAuth sessions stored");
			} else {
				log.info("OAuth sessions:");
				for (const did of sessions) {
					console.log(`  - ${did}`);
				}
			}
			return;
		}

		// Logout
		if (logout !== undefined) {
			const did = logout || undefined;

			if (!did) {
				// No DID provided - show available and prompt
				const sessions = await listOAuthSessions();
				if (sessions.length === 0) {
					log.info("No OAuth sessions found");
					return;
				}
				if (sessions.length === 1) {
					const deleted = await deleteOAuthSession(sessions[0]!);
					if (deleted) {
						log.success(`Removed OAuth session for ${sessions[0]}`);
					}
					return;
				}
				// Multiple sessions - prompt
				const selected = exitOnCancel(
					await select({
						message: "Select session to remove:",
						options: sessions.map((d) => ({ value: d, label: d })),
					}),
				);
				const deleted = await deleteOAuthSession(selected);
				if (deleted) {
					log.success(`Removed OAuth session for ${selected}`);
				}
				return;
			}

			const deleted = await deleteOAuthSession(did);
			if (deleted) {
				log.success(`Removed OAuth session for ${did}`);
			} else {
				log.info(`No OAuth session found for ${did}`);
			}
			return;
		}

		// OAuth login flow
		note(
			"OAuth login will open your browser to authenticate.\n\n" +
				"This is more secure than app passwords and tokens refresh automatically.",
			"OAuth Login",
		);

		const handle = exitOnCancel(
			await text({
				message: "Handle or DID:",
				placeholder: "yourhandle.bsky.social",
			}),
		);

		if (!handle) {
			log.error("Handle is required");
			process.exit(1);
		}

		const s = spinner();
		s.start("Resolving identity...");

		let did: string;
		try {
			did = await resolveHandleToDid(handle);
			s.stop(`Identity resolved`);
		} catch (error) {
			s.stop("Failed to resolve identity");
			if (error instanceof Error) {
				log.error(`Error: ${error.message}`);
			} else {
				log.error(`Error: ${error}`);
			}
			process.exit(1);
		}

		s.start("Initializing OAuth...");

		try {
			const client = await getOAuthClient();

			// Generate authorization URL using the resolved DID
			const authUrl = await client.authorize(did, {
				scope: getOAuthScope(),
			});

			log.info(`Login URL: ${authUrl}`);

			s.message("Opening browser...");

			// Try to open browser
			let browserOpened = true;
			try {
				const open = (await import("open")).default;
				await open(authUrl.toString());
			} catch {
				browserOpened = false;
			}

			s.message("Waiting for authentication...");

			// Show URL info
			if (!browserOpened) {
				s.stop("Could not open browser automatically");
				log.warn("Please open the following URL in your browser:");
				log.info(authUrl.toString());
				s.start("Waiting for authentication...");
			}

			// Start HTTP server to receive callback
			const result = await waitForCallback();

			if (!result.success) {
				s.stop("Authentication failed");
				log.error(result.error || "OAuth callback failed");
				process.exit(1);
			}

			s.message("Completing authentication...");

			// Exchange code for tokens
			const { session } = await client.callback(
				new URLSearchParams(result.params!),
			);

			// Try to get the handle for display (use the original handle input as fallback)
			let displayName = handle;
			try {
				// The session should have the DID, we can use the original handle they entered
				// or we could fetch the profile to get the current handle
				displayName = handle.startsWith("did:") ? session.did : handle;
			} catch {
				displayName = session.did;
			}

			s.stop(`Logged in as ${displayName}`);

			log.success(`OAuth session saved to ${getOAuthStorePath()}`);
			log.info("Your session will refresh automatically when needed.");

			// Exit cleanly - the OAuth client may have background processes
			process.exit(0);
		} catch (error) {
			s.stop("OAuth login failed");
			if (error instanceof Error) {
				log.error(`Error: ${error.message}`);
			} else {
				log.error(`Error: ${error}`);
			}
			process.exit(1);
		}
	},
});

interface CallbackResult {
	success: boolean;
	params?: Record<string, string>;
	error?: string;
}

function waitForCallback(): Promise<CallbackResult> {
	return new Promise((resolve) => {
		const port = getCallbackPort();
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		const server = http.createServer((req, res) => {
			const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

			if (url.pathname === "/oauth/callback") {
				const params: Record<string, string> = {};
				url.searchParams.forEach((value, key) => {
					params[key] = value;
				});

				// Clear the timeout
				if (timeoutId) clearTimeout(timeoutId);

				// Check for error
				if (params.error) {
					res.writeHead(200, { "Content-Type": "text/html" });
					res.end(`
						<html>
							<body style="font-family: system-ui; padding: 2rem; text-align: center;">
								<h1>Authentication Failed</h1>
								<p>${params.error_description || params.error}</p>
								<p>You can close this window.</p>
							</body>
						</html>
					`);
					server.close(() => {
						resolve({
							success: false,
							error: params.error_description || params.error,
						});
					});
					return;
				}

				// Success
				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(`
					<html>
						<body style="font-family: system-ui; padding: 2rem; text-align: center;">
							<h1>Authentication Successful</h1>
							<p>You can close this window and return to the terminal.</p>
						</body>
					</html>
				`);
				server.close(() => {
					resolve({ success: true, params });
				});
				return;
			}

			// Not the callback path
			res.writeHead(404);
			res.end("Not found");
		});

		server.on("error", (err: NodeJS.ErrnoException) => {
			if (timeoutId) clearTimeout(timeoutId);
			if (err.code === "EADDRINUSE") {
				resolve({
					success: false,
					error: `Port ${port} is already in use. Please close the application using that port and try again.`,
				});
			} else {
				resolve({
					success: false,
					error: `Server error: ${err.message}`,
				});
			}
		});

		server.listen(port, "127.0.0.1");

		// Timeout after 5 minutes
		timeoutId = setTimeout(() => {
			server.close(() => {
				resolve({
					success: false,
					error: "Timeout waiting for OAuth callback. Please try again.",
				});
			});
		}, CALLBACK_TIMEOUT_MS);
	});
}
