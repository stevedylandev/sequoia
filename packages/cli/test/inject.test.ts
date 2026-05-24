import { describe, expect, it, spyOn } from "bun:test";
import { log } from "@clack/prompts";
import { Injected, injectLinkTags } from "../src/commands/inject";

const atUri = "at://did:plc:abc123/app.bsky.feed.post/xyz";
const publicationUri = "at://did:plc:def456/app.bsky.feed.generator/main";

describe("injectLinkTags", () => {
	describe("neither tag needs injection", () => {
		it("returns AlreadyPresent when both tags already exist", () => {
			const content = `<html><head>
  <link rel="site.standard.document" href="${atUri}">
  <link rel="site.standard.publication" href="${publicationUri}">
</head></html>`;
			const result = injectLinkTags(
				false,
				"test.html",
				content,
				atUri,
				publicationUri,
			);
			expect(result).toBe(Injected.AlreadyPresent);
		});
	});

	describe("one tag needs injection", () => {
		it("injects only documentLinkTag when publicationLinkTag is already present", () => {
			const content = `<html><head>
  <link rel="site.standard.publication" href="${publicationUri}">
</head></html>`;
			const result = injectLinkTags(
				false,
				"test.html",
				content,
				atUri,
				publicationUri,
			);
			expect(typeof result).toBe("string");
			expect(result as string).toContain(
				`<link rel="site.standard.document" href="${atUri}">`,
			);
			expect(
				result as string,
			).not.toContain(`<link rel="site.standard.publication" href="${publicationUri}">
  <link rel="site.standard.publication"`);
		});

		it("injects only publicationLinkTag when documentLinkTag is already present", () => {
			const content = `<html><head>
  <link rel="site.standard.document" href="${atUri}">
</head></html>`;
			const result = injectLinkTags(
				false,
				"test.html",
				content,
				atUri,
				publicationUri,
			);
			expect(typeof result).toBe("string");
			expect(result as string).toContain(
				`<link rel="site.standard.publication" href="${publicationUri}">`,
			);
		});
	});

	describe("both tags need injection", () => {
		it("injects both tags when neither is present", () => {
			const content = "<html><head>\n</head></html>";
			const result = injectLinkTags(
				false,
				"test.html",
				content,
				atUri,
				publicationUri,
			);
			expect(typeof result).toBe("string");
			expect(result as string).toContain(
				`<link rel="site.standard.document" href="${atUri}">`,
			);
			expect(result as string).toContain(
				`<link rel="site.standard.publication" href="${publicationUri}">`,
			);
		});

		it("injects tags before </head>", () => {
			const content = "<html><head>\n</head><body></body></html>";
			const result = injectLinkTags(
				false,
				"test.html",
				content,
				atUri,
				publicationUri,
			) as string;
			const headCloseIndex = result.indexOf("</head>");
			expect(result.indexOf('rel="site.standard.document"')).toBeLessThan(
				headCloseIndex,
			);
			expect(result.indexOf('rel="site.standard.publication"')).toBeLessThan(
				headCloseIndex,
			);
		});

		it("returns Skipped when no </head> is found", () => {
			const warnSpy = spyOn(log, "warn").mockImplementation(() => {});
			const content = "<html><body>No head tag here</body></html>";
			const result = injectLinkTags(
				false,
				"test.html",
				content,
				atUri,
				publicationUri,
			);
			expect(result).toBe(Injected.Skipped);
			expect(warnSpy).toHaveBeenCalledWith(
				"  No </head> found in test.html, skipping",
			);
			warnSpy.mockRestore();
		});

		it("returns Faked and does not modify content during dry run", () => {
			const messageSpy = spyOn(log, "message").mockImplementation(() => {});
			const content = "<html><head>\n</head></html>";
			const result = injectLinkTags(
				true,
				"test.html",
				content,
				atUri,
				publicationUri,
			);
			expect(result).toBe(Injected.Faked);
			expect(messageSpy).toHaveBeenCalledWith("  Would inject into: test.html");
			expect(messageSpy).toHaveBeenCalledWith(
				`    <link rel="site.standard.document" href="${atUri}">`,
			);
			expect(messageSpy).toHaveBeenCalledWith(
				`    <link rel="site.standard.publication" href="${publicationUri}">`,
			);
			messageSpy.mockRestore();
		});
	});
});
