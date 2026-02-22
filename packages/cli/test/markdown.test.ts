import { describe, expect, it } from "bun:test";
import { parseFrontmatter } from "../src/lib/markdown";

describe("parseFrontmatter", () => {
	describe("delimiters", () => {
		it("parses YAML frontmatter (--- delimiter)", () => {
			const content = `---
title: Hello World
---
Body content here.`;
			const { frontmatter, body } = parseFrontmatter(content);
			expect(frontmatter.title).toBe("Hello World");
			expect(body).toBe("Body content here.");
		});

		it("parses TOML frontmatter (+++ delimiter)", () => {
			const content = `+++
title = "Hugo Post"
+++
Body content here.`;
			const { frontmatter, body } = parseFrontmatter(content);
			expect(frontmatter.title).toBe("Hugo Post");
			expect(body).toBe("Body content here.");
		});

		it("parses alternative frontmatter (*** delimiter)", () => {
			const content = `***
title: Alt Post
***
Body content here.`;
			const { frontmatter, body } = parseFrontmatter(content);
			expect(frontmatter.title).toBe("Alt Post");
			expect(body).toBe("Body content here.");
		});

		it("throws when no frontmatter is present", () => {
			const content = "Just plain content with no frontmatter.";
			expect(() => parseFrontmatter(content)).toThrow(
				"Could not parse frontmatter",
			);
		});
	});

	describe("scalar values", () => {
		it("parses a string value", () => {
			const content = `---
title: My Post
description: A short description
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.title).toBe("My Post");
			expect(frontmatter.description).toBe("A short description");
		});

		it("strips double quotes from values", () => {
			const content = `---
title: "Quoted Title"
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.title).toBe("Quoted Title");
		});

		it("strips single quotes from values", () => {
			const content = `---
title: 'Single Quoted'
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.title).toBe("Single Quoted");
		});

		it("parses YAML folded multiline string", () => {
			const content = `---
excerpt: >
  This is a folded
  multiline string
---
`;
			const { rawFrontmatter } = parseFrontmatter(content);
			expect(rawFrontmatter.excerpt).toBe(
				"This is a folded multiline string\n",
			);
		});

		it("parses YAML stripped folded multiline string", () => {
			const content = `---
excerpt: >-
  This is a stripped folded
  multiline string
---
`;
			const { rawFrontmatter } = parseFrontmatter(content);
			expect(rawFrontmatter.excerpt).toBe(
				"This is a stripped folded multiline string",
			);
		});

		it("parses YAML literal multiline string", () => {
			const content = `---
excerpt: |
  This is a literal
  multiline string
---
`;
			const { rawFrontmatter } = parseFrontmatter(content);
			expect(rawFrontmatter.excerpt).toBe(
				"This is a literal\nmultiline string\n",
			);
		});

		it("parses YAML kept literal multiline string", () => {
			const content = `---
excerpt: |+
  This is a kept literal
  multiline string

end: true
---
`;
			const { rawFrontmatter } = parseFrontmatter(content);
			expect(rawFrontmatter.excerpt).toBe(
				"This is a kept literal\nmultiline string\n\n",
			);
		});

		it("parses boolean true", () => {
			const content = `---
draft: true
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.draft).toBe(true);
		});

		it("parses boolean false", () => {
			const content = `---
draft: false
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.draft).toBe(false);
		});

		it('parses string "true" in draft field as boolean true', () => {
			const content = `---
draft: true
---
`;
			const { rawFrontmatter } = parseFrontmatter(content);
			expect(rawFrontmatter.draft).toBe(true);
		});
	});

	describe("arrays", () => {
		it("parses inline YAML arrays", () => {
			const content = `---
tags: [typescript, bun, testing]
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.tags).toEqual(["typescript", "bun", "testing"]);
		});

		it("parses inline YAML arrays with quoted items", () => {
			const content = `---
tags: ["typescript", "bun", "testing"]
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.tags).toEqual(["typescript", "bun", "testing"]);
		});

		it("parses YAML block arrays", () => {
			const content = `---
tags:
  - typescript
  - bun
  - testing
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.tags).toEqual(["typescript", "bun", "testing"]);
		});

		it("parses YAML block arrays with quoted items", () => {
			const content = `---
tags:
  - "typescript"
  - 'bun'
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.tags).toEqual(["typescript", "bun"]);
		});

		it("parses inline TOML arrays", () => {
			const content = `+++
tags = ["typescript", "bun"]
+++
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.tags).toEqual(["typescript", "bun"]);
		});
	});

	describe("publish date fallbacks", () => {
		it("uses publishDate field directly", () => {
			const content = `---
publishDate: 2024-01-15
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.publishDate).toBe("2024-01-15");
		});

		it("falls back to pubDate", () => {
			const content = `---
pubDate: 2024-02-01
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.publishDate).toBe("2024-02-01");
		});

		it("falls back to date", () => {
			const content = `---
date: 2024-03-10
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.publishDate).toBe("2024-03-10");
		});

		it("falls back to createdAt", () => {
			const content = `---
createdAt: 2024-04-20
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.publishDate).toBe("2024-04-20");
		});

		it("falls back to created_at", () => {
			const content = `---
created_at: 2024-05-30
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.publishDate).toBe("2024-05-30");
		});

		it("prefers publishDate over other fallbacks", () => {
			const content = `---
publishDate: 2024-01-01
date: 2023-01-01
---
`;
			const { frontmatter } = parseFrontmatter(content);
			expect(frontmatter.publishDate).toBe("2024-01-01");
		});
	});

	describe("rawFrontmatter", () => {
		it("returns all raw fields", () => {
			const content = `---
title: Raw Test
custom: value
---
`;
			const { rawFrontmatter } = parseFrontmatter(content);
			expect(rawFrontmatter.title).toBe("Raw Test");
			expect(rawFrontmatter.custom).toBe("value");
		});

		it("preserves atUri in both frontmatter and rawFrontmatter", () => {
			const content = `---
title: Post
atUri: at://did:plc:abc123/app.bsky.feed.post/xyz
---
`;
			const { frontmatter, rawFrontmatter } = parseFrontmatter(content);
			expect(frontmatter.atUri).toBe(
				"at://did:plc:abc123/app.bsky.feed.post/xyz",
			);
			expect(rawFrontmatter.atUri).toBe(
				"at://did:plc:abc123/app.bsky.feed.post/xyz",
			);
		});
	});

	describe("FrontmatterMapping", () => {
		it("maps a custom title field", () => {
			const content = `---
name: My Mapped Title
---
`;
			const { frontmatter } = parseFrontmatter(content, { title: "name" });
			expect(frontmatter.title).toBe("My Mapped Title");
		});

		it("maps a custom description field", () => {
			const content = `---
summary: Custom description
---
`;
			const { frontmatter } = parseFrontmatter(content, {
				description: "summary",
			});
			expect(frontmatter.description).toBe("Custom description");
		});

		it("maps a custom publishDate field", () => {
			const content = `---
publishedOn: 2024-06-15
---
`;
			const { frontmatter } = parseFrontmatter(content, {
				publishDate: "publishedOn",
			});
			expect(frontmatter.publishDate).toBe("2024-06-15");
		});

		it("maps a custom coverImage field", () => {
			const content = `---
heroImage: /images/cover.jpg
---
`;
			const { frontmatter } = parseFrontmatter(content, {
				coverImage: "heroImage",
			});
			expect(frontmatter.ogImage).toBe("/images/cover.jpg");
		});

		it("maps a custom tags field", () => {
			const content = `---
categories: [news, updates]
---
`;
			const { frontmatter } = parseFrontmatter(content, { tags: "categories" });
			expect(frontmatter.tags).toEqual(["news", "updates"]);
		});

		it("maps a custom draft field", () => {
			const content = `---
unpublished: true
---
`;
			const { frontmatter } = parseFrontmatter(content, {
				draft: "unpublished",
			});
			expect(frontmatter.draft).toBe(true);
		});

		it("falls back to standard field name when mapped field is absent", () => {
			const content = `---
title: Standard Title
---
`;
			const { frontmatter } = parseFrontmatter(content, { title: "heading" });
			expect(frontmatter.title).toBe("Standard Title");
		});
	});

	describe("body", () => {
		it("returns the body content after the closing delimiter", () => {
			const content = `---
title: Post
---
# Heading

Some paragraph text.`;
			const { body } = parseFrontmatter(content);
			expect(body).toBe("# Heading\n\nSome paragraph text.");
		});

		it("returns an empty body when there is no content after frontmatter", () => {
			const content = `---
title: Post
---
`;
			const { body } = parseFrontmatter(content);
			expect(body).toBe("");
		});
	});
});
