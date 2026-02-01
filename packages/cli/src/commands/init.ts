import * as fs from "fs/promises";
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
	group,
} from "@clack/prompts";
import * as path from "path";
import { findConfig, generateConfigTemplate } from "../lib/config";
import { loadCredentials } from "../lib/credentials";
import { createAgent, createPublication } from "../lib/atproto";
import type { FrontmatterMapping, BlueskyConfig } from "../lib/types";

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

const onCancel = () => {
	outro("Setup cancelled");
	process.exit(0);
};

export const initCommand = command({
	name: "init",
	description: "Initialize a new publisher configuration",
	args: {},
	handler: async () => {
		intro("Sequoia Configuration Setup");

		// Check if config already exists
		const existingConfig = await findConfig();
		if (existingConfig) {
			const overwrite = await confirm({
				message: `Config already exists at ${existingConfig}. Overwrite?`,
				initialValue: false,
			});
			if (overwrite === Symbol.for("cancel")) {
				onCancel();
			}
			if (!overwrite) {
				log.info("Keeping existing configuration");
				return;
			}
		}

		note("Follow the prompts to build your config for publishing", "Setup");

		// Site configuration group
		const siteConfig = await group(
			{
				siteUrl: () =>
					text({
						message: "Site URL (canonical URL of your site):",
						placeholder: "https://example.com",
						validate: (value) => {
							if (!value) return "Site URL is required";
							try {
								new URL(value);
							} catch {
								return "Please enter a valid URL";
							}
						},
					}),
				contentDir: () =>
					text({
						message: "Content directory:",
						placeholder: "./src/content/blog",
					}),
				imagesDir: () =>
					text({
						message: "Cover images directory (leave empty to skip):",
						placeholder: "./src/assets",
					}),
				publicDir: () =>
					text({
						message: "Public/static directory (for .well-known files):",
						placeholder: "./public",
					}),
				outputDir: () =>
					text({
						message: "Build output directory (for link tag injection):",
						placeholder: "./dist",
					}),
				pathPrefix: () =>
					text({
						message: "URL path prefix for posts:",
						placeholder: "/posts, /blog, /articles, etc.",
					}),
			},
			{ onCancel },
		);

		log.info(
			"Configure your frontmatter field mappings (press Enter to use defaults):",
		);

		// Frontmatter mapping group
		const frontmatterConfig = await group(
			{
				titleField: () =>
					text({
						message: "Field name for title:",
						defaultValue: "title",
						placeholder: "title",
					}),
				descField: () =>
					text({
						message: "Field name for description:",
						defaultValue: "description",
						placeholder: "description",
					}),
				dateField: () =>
					text({
						message: "Field name for publish date:",
						defaultValue: "publishDate",
						placeholder: "publishDate, pubDate, date, etc.",
					}),
				coverField: () =>
					text({
						message: "Field name for cover image:",
						defaultValue: "ogImage",
						placeholder: "ogImage, coverImage, image, hero, etc.",
					}),
				tagsField: () =>
					text({
						message: "Field name for tags:",
						defaultValue: "tags",
						placeholder: "tags, categories, keywords, etc.",
					}),
				draftField: () =>
					text({
						message: "Field name for draft status:",
						defaultValue: "draft",
						placeholder: "draft, private, hidden, etc.",
					}),
			},
			{ onCancel },
		);

		// Build frontmatter mapping object
		const fieldMappings: Array<[keyof FrontmatterMapping, string, string]> = [
			["title", frontmatterConfig.titleField, "title"],
			["description", frontmatterConfig.descField, "description"],
			["publishDate", frontmatterConfig.dateField, "publishDate"],
			["coverImage", frontmatterConfig.coverField, "ogImage"],
			["tags", frontmatterConfig.tagsField, "tags"],
			["draft", frontmatterConfig.draftField, "draft"],
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

		// Only keep frontmatterMapping if it has any custom fields
		const frontmatterMapping =
			Object.keys(builtMapping).length > 0 ? builtMapping : undefined;

		// Publication setup
		const publicationChoice = await select({
			message: "Publication setup:",
			options: [
				{ label: "Create a new publication", value: "create" },
				{ label: "Use an existing publication AT URI", value: "existing" },
			],
		});

		if (publicationChoice === Symbol.for("cancel")) {
			onCancel();
		}

		let publicationUri: string;
		const credentials = await loadCredentials();

		if (publicationChoice === "create") {
			// Need credentials to create a publication
			if (!credentials) {
				log.error(
					"You must authenticate first. Run 'sequoia auth' before creating a publication.",
				);
				process.exit(1);
			}

			const s = spinner();
			s.start("Connecting to ATProto...");
			let agent;
			try {
				agent = await createAgent(credentials);
				s.stop("Connected!");
			} catch (error) {
				s.stop("Failed to connect");
				log.error(
					"Failed to connect. Check your credentials with 'sequoia auth'.",
				);
				process.exit(1);
			}

			const publicationConfig = await group(
				{
					name: () =>
						text({
							message: "Publication name:",
							placeholder: "My Blog",
							validate: (value) => {
								if (!value) return "Publication name is required";
							},
						}),
					description: () =>
						text({
							message: "Publication description (optional):",
							placeholder: "A blog about...",
						}),
					iconPath: () =>
						text({
							message: "Icon image path (leave empty to skip):",
							placeholder: "./public/favicon.png",
						}),
					showInDiscover: () =>
						confirm({
							message: "Show in Discover feed?",
							initialValue: true,
						}),
				},
				{ onCancel },
			);

			s.start("Creating publication...");
			try {
				publicationUri = await createPublication(agent, {
					url: siteConfig.siteUrl,
					name: publicationConfig.name,
					description: publicationConfig.description || undefined,
					iconPath: publicationConfig.iconPath || undefined,
					showInDiscover: publicationConfig.showInDiscover,
				});
				s.stop(`Publication created: ${publicationUri}`);
			} catch (error) {
				s.stop("Failed to create publication");
				log.error(`Failed to create publication: ${error}`);
				process.exit(1);
			}
		} else {
			const uri = await text({
				message: "Publication AT URI:",
				placeholder: "at://did:plc:.../site.standard.publication/...",
				validate: (value) => {
					if (!value) return "Publication URI is required";
				},
			});

			if (uri === Symbol.for("cancel")) {
				onCancel();
			}
			publicationUri = uri as string;
		}

		// Bluesky posting configuration
		const enableBluesky = await confirm({
			message: "Enable automatic Bluesky posting when publishing?",
			initialValue: false,
		});

		if (enableBluesky === Symbol.for("cancel")) {
			onCancel();
		}

		let blueskyConfig: BlueskyConfig | undefined;
		if (enableBluesky) {
			const maxAgeDaysInput = await text({
				message: "Maximum age (in days) for posts to be shared on Bluesky:",
				defaultValue: "7",
				placeholder: "7",
				validate: (value) => {
					const num = parseInt(value, 10);
					if (isNaN(num) || num < 1) {
						return "Please enter a positive number";
					}
				},
			});

			if (maxAgeDaysInput === Symbol.for("cancel")) {
				onCancel();
			}

			const maxAgeDays = parseInt(maxAgeDaysInput as string, 10);
			blueskyConfig = {
				enabled: true,
				...(maxAgeDays !== 7 && { maxAgeDays }),
			};
		}

		// Get PDS URL from credentials (already loaded earlier)
		const pdsUrl = credentials?.pdsUrl;

		// Generate config file
		const configContent = generateConfigTemplate({
			siteUrl: siteConfig.siteUrl,
			contentDir: siteConfig.contentDir || "./content",
			imagesDir: siteConfig.imagesDir || undefined,
			publicDir: siteConfig.publicDir || "./public",
			outputDir: siteConfig.outputDir || "./dist",
			pathPrefix: siteConfig.pathPrefix || "/posts",
			publicationUri,
			pdsUrl,
			frontmatter: frontmatterMapping,
			bluesky: blueskyConfig,
		});

		const configPath = path.join(process.cwd(), "sequoia.json");
		await fs.writeFile(configPath, configContent);

		log.success(`Configuration saved to ${configPath}`);

		// Create .well-known/site.standard.publication file
		const publicDir = siteConfig.publicDir || "./public";
		const resolvedPublicDir = path.isAbsolute(publicDir)
			? publicDir
			: path.join(process.cwd(), publicDir);
		const wellKnownDir = path.join(resolvedPublicDir, ".well-known");
		const wellKnownPath = path.join(wellKnownDir, "site.standard.publication");

		// Ensure .well-known directory exists
		await fs.mkdir(wellKnownDir, { recursive: true });
		await fs.writeFile(path.join(wellKnownDir, ".gitkeep"), "");
		await fs.writeFile(wellKnownPath, publicationUri);

		log.success(`Created ${wellKnownPath}`);

		// Update .gitignore
		const gitignorePath = path.join(process.cwd(), ".gitignore");
		const stateFilename = ".sequoia-state.json";

		if (await fileExists(gitignorePath)) {
			const gitignoreContent = await fs.readFile(gitignorePath, "utf-8");
			if (!gitignoreContent.includes(stateFilename)) {
				await fs.writeFile(
					gitignorePath,
					gitignoreContent + `\n${stateFilename}\n`,
				);
				log.info(`Added ${stateFilename} to .gitignore`);
			}
		} else {
			await fs.writeFile(gitignorePath, `${stateFilename}\n`);
			log.info(`Created .gitignore with ${stateFilename}`);
		}

		note(
			"Next steps:\n" +
				"1. Run 'sequoia publish --dry-run' to preview\n" +
				"2. Run 'sequoia publish' to publish your content",
			"Setup complete!",
		);

		outro("Happy publishing!");
	},
});
