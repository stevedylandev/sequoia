import * as fs from "node:fs/promises";
import { command } from "cmd-ts";
import {
	intro,
	outro,
	note,
	text,
	confirm,
	select,
	spinner,
	log,
} from "@clack/prompts";
import { findConfig, loadConfig, generateConfigTemplate } from "../lib/config";
import {
	loadCredentials,
	listAllCredentials,
	getCredentials,
} from "../lib/credentials";
import { getOAuthHandle, getOAuthSession } from "../lib/oauth-store";
import { createAgent, getPublication, updatePublication } from "../lib/atproto";
import { exitOnCancel } from "../lib/prompts";
import type {
	PublisherConfig,
	FrontmatterMapping,
	BlueskyConfig,
} from "../lib/types";

export const updateCommand = command({
	name: "update",
	description: "Update local config or ATProto publication record",
	args: {},
	handler: async () => {
		intro("Sequoia Update");

		// Check if config exists
		const configPath = await findConfig();
		if (!configPath) {
			log.error("No configuration found. Run 'sequoia init' first.");
			process.exit(1);
		}

		const config = await loadConfig(configPath);

		// Ask what to update
		const updateChoice = exitOnCancel(
			await select({
				message: "What would you like to update?",
				options: [
					{ label: "Local configuration (sequoia.json)", value: "config" },
					{ label: "ATProto publication record", value: "publication" },
				],
			}),
		);

		if (updateChoice === "config") {
			await updateConfigFlow(config, configPath);
		} else {
			await updatePublicationFlow(config);
		}

		outro("Update complete!");
	},
});

async function updateConfigFlow(
	config: PublisherConfig,
	configPath: string,
): Promise<void> {
	// Show current config summary
	const configSummary = [
		`Site URL: ${config.siteUrl}`,
		`Content Dir: ${config.contentDir}`,
		`Path Prefix: ${config.pathPrefix || "/posts"}`,
		`Publication URI: ${config.publicationUri}`,
		config.imagesDir ? `Images Dir: ${config.imagesDir}` : null,
		config.outputDir ? `Output Dir: ${config.outputDir}` : null,
		config.bluesky?.enabled ? `Bluesky: enabled` : null,
	]
		.filter(Boolean)
		.join("\n");

	note(configSummary, "Current Configuration");

	let configUpdated = { ...config };
	let editing = true;

	while (editing) {
		const section = exitOnCancel(
			await select({
				message: "Select a section to edit:",
				options: [
					{ label: "Site settings (siteUrl, pathPrefix)", value: "site" },
					{
						label:
							"Directory paths (contentDir, imagesDir, publicDir, outputDir)",
						value: "directories",
					},
					{
						label:
							"Frontmatter mappings (title, description, publishDate, etc.)",
						value: "frontmatter",
					},
					{
						label:
							"Advanced options (pdsUrl, identity, ignore, removeIndexFromSlug, etc.)",
						value: "advanced",
					},
					{
						label: "Bluesky settings (enabled, maxAgeDays)",
						value: "bluesky",
					},
					{ label: "Done editing", value: "done" },
				],
			}),
		);

		if (section === "done") {
			editing = false;
			continue;
		}

		switch (section) {
			case "site":
				configUpdated = await editSiteSettings(configUpdated);
				break;
			case "directories":
				configUpdated = await editDirectories(configUpdated);
				break;
			case "frontmatter":
				configUpdated = await editFrontmatter(configUpdated);
				break;
			case "advanced":
				configUpdated = await editAdvanced(configUpdated);
				break;
			case "bluesky":
				configUpdated = await editBluesky(configUpdated);
				break;
		}
	}

	// Confirm before saving
	const shouldSave = exitOnCancel(
		await confirm({
			message: "Save changes to sequoia.json?",
			initialValue: true,
		}),
	);

	if (shouldSave) {
		const configContent = generateConfigTemplate({
			siteUrl: configUpdated.siteUrl,
			contentDir: configUpdated.contentDir,
			imagesDir: configUpdated.imagesDir,
			publicDir: configUpdated.publicDir,
			outputDir: configUpdated.outputDir,
			pathPrefix: configUpdated.pathPrefix,
			publicationUri: configUpdated.publicationUri,
			pdsUrl: configUpdated.pdsUrl,
			frontmatter: configUpdated.frontmatter,
			ignore: configUpdated.ignore,
			removeIndexFromSlug: configUpdated.removeIndexFromSlug,
			stripDatePrefix: configUpdated.stripDatePrefix,
			pathTemplate: configUpdated.pathTemplate,
			textContentField: configUpdated.textContentField,
			bluesky: configUpdated.bluesky,
		});

		await fs.writeFile(configPath, configContent);
		log.success("Configuration saved!");
	} else {
		log.info("Changes discarded.");
	}
}

async function editSiteSettings(
	config: PublisherConfig,
): Promise<PublisherConfig> {
	const siteUrl = exitOnCancel(
		await text({
			message: "Site URL:",
			initialValue: config.siteUrl,
			validate: (value) => {
				if (!value) return "Site URL is required";
				try {
					new URL(value);
				} catch {
					return "Please enter a valid URL";
				}
			},
		}),
	);

	const pathPrefix = exitOnCancel(
		await text({
			message: "URL path prefix for posts:",
			initialValue: config.pathPrefix || "/posts",
		}),
	);

	return {
		...config,
		siteUrl,
		pathPrefix: pathPrefix || undefined,
	};
}

async function editDirectories(
	config: PublisherConfig,
): Promise<PublisherConfig> {
	const contentDir = exitOnCancel(
		await text({
			message: "Content directory:",
			initialValue: config.contentDir,
			validate: (value) => {
				if (!value) return "Content directory is required";
			},
		}),
	);

	const imagesDir = exitOnCancel(
		await text({
			message: "Cover images directory (leave empty to skip):",
			initialValue: config.imagesDir || "",
		}),
	);

	const publicDir = exitOnCancel(
		await text({
			message: "Public/static directory:",
			initialValue: config.publicDir || "./public",
		}),
	);

	const outputDir = exitOnCancel(
		await text({
			message: "Build output directory:",
			initialValue: config.outputDir || "./dist",
		}),
	);

	return {
		...config,
		contentDir,
		imagesDir: imagesDir || undefined,
		publicDir: publicDir || undefined,
		outputDir: outputDir || undefined,
	};
}

async function editFrontmatter(
	config: PublisherConfig,
): Promise<PublisherConfig> {
	const currentFrontmatter = config.frontmatter || {};

	log.info("Press Enter to keep current value, or type a new field name.");

	const titleField = exitOnCancel(
		await text({
			message: "Field name for title:",
			initialValue: currentFrontmatter.title || "title",
		}),
	);

	const descField = exitOnCancel(
		await text({
			message: "Field name for description:",
			initialValue: currentFrontmatter.description || "description",
		}),
	);

	const dateField = exitOnCancel(
		await text({
			message: "Field name for publish date:",
			initialValue: currentFrontmatter.publishDate || "publishDate",
		}),
	);

	const coverField = exitOnCancel(
		await text({
			message: "Field name for cover image:",
			initialValue: currentFrontmatter.coverImage || "ogImage",
		}),
	);

	const tagsField = exitOnCancel(
		await text({
			message: "Field name for tags:",
			initialValue: currentFrontmatter.tags || "tags",
		}),
	);

	const draftField = exitOnCancel(
		await text({
			message: "Field name for draft status:",
			initialValue: currentFrontmatter.draft || "draft",
		}),
	);

	const slugField = exitOnCancel(
		await text({
			message: "Field name for slug (leave empty to use filepath):",
			initialValue: currentFrontmatter.slugField || "",
		}),
	);

	// Build frontmatter mapping, only including non-default values
	const fieldMappings: Array<[keyof FrontmatterMapping, string, string]> = [
		["title", titleField, "title"],
		["description", descField, "description"],
		["publishDate", dateField, "publishDate"],
		["coverImage", coverField, "ogImage"],
		["tags", tagsField, "tags"],
		["draft", draftField, "draft"],
	];

	const builtMapping = fieldMappings.reduce<FrontmatterMapping>(
		(acc, [key, value, defaultValue]) => {
			if (value !== defaultValue) {
				acc[key] = value;
			}
			return acc;
		},
		{},
	);

	// Handle slugField separately since it has no default
	if (slugField) {
		builtMapping.slugField = slugField;
	}

	const frontmatter =
		Object.keys(builtMapping).length > 0 ? builtMapping : undefined;

	return {
		...config,
		frontmatter,
	};
}

async function editAdvanced(config: PublisherConfig): Promise<PublisherConfig> {
	const pdsUrl = exitOnCancel(
		await text({
			message: "PDS URL (leave empty for default bsky.social):",
			initialValue: config.pdsUrl || "",
		}),
	);

	const identity = exitOnCancel(
		await text({
			message: "Identity/profile to use (leave empty for auto-detect):",
			initialValue: config.identity || "",
		}),
	);

	const ignoreInput = exitOnCancel(
		await text({
			message: "Ignore patterns (comma-separated, e.g., _index.md,drafts/**):",
			initialValue: config.ignore?.join(", ") || "",
		}),
	);

	const removeIndexFromSlug = exitOnCancel(
		await confirm({
			message: "Remove /index or /_index suffix from paths?",
			initialValue: config.removeIndexFromSlug || false,
		}),
	);

	const stripDatePrefix = exitOnCancel(
		await confirm({
			message: "Strip YYYY-MM-DD- prefix from filenames (Jekyll-style)?",
			initialValue: config.stripDatePrefix || false,
		}),
	);

	const textContentField = exitOnCancel(
		await text({
			message:
				"Frontmatter field for textContent (leave empty to use markdown body):",
			initialValue: config.textContentField || "",
		}),
	);

	// Parse ignore patterns
	const ignore = ignoreInput
		? ignoreInput
				.split(",")
				.map((p) => p.trim())
				.filter(Boolean)
		: undefined;

	return {
		...config,
		pdsUrl: pdsUrl || undefined,
		identity: identity || undefined,
		ignore: ignore && ignore.length > 0 ? ignore : undefined,
		removeIndexFromSlug: removeIndexFromSlug || undefined,
		stripDatePrefix: stripDatePrefix || undefined,
		textContentField: textContentField || undefined,
	};
}

async function editBluesky(config: PublisherConfig): Promise<PublisherConfig> {
	const enabled = exitOnCancel(
		await confirm({
			message: "Enable automatic Bluesky posting when publishing?",
			initialValue: config.bluesky?.enabled || false,
		}),
	);

	if (!enabled) {
		return {
			...config,
			bluesky: undefined,
		};
	}

	const maxAgeDaysInput = exitOnCancel(
		await text({
			message: "Maximum age (in days) for posts to be shared on Bluesky:",
			initialValue: String(config.bluesky?.maxAgeDays || 7),
			validate: (value) => {
				if (!value) return "Please enter a number";
				const num = Number.parseInt(value, 10);
				if (Number.isNaN(num) || num < 1) {
					return "Please enter a positive number";
				}
			},
		}),
	);

	const maxAgeDays = parseInt(maxAgeDaysInput, 10);

	const bluesky: BlueskyConfig = {
		enabled: true,
		...(maxAgeDays !== 7 && { maxAgeDays }),
	};

	return {
		...config,
		bluesky,
	};
}

async function updatePublicationFlow(config: PublisherConfig): Promise<void> {
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

	const s = spinner();
	s.start("Connecting to ATProto...");

	let agent: Awaited<ReturnType<typeof createAgent>>;
	try {
		agent = await createAgent(credentials);
		s.stop("Connected!");
	} catch (error) {
		s.stop("Failed to connect");
		log.error(`Failed to connect: ${error}`);
		process.exit(1);
	}

	// Fetch existing publication
	s.start("Fetching publication...");
	const publication = await getPublication(agent, config.publicationUri);

	if (!publication) {
		s.stop("Publication not found");
		log.error(`Could not find publication: ${config.publicationUri}`);
		process.exit(1);
	}
	s.stop("Publication loaded!");

	// Show current publication info
	const pubRecord = publication.value;
	const pubSummary = [
		`Name: ${pubRecord.name}`,
		`URL: ${pubRecord.url}`,
		pubRecord.description ? `Description: ${pubRecord.description}` : null,
		pubRecord.icon ? `Icon: (uploaded)` : null,
		`Show in Discover: ${pubRecord.preferences?.showInDiscover ?? true}`,
		`Created: ${pubRecord.createdAt}`,
	]
		.filter(Boolean)
		.join("\n");

	note(pubSummary, "Current Publication");

	// Collect updates with pre-populated values
	const name = exitOnCancel(
		await text({
			message: "Publication name:",
			initialValue: pubRecord.name,
			validate: (value) => {
				if (!value) return "Publication name is required";
			},
		}),
	);

	const description = exitOnCancel(
		await text({
			message: "Publication description (leave empty to clear):",
			initialValue: pubRecord.description || "",
		}),
	);

	const url = exitOnCancel(
		await text({
			message: "Publication URL:",
			initialValue: pubRecord.url,
			validate: (value) => {
				if (!value) return "URL is required";
				try {
					new URL(value);
				} catch {
					return "Please enter a valid URL";
				}
			},
		}),
	);

	const iconPath = exitOnCancel(
		await text({
			message: "New icon path (leave empty to keep existing):",
			initialValue: "",
		}),
	);

	const showInDiscover = exitOnCancel(
		await confirm({
			message: "Show in Discover feed?",
			initialValue: pubRecord.preferences?.showInDiscover ?? true,
		}),
	);

	// Confirm before updating
	const shouldUpdate = exitOnCancel(
		await confirm({
			message: "Update publication on ATProto?",
			initialValue: true,
		}),
	);

	if (!shouldUpdate) {
		log.info("Update cancelled.");
		return;
	}

	// Perform update
	s.start("Updating publication...");
	try {
		await updatePublication(
			agent,
			config.publicationUri,
			{
				name,
				description,
				url,
				iconPath: iconPath || undefined,
				showInDiscover,
			},
			pubRecord,
		);
		s.stop("Publication updated!");
	} catch (error) {
		s.stop("Failed to update publication");
		log.error(`Failed to update: ${error}`);
		process.exit(1);
	}
}
