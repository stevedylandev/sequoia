import { describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs/promises";
import { DEFAULT_PUBLISHER_CONFIG, loadConfig } from "../src/lib/config";

const REQUIRED_FIELDS = {
	siteUrl: "https://example.com",
	contentDir: "./content",
	publicationUri: "at://did:plc:abc123/site.standard.publication/main",
};

describe("loadConfig", () => {
	it("applies DEFAULT_PUBLISHER_CONFIG when optional fields are absent", async () => {
		spyOn(fs, "readFile").mockResolvedValue(
			JSON.stringify(REQUIRED_FIELDS) as unknown as Buffer,
		);

		const config = await loadConfig("/fake/sequoia.json");

		expect(config.publicDir).toBe(DEFAULT_PUBLISHER_CONFIG.publicDir);
		expect(config.outputDir).toBe(DEFAULT_PUBLISHER_CONFIG.outputDir);
		expect(config.pathPrefix).toBe(DEFAULT_PUBLISHER_CONFIG.pathPrefix);
		expect(config.publishContent).toBe(DEFAULT_PUBLISHER_CONFIG.publishContent);
		expect(config.removeIndexFromSlug).toBe(
			DEFAULT_PUBLISHER_CONFIG.removeIndexFromSlug,
		);
		expect(config.stripDatePrefix).toBe(
			DEFAULT_PUBLISHER_CONFIG.stripDatePrefix,
		);
		expect(config.autoSync).toBe(DEFAULT_PUBLISHER_CONFIG.autoSync);
	});

	it("uses explicit values when all defaultable fields are set", async () => {
		const custom = {
			...REQUIRED_FIELDS,
			publicDir: "./static",
			outputDir: "./build",
			pathPrefix: "/articles",
			publishContent: false,
			removeIndexFromSlug: true,
			stripDatePrefix: true,
			autoSync: false,
		};

		spyOn(fs, "readFile").mockResolvedValue(
			JSON.stringify(custom) as unknown as Buffer,
		);

		const config = await loadConfig("/fake/sequoia.json");

		expect(config.publicDir).toBe("./static");
		expect(config.outputDir).toBe("./build");
		expect(config.pathPrefix).toBe("/articles");
		expect(config.publishContent).toBe(false);
		expect(config.removeIndexFromSlug).toBe(true);
		expect(config.stripDatePrefix).toBe(true);
		expect(config.autoSync).toBe(false);
	});
});
