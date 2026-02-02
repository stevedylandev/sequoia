import {
	NodeOAuthClient,
	type NodeOAuthClientOptions,
} from "@atproto/oauth-client-node";
import { sessionStore, stateStore } from "./oauth-store";

const CALLBACK_PORT = 4000;
const CALLBACK_HOST = "127.0.0.1";
const CALLBACK_URL = `http://${CALLBACK_HOST}:${CALLBACK_PORT}/oauth/callback`;

// OAuth scope for Sequoia CLI - includes atproto base scope plus our collections
const OAUTH_SCOPE =
	"atproto repo:site.standard.document repo:site.standard.publication repo:app.bsky.feed.post blob:*/*";

let oauthClient: NodeOAuthClient | null = null;

// Simple lock implementation for CLI (single process, no contention)
// This prevents the "No lock mechanism provided" warning
const locks = new Map<string, Promise<void>>();

async function requestLock(key: string, fn: () => Promise<void>): Promise<void> {
	// Wait for any existing lock on this key
	while (locks.has(key)) {
		await locks.get(key);
	}

	// Create our lock
	let resolve: () => void;
	const lockPromise = new Promise<void>((r) => {
		resolve = r;
	});
	locks.set(key, lockPromise);

	try {
		await fn();
	} finally {
		locks.delete(key);
		resolve!();
	}
}

/**
 * Get or create the OAuth client singleton
 */
export async function getOAuthClient(): Promise<NodeOAuthClient> {
	if (oauthClient) {
		return oauthClient;
	}

	// Build client_id with required parameters
	const clientIdParams = new URLSearchParams();
	clientIdParams.append("redirect_uri", CALLBACK_URL);
	clientIdParams.append("scope", OAUTH_SCOPE);

	const clientOptions: NodeOAuthClientOptions = {
		clientMetadata: {
			client_id: `http://localhost?${clientIdParams.toString()}`,
			client_name: "Sequoia CLI",
			client_uri: "https://github.com/stevedylandev/sequoia",
			redirect_uris: [CALLBACK_URL],
			grant_types: ["authorization_code", "refresh_token"],
			response_types: ["code"],
			token_endpoint_auth_method: "none",
			application_type: "web",
			scope: OAUTH_SCOPE,
			dpop_bound_access_tokens: false,
		},
		stateStore,
		sessionStore,
		// Configure identity resolution
		plcDirectoryUrl: "https://plc.directory",
		// Provide lock mechanism to prevent warning
		requestLock,
	};

	oauthClient = new NodeOAuthClient(clientOptions);

	return oauthClient;
}

export function getOAuthScope(): string {
	return OAUTH_SCOPE;
}

export function getCallbackUrl(): string {
	return CALLBACK_URL;
}

export function getCallbackPort(): number {
	return CALLBACK_PORT;
}
