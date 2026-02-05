import { select } from "@clack/prompts";
import { getOAuthHandle, getOAuthSession } from "./oauth-store";
import { getCredentials } from "./credentials";
import type { Credentials } from "./types";
import { exitOnCancel } from "./prompts";

/**
 * Prompt user to select from multiple credentials
 */
export async function selectCredential(
	allCredentials: Array<{ id: string; type: "app-password" | "oauth" }>,
): Promise<Credentials | null> {
	// Build options with friendly labels
	const options = await Promise.all(
		allCredentials.map(async ({ id, type }) => {
			let label = id;
			if (type === "oauth") {
				const handle = await getOAuthHandle(id);
				label = handle ? `${handle} (${id})` : id;
			}
			return {
				value: { id, type },
				label: `${label} [${type}]`,
			};
		}),
	);

	const selected = exitOnCancel(
		await select({
			message: "Multiple identities found. Select one:",
			options,
		}),
	);

	// Load the full credentials for the selected identity
	if (selected.type === "oauth") {
		const session = await getOAuthSession(selected.id);
		if (session) {
			const handle = await getOAuthHandle(selected.id);
			return {
				type: "oauth",
				did: selected.id,
				handle: handle || selected.id,
			};
		}
	} else {
		const creds = await getCredentials(selected.id);
		if (creds) {
			return creds;
		}
	}

	return null;
}
