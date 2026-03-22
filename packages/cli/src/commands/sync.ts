import { command, flag } from "cmd-ts";
import { select, spinner, log } from "@clack/prompts";
import * as path from "node:path";
import { loadConfig, findConfig } from "../lib/config";
import {
	loadCredentials,
	listAllCredentials,
	getCredentials,
} from "../lib/credentials";
import { getOAuthHandle, getOAuthSession } from "../lib/oauth-store";
import { createAgent } from "../lib/atproto";
import { syncStateFromPDS } from "../lib/sync";
import { exitOnCancel } from "../lib/prompts";

export const syncCommand = command({
	name: "sync",
	description: "Sync state from ATProto to restore .sequoia-state.json",
	args: {
		updateFrontmatter: flag({
			long: "update-frontmatter",
			short: "u",
			description: "Update frontmatter atUri fields in local markdown files",
		}),
		dryRun: flag({
			long: "dry-run",
			short: "n",
			description: "Preview what would be synced without making changes",
		}),
	},
	handler: async ({ updateFrontmatter, dryRun }) => {
		// Load config
		const configPath = await findConfig();
		if (!configPath) {
			log.error("No sequoia.json found. Run 'sequoia init' first.");
			process.exit(1);
		}

		const config = await loadConfig(configPath);
		const configDir = path.dirname(configPath);

		log.info(`Site: ${config.siteUrl}`);
		log.info(`Publication: ${config.publicationUri}`);

		// Load credentials
		let credentials = await loadCredentials(config.identity);

		if (!credentials) {
			const identities = await listAllCredentials();
			if (identities.length === 0) {
				log.error(
					"No credentials found. Run 'sequoia login' or 'sequoia auth' first.",
				);
				process.exit(1);
			}

			// Build labels with handles for OAuth sessions
			const options = await Promise.all(
				identities.map(async (cred) => {
					if (cred.type === "oauth") {
						const handle = await getOAuthHandle(cred.id);
						return {
							value: cred.id,
							label: `${handle || cred.id} (OAuth)`,
						};
					}
					return {
						value: cred.id,
						label: `${cred.id} (App Password)`,
					};
				}),
			);

			log.info("Multiple identities found. Select one to use:");
			const selected = exitOnCancel(
				await select({
					message: "Identity:",
					options,
				}),
			);

			// Load the selected credentials
			const selectedCred = identities.find((c) => c.id === selected);
			if (selectedCred?.type === "oauth") {
				const session = await getOAuthSession(selected);
				if (session) {
					const handle = await getOAuthHandle(selected);
					credentials = {
						type: "oauth",
						did: selected,
						handle: handle || selected,
					};
				}
			} else {
				credentials = await getCredentials(selected);
			}

			if (!credentials) {
				log.error("Failed to load selected credentials.");
				process.exit(1);
			}
		}

		// Create agent
		const s = spinner();
		const connectingTo =
			credentials.type === "oauth" ? credentials.handle : credentials.pdsUrl;
		s.start(`Connecting as ${connectingTo}...`);
		let agent: Awaited<ReturnType<typeof createAgent>> | undefined;
		try {
			agent = await createAgent(credentials);
			s.stop(`Logged in as ${agent.did}`);
		} catch (error) {
			s.stop("Failed to login");
			log.error(`Failed to login: ${error}`);
			process.exit(1);
		}

		// Sync state from PDS
		s.start("Fetching documents from PDS...");
		const result = await syncStateFromPDS(agent, config, configDir, {
			updateFrontmatter,
			dryRun,
			quiet: false,
		});
		s.stop(`Found documents on PDS`);

		if (!dryRun) {
			const stateCount = Object.keys(result.state.posts).length;
			log.success(`\nSaved .sequoia-state.json (${stateCount} entries)`);

			if (result.frontmatterUpdatesApplied > 0) {
				log.success(
					`Updated frontmatter in ${result.frontmatterUpdatesApplied} files`,
				);
			}
		}

		log.success("\nSync complete!");
	},
});
