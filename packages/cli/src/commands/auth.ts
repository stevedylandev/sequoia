import { AtpAgent } from "@atproto/api";
import {
	confirm,
	log,
	note,
	password,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { command, flag, option, optional, string } from "cmd-ts";
import { resolveHandleToPDS } from "../lib/atproto";
import {
	deleteCredentials,
	getCredentials,
	getCredentialsPath,
	listCredentials,
	saveCredentials,
} from "../lib/credentials";
import { exitOnCancel } from "../lib/prompts";

export const authCommand = command({
	name: "auth",
	description: "Authenticate with your ATProto PDS",
	args: {
		logout: option({
			long: "logout",
			description:
				"Remove credentials for a specific identity (or all if only one exists)",
			type: optional(string),
		}),
		list: flag({
			long: "list",
			description: "List all stored identities",
		}),
	},
	handler: async ({ logout, list }) => {
		// List identities
		if (list) {
			const identities = await listCredentials();
			if (identities.length === 0) {
				log.info("No stored identities");
			} else {
				log.info("Stored identities:");
				for (const id of identities) {
					console.log(`  - ${id}`);
				}
			}
			return;
		}

		// Logout
		if (logout !== undefined) {
			// If --logout was passed without a value, it will be an empty string
			const identifier = logout || undefined;

			if (!identifier) {
				// No identifier provided - show available and prompt
				const identities = await listCredentials();
				if (identities.length === 0) {
					log.info("No saved credentials found");
					return;
				}
				if (identities.length === 1) {
					const deleted = await deleteCredentials(identities[0]);
					if (deleted) {
						log.success(`Removed credentials for ${identities[0]}`);
					}
					return;
				}
				// Multiple identities - prompt
				const selected = exitOnCancel(
					await select({
						message: "Select identity to remove:",
						options: identities.map((id) => ({ value: id, label: id })),
					}),
				);
				const deleted = await deleteCredentials(selected);
				if (deleted) {
					log.success(`Removed credentials for ${selected}`);
				}
				return;
			}

			const deleted = await deleteCredentials(identifier);
			if (deleted) {
				log.success(`Removed credentials for ${identifier}`);
			} else {
				log.info(`No credentials found for ${identifier}`);
			}
			return;
		}

		note(
			"To authenticate, you'll need an App Password.\n\n" +
				"Create one at: https://bsky.app/settings/app-passwords\n\n" +
				"App Passwords are safer than your main password and can be revoked.",
			"Authentication",
		);

		const identifier = exitOnCancel(
			await text({
				message: "Handle or DID:",
				placeholder: "yourhandle.bsky.social",
			}),
		);

		const appPassword = exitOnCancel(
			await password({
				message: "App Password:",
			}),
		);

		if (!identifier || !appPassword) {
			log.error("Handle and password are required");
			process.exit(1);
		}

		// Check if this identity already exists
		const existing = await getCredentials(identifier);
		if (existing) {
			const overwrite = exitOnCancel(
				await confirm({
					message: `Credentials for ${identifier} already exist. Update?`,
					initialValue: false,
				}),
			);
			if (!overwrite) {
				log.info("Keeping existing credentials");
				return;
			}
		}

		// Resolve PDS from handle
		const s = spinner();
		s.start("Resolving PDS...");
		let pdsUrl: string;
		try {
			pdsUrl = await resolveHandleToPDS(identifier);
			s.stop(`Found PDS: ${pdsUrl}`);
		} catch (error) {
			s.stop("Failed to resolve PDS");
			log.error(`Failed to resolve PDS from handle: ${error}`);
			process.exit(1);
		}

		// Verify credentials
		s.start("Verifying credentials...");

		try {
			const agent = new AtpAgent({ service: pdsUrl });
			await agent.login({
				identifier: identifier,
				password: appPassword,
			});

			s.stop(`Logged in as ${agent.session?.handle}`);

			// Save credentials
			await saveCredentials({
				type: "app-password",
				pdsUrl,
				identifier: identifier,
				password: appPassword,
			});

			log.success(`Credentials saved to ${getCredentialsPath()}`);
		} catch (error) {
			s.stop("Failed to login");
			log.error(`Failed to login: ${error}`);
			process.exit(1);
		}
	},
});
