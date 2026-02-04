import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type {
	NodeSavedSession,
	NodeSavedSessionStore,
	NodeSavedState,
	NodeSavedStateStore,
} from "@atproto/oauth-client-node";

const CONFIG_DIR = path.join(os.homedir(), ".config", "sequoia");
const OAUTH_FILE = path.join(CONFIG_DIR, "oauth.json");

interface OAuthStore {
	states: Record<string, NodeSavedState>;
	sessions: Record<string, NodeSavedSession>;
	handles?: Record<string, string>; // DID -> handle mapping (optional for backwards compat)
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function loadOAuthStore(): Promise<OAuthStore> {
	if (!(await fileExists(OAUTH_FILE))) {
		return { states: {}, sessions: {} };
	}

	try {
		const content = await fs.readFile(OAUTH_FILE, "utf-8");
		return JSON.parse(content) as OAuthStore;
	} catch {
		return { states: {}, sessions: {} };
	}
}

async function saveOAuthStore(store: OAuthStore): Promise<void> {
	await fs.mkdir(CONFIG_DIR, { recursive: true });
	await fs.writeFile(OAUTH_FILE, JSON.stringify(store, null, 2));
	await fs.chmod(OAUTH_FILE, 0o600);
}

/**
 * State store for PKCE flow (temporary, used during auth)
 */
export const stateStore: NodeSavedStateStore = {
	async set(key: string, state: NodeSavedState): Promise<void> {
		const store = await loadOAuthStore();
		store.states[key] = state;
		await saveOAuthStore(store);
	},

	async get(key: string): Promise<NodeSavedState | undefined> {
		const store = await loadOAuthStore();
		return store.states[key];
	},

	async del(key: string): Promise<void> {
		const store = await loadOAuthStore();
		delete store.states[key];
		await saveOAuthStore(store);
	},
};

/**
 * Session store for OAuth tokens (persistent)
 */
export const sessionStore: NodeSavedSessionStore = {
	async set(sub: string, session: NodeSavedSession): Promise<void> {
		const store = await loadOAuthStore();
		store.sessions[sub] = session;
		await saveOAuthStore(store);
	},

	async get(sub: string): Promise<NodeSavedSession | undefined> {
		const store = await loadOAuthStore();
		return store.sessions[sub];
	},

	async del(sub: string): Promise<void> {
		const store = await loadOAuthStore();
		delete store.sessions[sub];
		await saveOAuthStore(store);
	},
};

/**
 * List all stored OAuth session DIDs
 */
export async function listOAuthSessions(): Promise<string[]> {
	const store = await loadOAuthStore();
	return Object.keys(store.sessions);
}

/**
 * Get an OAuth session by DID
 */
export async function getOAuthSession(
	did: string,
): Promise<NodeSavedSession | undefined> {
	const store = await loadOAuthStore();
	return store.sessions[did];
}

/**
 * Delete an OAuth session by DID
 */
export async function deleteOAuthSession(did: string): Promise<boolean> {
	const store = await loadOAuthStore();
	if (!store.sessions[did]) {
		return false;
	}
	delete store.sessions[did];
	await saveOAuthStore(store);
	return true;
}

export function getOAuthStorePath(): string {
	return OAUTH_FILE;
}

/**
 * Store handle for an OAuth session (DID -> handle mapping)
 */
export async function setOAuthHandle(
	did: string,
	handle: string,
): Promise<void> {
	const store = await loadOAuthStore();
	if (!store.handles) {
		store.handles = {};
	}
	store.handles[did] = handle;
	await saveOAuthStore(store);
}

/**
 * Get handle for an OAuth session by DID
 */
export async function getOAuthHandle(did: string): Promise<string | undefined> {
	const store = await loadOAuthStore();
	return store.handles?.[did];
}

/**
 * List all stored OAuth sessions with their handles
 */
export async function listOAuthSessionsWithHandles(): Promise<
	Array<{ did: string; handle?: string }>
> {
	const store = await loadOAuthStore();
	return Object.keys(store.sessions).map((did) => ({
		did,
		handle: store.handles?.[did],
	}));
}
