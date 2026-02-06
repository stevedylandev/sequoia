import * as fs from "node:fs/promises";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { command, positional, string } from "cmd-ts";
import { intro, outro, text, spinner, log, note } from "@clack/prompts";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { findConfig, loadConfig } from "../lib/config";
import type { PublisherConfig } from "../lib/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const COMPONENTS_DIR = path.join(__dirname, "components");

const DEFAULT_COMPONENTS_PATH = "src/components";

const AVAILABLE_COMPONENTS = ["sequoia-comments"];

export const addCommand = command({
	name: "add",
	description: "Add a UI component to your project",
	args: {
		componentName: positional({
			type: string,
			displayName: "component",
			description: "The name of the component to add",
		}),
	},
	handler: async ({ componentName }) => {
		intro("Add Sequoia Component");

		// Validate component name
		if (!AVAILABLE_COMPONENTS.includes(componentName)) {
			log.error(`Component '${componentName}' not found`);
			log.info("Available components:");
			for (const comp of AVAILABLE_COMPONENTS) {
				log.info(`  - ${comp}`);
			}
			process.exit(1);
		}

		// Try to load existing config
		const configPath = await findConfig();
		let config: PublisherConfig | null = null;
		let componentsDir = DEFAULT_COMPONENTS_PATH;

		if (configPath) {
			try {
				config = await loadConfig(configPath);
				if (config.ui?.components) {
					componentsDir = config.ui.components;
				}
			} catch {
				// Config exists but may be incomplete - that's ok for UI components
			}
		}

		// If no UI config, prompt for components directory
		if (!config?.ui?.components) {
			log.info("No UI configuration found in sequoia.json");

			const inputPath = await text({
				message: "Where would you like to install components?",
				placeholder: DEFAULT_COMPONENTS_PATH,
				defaultValue: DEFAULT_COMPONENTS_PATH,
			});

			if (inputPath === Symbol.for("cancel")) {
				outro("Cancelled");
				process.exit(0);
			}

			componentsDir = inputPath as string;

			// Update or create config with UI settings
			if (configPath) {
				const s = spinner();
				s.start("Updating sequoia.json...");
				try {
					const configContent = await fs.readFile(configPath, "utf-8");
					const existingConfig = JSON.parse(configContent);
					existingConfig.ui = { components: componentsDir };
					await fs.writeFile(
						configPath,
						JSON.stringify(existingConfig, null, 2),
						"utf-8"
					);
					s.stop("Updated sequoia.json with UI configuration");
				} catch (error) {
					s.stop("Failed to update sequoia.json");
					log.warn(`Could not update config: ${error}`);
				}
			} else {
				// Create minimal config just for UI
				const s = spinner();
				s.start("Creating sequoia.json...");
				const minimalConfig = {
					ui: { components: componentsDir },
				};
				await fs.writeFile(
					path.join(process.cwd(), "sequoia.json"),
					JSON.stringify(minimalConfig, null, 2),
					"utf-8"
				);
				s.stop("Created sequoia.json with UI configuration");
			}
		}

		// Resolve components directory
		const resolvedComponentsDir = path.isAbsolute(componentsDir)
			? componentsDir
			: path.join(process.cwd(), componentsDir);

		// Create components directory if it doesn't exist
		if (!existsSync(resolvedComponentsDir)) {
			const s = spinner();
			s.start(`Creating ${componentsDir} directory...`);
			await fs.mkdir(resolvedComponentsDir, { recursive: true });
			s.stop(`Created ${componentsDir}`);
		}

		// Copy the component
		const sourceFile = path.join(COMPONENTS_DIR, `${componentName}.js`);
		const destFile = path.join(resolvedComponentsDir, `${componentName}.js`);

		if (!existsSync(sourceFile)) {
			log.error(`Component source file not found: ${sourceFile}`);
			log.info("This may be a build issue. Try reinstalling sequoia-cli.");
			process.exit(1);
		}

		const s = spinner();
		s.start(`Installing ${componentName}...`);

		try {
			const componentCode = await fs.readFile(sourceFile, "utf-8");
			await fs.writeFile(destFile, componentCode, "utf-8");
			s.stop(`Installed ${componentName}`);
		} catch (error) {
			s.stop("Failed to install component");
			log.error(`Error: ${error}`);
			process.exit(1);
		}

		// Show usage instructions
		note(
			`Add to your HTML:\n\n` +
				`<script type="module" src="${componentsDir}/${componentName}.js"></script>\n` +
				`<${componentName}></${componentName}>\n\n` +
				`The component will automatically read the document URI from:\n` +
				`<link rel="site.standard.document" href="at://...">`,
			"Usage"
		);

		outro(`${componentName} added successfully!`);
	},
});
