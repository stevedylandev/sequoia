import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
	getOAuthHandle,
	getOAuthSession,
	listOAuthSessions,
	listOAuthSessionsWithHandles,
} from "./oauth-store";
import type {
	AppPasswordCredentials,
	Credentials,
	LegacyCredentials,
	OAuthCredentials,
} from "./types";

const CONFIG_DIR = path.join(os.homedir(), ".config", "sequoia");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");

// Stored credentials keyed by identifier (can be legacy or typed)
type CredentialsStore = Record<
	string,
	AppPasswordCredentials | LegacyCredentials
>;

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Normalize credentials to have explicit type
 */
function normalizeCredentials(
	creds: AppPasswordCredentials | LegacyCredentials,
): AppPasswordCredentials {
	// If it already has type, return as-is
	if ("type" in creds && creds.type === "app-password") {
		return creds;
	}
	// Migrate legacy format
	return {
		type: "app-password",
		pdsUrl: creds.pdsUrl,
		identifier: creds.identifier,
		password: creds.password,
	};
}

async function loadCredentialsStore(): Promise<CredentialsStore> {
	if (!(await fileExists(CREDENTIALS_FILE))) {
		return {};
	}

	try {
		const content = await fs.readFile(CREDENTIALS_FILE, "utf-8");
		const parsed = JSON.parse(content);

		// Handle legacy single-credential format (migrate on read)
		if (parsed.identifier && parsed.password) {
			const legacy = parsed as LegacyCredentials;
			return { [legacy.identifier]: legacy };
		}

		return parsed as CredentialsStore;
	} catch {
		return {};
	}
}

/**
 * Save the entire credentials store
 */
async function saveCredentialsStore(store: CredentialsStore): Promise<void> {
	await fs.mkdir(CONFIG_DIR, { recursive: true });
	await fs.writeFile(CREDENTIALS_FILE, JSON.stringify(store, null, 2));
	await fs.chmod(CREDENTIALS_FILE, 0o600);
}

/**
 * Try to load OAuth credentials for a given profile (DID or handle)
 */
async function tryLoadOAuthCredentials(
	profile: string,
): Promise<OAuthCredentials | null> {
	// If it looks like a DID, try to get the session directly
	if (profile.startsWith("did:")) {
		const session = await getOAuthSession(profile);
		if (session) {
			const handle = await getOAuthHandle(profile);
			return {
				type: "oauth",
				did: profile,
				handle: handle || profile,
			};
		}
	}

	// Try to find OAuth session by handle
	const sessions = await listOAuthSessionsWithHandles();
	const match = sessions.find((s) => s.handle === profile);
	if (match) {
		return {
			type: "oauth",
			did: match.did,
			handle: match.handle || match.did,
		};
	}

	return null;
}

/**
 * Load credentials for a specific identity or resolve which to use.
 *
 * Priority:
 * 1. Full env vars (ATP_IDENTIFIER + ATP_APP_PASSWORD)
 * 2. SEQUOIA_PROFILE env var - selects from stored credentials (app-password or OAuth DID)
 * 3. projectIdentity parameter (from sequoia.json)
 * 4. If only one identity stored (app-password or OAuth), use it
 * 5. Return null (caller should prompt user)
 */
export async function loadCredentials(
	projectIdentity?: string,
): Promise<Credentials | null> {
	// 1. Check environment variables first (full override)
	const envIdentifier = process.env.ATP_IDENTIFIER;
	const envPassword = process.env.ATP_APP_PASSWORD;
	const envPdsUrl = process.env.PDS_URL;

	if (envIdentifier && envPassword) {
		return {
			type: "app-password",
			identifier: envIdentifier,
			password: envPassword,
			pdsUrl: envPdsUrl || "https://bsky.social",
		};
	}

	const store = await loadCredentialsStore();
	const appPasswordIds = Object.keys(store);
	const oauthDids = await listOAuthSessions();

	// 2. SEQUOIA_PROFILE env var
	const profileEnv = process.env.SEQUOIA_PROFILE;
	if (profileEnv) {
		// Try app-password credentials first
		if (store[profileEnv]) {
			return normalizeCredentials(store[profileEnv]);
		}
		// Try OAuth session (profile could be a DID)
		const oauth = await tryLoadOAuthCredentials(profileEnv);
		if (oauth) {
			return oauth;
		}
	}

	// 3. Project-specific identity (from sequoia.json)
	if (projectIdentity) {
		if (store[projectIdentity]) {
			return normalizeCredentials(store[projectIdentity]);
		}
		const oauth = await tryLoadOAuthCredentials(projectIdentity);
		if (oauth) {
			return oauth;
		}
	}

	// 4. If only one identity total, use it
	const totalIdentities = appPasswordIds.length + oauthDids.length;
	if (totalIdentities === 1) {
		if (appPasswordIds.length === 1 && appPasswordIds[0]) {
			return normalizeCredentials(store[appPasswordIds[0]]!);
		}
		if (oauthDids.length === 1 && oauthDids[0]) {
			const session = await getOAuthSession(oauthDids[0]);
			if (session) {
				const handle = await getOAuthHandle(oauthDids[0]);
				return {
					type: "oauth",
					did: oauthDids[0],
					handle: handle || oauthDids[0],
				};
			}
		}
	}

	// Multiple identities exist but none selected, or no identities
	return null;
}

/**
 * Get a specific identity by identifier (app-password only)
 */
export async function getCredentials(
	identifier: string,
): Promise<AppPasswordCredentials | null> {
	const store = await loadCredentialsStore();
	const creds = store[identifier];
	if (!creds) return null;
	return normalizeCredentials(creds);
}

/**
 * List all stored app-password identities
 */
export async function listCredentials(): Promise<string[]> {
	const store = await loadCredentialsStore();
	return Object.keys(store);
}

/**
 * List all credentials (both app-password and OAuth)
 */
export async function listAllCredentials(): Promise<
	Array<{ id: string; type: "app-password" | "oauth" }>
> {
	const store = await loadCredentialsStore();
	const oauthDids = await listOAuthSessions();

	const result: Array<{ id: string; type: "app-password" | "oauth" }> = [];

	for (const id of Object.keys(store)) {
		result.push({ id, type: "app-password" });
	}

	for (const did of oauthDids) {
		result.push({ id: did, type: "oauth" });
	}

	return result;
}

/**
 * Save app-password credentials for an identity (adds or updates)
 */
export async function saveCredentials(
	credentials: AppPasswordCredentials,
): Promise<void> {
	const store = await loadCredentialsStore();
	store[credentials.identifier] = credentials;
	await saveCredentialsStore(store);
}

/**
 * Delete credentials for a specific identity
 */
export async function deleteCredentials(identifier?: string): Promise<boolean> {
	const store = await loadCredentialsStore();
	const identifiers = Object.keys(store);

	if (identifiers.length === 0) {
		return false;
	}

	// If identifier specified, delete just that one
	if (identifier) {
		if (!store[identifier]) {
			return false;
		}
		delete store[identifier];
		await saveCredentialsStore(store);
		return true;
	}

	// If only one identity, delete it (backwards compat behavior)
	if (identifiers.length === 1 && identifiers[0]) {
		delete store[identifiers[0]];
		await saveCredentialsStore(store);
		return true;
	}

	// Multiple identities but none specified
	return false;
}

export function getCredentialsPath(): string {
	return CREDENTIALS_FILE;
}
