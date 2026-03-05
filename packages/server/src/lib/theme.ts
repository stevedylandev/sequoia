import { existsSync, readFileSync } from "fs";

interface ThemeVars {
	fgColor: string;
	bgColor: string;
	accentColor: string;
	borderColor: string;
	errorColor: string;
	borderRadius: string;
	fontFamily: string;
	darkBgColor: string;
	darkFgColor: string;
	darkBorderColor: string;
	darkErrorColor: string;
}

function getThemeVars(): ThemeVars {
	return {
		fgColor: process.env.THEME_FG_COLOR || "#2C2C2C",
		bgColor: process.env.THEME_BG_COLOR || "#F5F3EF",
		accentColor: process.env.THEME_ACCENT_COLOR || "#3A5A40",
		borderColor: process.env.THEME_BORDER_COLOR || "#D5D1C8",
		errorColor: process.env.THEME_ERROR_COLOR || "#8B3A3A",
		borderRadius: process.env.THEME_BORDER_RADIUS || "6px",
		fontFamily: process.env.THEME_FONT_FAMILY || "system-ui, sans-serif",
		darkBgColor: process.env.THEME_DARK_BG_COLOR || "#1A1A1A",
		darkFgColor: process.env.THEME_DARK_FG_COLOR || "#E5E5E5",
		darkBorderColor: process.env.THEME_DARK_BORDER_COLOR || "#3A3A3A",
		darkErrorColor: process.env.THEME_DARK_ERROR_COLOR || "#E57373",
	};
}

function getCustomCss(): string {
	const cssPath = process.env.THEME_CSS_PATH;
	if (!cssPath) return "";
	try {
		if (existsSync(cssPath)) {
			return readFileSync(cssPath, "utf-8");
		}
	} catch {
		console.warn(`Failed to read custom CSS file: ${cssPath}`);
	}
	return "";
}

export function generateStyleBlock(): string {
	const t = getThemeVars();
	const customCss = getCustomCss();

	return `<style>
    :root {
      --sequoia-fg-color: ${t.fgColor};
      --sequoia-bg-color: ${t.bgColor};
      --sequoia-accent-color: ${t.accentColor};
      --sequoia-border-color: ${t.borderColor};
      --sequoia-error-color: ${t.errorColor};
      --sequoia-border-radius: ${t.borderRadius};
      --sequoia-font-family: ${t.fontFamily};
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --sequoia-fg-color: ${t.darkFgColor};
        --sequoia-bg-color: ${t.darkBgColor};
        --sequoia-border-color: ${t.darkBorderColor};
        --sequoia-error-color: ${t.darkErrorColor};
      }
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: var(--sequoia-font-family);
      background: var(--sequoia-bg-color);
      color: var(--sequoia-fg-color);
      line-height: 1.6;
    }

    .page-container {
      max-width: 480px;
      margin: 4rem auto;
      padding: 0 1.25rem;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }

    p { margin-bottom: 1rem; }

    a {
      color: var(--sequoia-accent-color);
      text-decoration: underline;
    }

    a:hover { text-decoration: none; }

    form { display: flex; flex-direction: column; }

    input[type="text"] {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--sequoia-border-color);
      border-radius: var(--sequoia-border-radius);
      margin-bottom: 1.25rem;
      width: 100%;
      font-size: 1rem;
      font-family: inherit;
      background: var(--sequoia-bg-color);
      color: var(--sequoia-fg-color);
    }

    input[type="text"]:focus {
      border-color: var(--sequoia-accent-color);
      outline: 2px solid var(--sequoia-accent-color);
      outline-offset: 2px;
    }

    button {
      padding: 0.625rem 1.25rem;
      background: var(--sequoia-accent-color);
      color: #fff;
      border: none;
      border-radius: var(--sequoia-border-radius);
      font-size: 1rem;
      font-family: inherit;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    button:hover { opacity: 0.9; }

    button:focus-visible {
      outline: 2px solid var(--sequoia-accent-color);
      outline-offset: 2px;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      margin-top: 1rem;
    }

    td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid var(--sequoia-border-color);
      vertical-align: top;
    }

    td:first-child {
      width: 7rem;
      font-weight: 600;
    }

    td:last-child { overflow: hidden; }

    td code {
      font-size: 0.85rem;
      word-break: break-all;
    }

    td div {
      overflow-x: auto;
      white-space: nowrap;
    }

    .error { color: var(--sequoia-error-color); }
    ${customCss ? `\n    /* Custom CSS */\n    ${customCss}` : ""}
  </style>`;
}

export function page(body: string, headExtra = ""): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sequoia · Subscribe</title>
  ${generateStyleBlock()}
  ${headExtra}
</head>
<body>
  <div class="page-container">
    ${body}
  </div>
</body>
</html>`;
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}
