import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
	PublisherConfig,
	PublisherState,
	FrontmatterMapping,
	BlueskyConfig,
} from "./types";

const CONFIG_FILENAME = "sequoia.json";
const STATE_FILENAME = ".sequoia-state.json";

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function findConfig(
	startDir: string = process.cwd(),
): Promise<string | null> {
	let currentDir = startDir;

	while (true) {
		const configPath = path.join(currentDir, CONFIG_FILENAME);

		if (await fileExists(configPath)) {
			return configPath;
		}

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) {
			// Reached root
			return null;
		}
		currentDir = parentDir;
	}
}

export async function loadConfig(
	configPath?: string,
): Promise<PublisherConfig> {
	const resolvedPath = configPath || (await findConfig());

	if (!resolvedPath) {
		throw new Error(
			`Could not find ${CONFIG_FILENAME}. Run 'sequoia init' to create one.`,
		);
	}

	try {
		const content = await fs.readFile(resolvedPath, "utf-8");
		const config = JSON.parse(content) as PublisherConfig;

		// Validate required fields
		if (!config.siteUrl) throw new Error("siteUrl is required in config");
		if (!config.contentDir) throw new Error("contentDir is required in config");
		if (!config.publicationUri)
			throw new Error("publicationUri is required in config");

		return config;
	} catch (error) {
		if (error instanceof Error && error.message.includes("required")) {
			throw error;
		}
		throw new Error(`Failed to load config from ${resolvedPath}: ${error}`);
	}
}

export function generateConfigTemplate(options: {
	siteUrl: string;
	contentDir: string;
	imagesDir?: string;
	publicDir?: string;
	outputDir?: string;
	pathPrefix?: string;
	publicationUri: string;
	pdsUrl?: string;
	frontmatter?: FrontmatterMapping;
	ignore?: string[];
	removeIndexFromSlug?: boolean;
	stripDatePrefix?: boolean;
	pathTemplate?: string;
	textContentField?: string;
	bluesky?: BlueskyConfig;
}): string {
	const config: Record<string, unknown> = {
		siteUrl: options.siteUrl,
		contentDir: options.contentDir,
	};

	if (options.imagesDir) {
		config.imagesDir = options.imagesDir;
	}

	if (options.publicDir && options.publicDir !== "./public") {
		config.publicDir = options.publicDir;
	}

	if (options.outputDir) {
		config.outputDir = options.outputDir;
	}

	if (options.pathPrefix && options.pathPrefix !== "/posts") {
		config.pathPrefix = options.pathPrefix;
	}

	config.publicationUri = options.publicationUri;

	if (options.pdsUrl && options.pdsUrl !== "https://bsky.social") {
		config.pdsUrl = options.pdsUrl;
	}

	if (options.frontmatter && Object.keys(options.frontmatter).length > 0) {
		config.frontmatter = options.frontmatter;
	}

	if (options.ignore && options.ignore.length > 0) {
		config.ignore = options.ignore;
	}

	if (options.removeIndexFromSlug) {
		config.removeIndexFromSlug = options.removeIndexFromSlug;
	}

	if (options.stripDatePrefix) {
		config.stripDatePrefix = options.stripDatePrefix;
	}

	if (options.pathTemplate) {
		config.pathTemplate = options.pathTemplate;
	}

	if (options.textContentField) {
		config.textContentField = options.textContentField;
	}
	if (options.bluesky) {
		config.bluesky = options.bluesky;
	}

	return JSON.stringify(config, null, 2);
}

export async function loadState(configDir: string): Promise<PublisherState> {
	const statePath = path.join(configDir, STATE_FILENAME);

	if (!(await fileExists(statePath))) {
		return { posts: {} };
	}

	try {
		const content = await fs.readFile(statePath, "utf-8");
		return JSON.parse(content) as PublisherState;
	} catch {
		return { posts: {} };
	}
}

export async function saveState(
	configDir: string,
	state: PublisherState,
): Promise<void> {
	const statePath = path.join(configDir, STATE_FILENAME);
	await fs.writeFile(statePath, JSON.stringify(state, null, 2));
}

export function getStatePath(configDir: string): string {
	return path.join(configDir, STATE_FILENAME);
}
