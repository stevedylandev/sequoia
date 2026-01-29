import * as path from "path";
import * as os from "os";
import type { Credentials } from "./types";

const CONFIG_DIR = path.join(os.homedir(), ".config", "sequoia");
const CREDENTIALS_FILE = path.join(CONFIG_DIR, "credentials.json");

// Stored credentials keyed by identifier
type CredentialsStore = Record<string, Credentials>;

/**
 * Load all stored credentials
 */
async function loadCredentialsStore(): Promise<CredentialsStore> {
  const file = Bun.file(CREDENTIALS_FILE);
  if (!(await file.exists())) {
    return {};
  }

  try {
    const content = await file.text();
    const parsed = JSON.parse(content);

    // Handle legacy single-credential format (migrate on read)
    if (parsed.identifier && parsed.password) {
      const legacy = parsed as Credentials;
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
  await Bun.$`mkdir -p ${CONFIG_DIR}`;
  await Bun.write(CREDENTIALS_FILE, JSON.stringify(store, null, 2));
  await Bun.$`chmod 600 ${CREDENTIALS_FILE}`;
}

/**
 * Load credentials for a specific identity or resolve which to use.
 *
 * Priority:
 * 1. Full env vars (ATP_IDENTIFIER + ATP_APP_PASSWORD)
 * 2. SEQUOIA_PROFILE env var - selects from stored credentials
 * 3. projectIdentity parameter (from sequoia.json)
 * 4. If only one identity stored, use it
 * 5. Return null (caller should prompt user)
 */
export async function loadCredentials(
  projectIdentity?: string
): Promise<Credentials | null> {
  // 1. Check environment variables first (full override)
  const envIdentifier = process.env.ATP_IDENTIFIER;
  const envPassword = process.env.ATP_APP_PASSWORD;
  const envPdsUrl = process.env.PDS_URL;

  if (envIdentifier && envPassword) {
    return {
      identifier: envIdentifier,
      password: envPassword,
      pdsUrl: envPdsUrl || "https://bsky.social",
    };
  }

  const store = await loadCredentialsStore();
  const identifiers = Object.keys(store);

  if (identifiers.length === 0) {
    return null;
  }

  // 2. SEQUOIA_PROFILE env var
  const profileEnv = process.env.SEQUOIA_PROFILE;
  if (profileEnv && store[profileEnv]) {
    return store[profileEnv];
  }

  // 3. Project-specific identity (from sequoia.json)
  if (projectIdentity && store[projectIdentity]) {
    return store[projectIdentity];
  }

  // 4. If only one identity, use it
  if (identifiers.length === 1 && identifiers[0]) {
    return store[identifiers[0]] ?? null;
  }

  // Multiple identities exist but none selected
  return null;
}

/**
 * Get a specific identity by identifier
 */
export async function getCredentials(
  identifier: string
): Promise<Credentials | null> {
  const store = await loadCredentialsStore();
  return store[identifier] || null;
}

/**
 * List all stored identities
 */
export async function listCredentials(): Promise<string[]> {
  const store = await loadCredentialsStore();
  return Object.keys(store);
}

/**
 * Save credentials for an identity (adds or updates)
 */
export async function saveCredentials(credentials: Credentials): Promise<void> {
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
