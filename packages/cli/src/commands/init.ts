import { command } from "cmd-ts";
import { consola } from "consola";
import * as path from "path";
import { findConfig, generateConfigTemplate } from "../lib/config";
import { loadCredentials } from "../lib/credentials";
import { createAgent, createPublication } from "../lib/atproto";
import type { FrontmatterMapping } from "../lib/types";

export const initCommand = command({
	name: "init",
	description: "Initialize a new publisher configuration",
	args: {},
	handler: async () => {
		// Check if config already exists
		const existingConfig = await findConfig();
		if (existingConfig) {
			const overwrite = await consola.prompt(
				`Config already exists at ${existingConfig}. Overwrite?`,
				{
					type: "confirm",
					initial: false,
				},
			);
			if (!overwrite) {
				consola.info("Keeping existing configuration");
				return;
			}
		}

		consola.box(
			"Publisher Configuration Setup\n\nLet's set up your publisher configuration.",
		);

		const siteUrl = await consola.prompt(
			"Site URL (canonical URL of your site):",
			{
				type: "text",
				placeholder: "https://example.com",
			},
		);

		if (!siteUrl) {
			consola.error("Site URL is required");
			process.exit(1);
		}

		const contentDir = await consola.prompt(
			"Content directory (relative path):",
			{
				type: "text",
				default: "./content",
				placeholder: "./content",
			},
		);

		const hasImages = await consola.prompt(
			"Do you have a separate directory for cover images?",
			{
				type: "confirm",
				initial: false,
			},
		);

		let imagesDir: string | undefined;
		if (hasImages) {
			const imgDir = await consola.prompt(
				"Cover images directory (where cover/og images are stored):",
				{
					type: "text",
					placeholder: "./public/images",
				},
			);
			imagesDir = imgDir as string;
		}

		// Public/static directory for .well-known files
		const publicDir = await consola.prompt(
			"Public/static directory (for .well-known files):",
			{
				type: "text",
				default: "./public",
				placeholder: "./public (Astro, Next.js) or ./static (Hugo)",
			},
		);

		// Output directory for inject command
		const outputDir = await consola.prompt(
			"Build output directory (for link tag injection):",
			{
				type: "text",
				default: "./dist",
				placeholder: "./dist (Astro) or ./public (Hugo) or ./out (Next.js)",
			},
		);

		// Path prefix for posts
		const pathPrefix = await consola.prompt(
			"URL path prefix for posts:",
			{
				type: "text",
				default: "/posts",
				placeholder: "/posts, /blog, /articles, etc.",
			},
		);

		// Frontmatter mapping configuration
		const customFrontmatter = await consola.prompt(
			"Do you use custom frontmatter field names?",
			{
				type: "confirm",
				initial: false,
			},
		);

		let frontmatterMapping: FrontmatterMapping | undefined;
		if (customFrontmatter) {
			consola.info(
				"Configure your frontmatter field mappings (press Enter to use defaults):",
			);

			const titleField = await consola.prompt("Field name for title:", {
				type: "text",
				default: "title",
				placeholder: "title",
			});

			const descField = await consola.prompt("Field name for description:", {
				type: "text",
				default: "description",
				placeholder: "description",
			});

			const dateField = await consola.prompt("Field name for publish date:", {
				type: "text",
				default: "publishDate",
				placeholder: "publishDate, pubDate, date, etc.",
			});

			const coverField = await consola.prompt("Field name for cover image:", {
				type: "text",
				default: "ogImage",
				placeholder: "ogImage, coverImage, image, hero, etc.",
			});

			frontmatterMapping = {};

			if (titleField && titleField !== "title") {
				frontmatterMapping.title = titleField as string;
			}
			if (descField && descField !== "description") {
				frontmatterMapping.description = descField as string;
			}
			if (dateField && dateField !== "publishDate") {
				frontmatterMapping.publishDate = dateField as string;
			}
			if (coverField && coverField !== "ogImage") {
				frontmatterMapping.coverImage = coverField as string;
			}

			// Only keep frontmatterMapping if it has any custom fields
			if (Object.keys(frontmatterMapping).length === 0) {
				frontmatterMapping = undefined;
			}
		}

		// Publication setup
		const publicationChoice = await consola.prompt("Publication setup:", {
			type: "select",
			options: [
				{ label: "Create a new publication", value: "create" },
				{ label: "Use an existing publication AT URI", value: "existing" },
			],
		});

		let publicationUri: string;
		let credentials = await loadCredentials();

		if (publicationChoice === "create") {
			// Need credentials to create a publication
			if (!credentials) {
				consola.error(
					"You must authenticate first. Run 'sequoia auth' before creating a publication.",
				);
				process.exit(1);
			}

			consola.start("Connecting to ATProto...");
			let agent;
			try {
				agent = await createAgent(credentials);
				consola.success("Connected!");
			} catch (error) {
				consola.error(
					"Failed to connect. Check your credentials with 'sequoia auth'.",
				);
				process.exit(1);
			}

			const pubName = await consola.prompt("Publication name:", {
				type: "text",
				placeholder: "My Blog",
			});

			if (!pubName) {
				consola.error("Publication name is required");
				process.exit(1);
			}

			const pubDescription = await consola.prompt(
				"Publication description (optional):",
				{
					type: "text",
					placeholder: "A blog about...",
				},
			);

			const hasIcon = await consola.prompt("Add an icon image?", {
				type: "confirm",
				initial: false,
			});

			let iconPath: string | undefined;
			if (hasIcon) {
				const icon = await consola.prompt("Icon image path:", {
					type: "text",
					placeholder: "./icon.png",
				});
				iconPath = icon as string;
			}

			const showInDiscover = await consola.prompt("Show in Discover feed?", {
				type: "confirm",
				initial: true,
			});

			consola.start("Creating publication...");
			try {
				publicationUri = await createPublication(agent, {
					url: siteUrl as string,
					name: pubName as string,
					description: (pubDescription as string) || undefined,
					iconPath,
					showInDiscover,
				});
				consola.success(`Publication created: ${publicationUri}`);
			} catch (error) {
				consola.error("Failed to create publication:", error);
				process.exit(1);
			}
		} else {
			const uri = await consola.prompt("Publication AT URI:", {
				type: "text",
				placeholder: "at://did:plc:.../site.standard.publication/...",
			});

			if (!uri) {
				consola.error("Publication URI is required");
				process.exit(1);
			}
			publicationUri = uri as string;
		}

		// Get PDS URL from credentials (already loaded earlier)
		const pdsUrl = credentials?.pdsUrl;

		// Generate config file
		const configContent = generateConfigTemplate({
			siteUrl: siteUrl as string,
			contentDir: contentDir as string,
			imagesDir,
			publicDir: publicDir as string,
			outputDir: outputDir as string,
			pathPrefix: pathPrefix as string,
			publicationUri,
			pdsUrl,
			frontmatter: frontmatterMapping,
		});

		const configPath = path.join(process.cwd(), "sequoia.json");
		await Bun.write(configPath, configContent);

		consola.success(`Configuration saved to ${configPath}`);

		// Create .well-known/site.standard.publication file
		const resolvedPublicDir = path.isAbsolute(publicDir as string)
			? (publicDir as string)
			: path.join(process.cwd(), publicDir as string);
		const wellKnownDir = path.join(resolvedPublicDir, ".well-known");
		const wellKnownPath = path.join(wellKnownDir, "site.standard.publication");

		// Ensure .well-known directory exists
		await Bun.write(path.join(wellKnownDir, ".gitkeep"), "");
		await Bun.write(wellKnownPath, publicationUri);

		consola.success(`Created ${wellKnownPath}`);

		// Update .gitignore
		const gitignorePath = path.join(process.cwd(), ".gitignore");
		const gitignoreFile = Bun.file(gitignorePath);
		const stateFilename = ".sequoia-state.json";

		if (await gitignoreFile.exists()) {
			const gitignoreContent = await gitignoreFile.text();
			if (!gitignoreContent.includes(stateFilename)) {
				await Bun.write(
					gitignorePath,
					gitignoreContent + `\n${stateFilename}\n`,
				);
				consola.info(`Added ${stateFilename} to .gitignore`);
			}
		} else {
			await Bun.write(gitignorePath, `${stateFilename}\n`);
			consola.info(`Created .gitignore with ${stateFilename}`);
		}

		consola.box(
			"Setup complete!\n\n" +
				"Next steps:\n" +
				"1. Run 'sequoia publish --dry-run' to preview\n" +
				"2. Run 'sequoia publish' to publish your content",
		);
	},
});
