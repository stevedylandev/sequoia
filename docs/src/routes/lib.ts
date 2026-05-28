import type { Agent } from "@atproto/api";

export const REDIRECT_DELAY_SECONDS = 5;

// ============================================================================
// Helpers
// ============================================================================

export function withReturnToParam(
	returnTo: string | undefined,
	key: string,
	value: string,
): string | undefined {
	if (!returnTo) return undefined;
	try {
		const url = new URL(returnTo);
		url.searchParams.set(key, value);
		return url.toString();
	} catch {
		return returnTo;
	}
}

/**
 * Scan a repo for a record in `collection` where `record[field] === uri`.
 * Returns the record AT-URI, or null if not found.
 */
export async function findExistingRecord(
	agent: Agent,
	did: string,
	collection: string,
	field: string,
	uri: string,
): Promise<string | null> {
	let cursor: string | undefined;

	do {
		const result = await agent.com.atproto.repo.listRecords({
			repo: did,
			collection,
			limit: 100,
			cursor,
		});

		for (const record of result.data.records) {
			const value = record.value as Record<string, unknown>;
			if (value[field] === uri) {
				return record.uri;
			}
		}

		cursor = result.data.cursor;
	} while (cursor);

	return null;
}

// ============================================================================
// HTML rendering
// ============================================================================

export function renderHandleForm(
	params: {
		resourceUri: string;
		resourceField: string;
		loginPath: string;
		title: string;
		description: string;
		buttonLabel: string;
		returnTo?: string;
		error?: string;
		action?: string;
	},
	styleHref: string,
): string {
	const {
		resourceUri,
		resourceField,
		loginPath,
		title,
		description,
		buttonLabel,
		returnTo,
		error,
		action,
	} = params;

	const errorHtml = error
		? `<p class="vocs_Paragraph error">${escapeHtml(error)}</p>`
		: "";
	const returnToInput = returnTo
		? `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />`
		: "";
	const actionInput = action
		? `<input type="hidden" name="action" value="${escapeHtml(action)}" />`
		: "";

	return page(
		`
		<h1 class="vocs_H1 vocs_Heading">${escapeHtml(title)}</h1>
		<p class="vocs_Paragraph">${escapeHtml(description)}</p>
		${errorHtml}
		<form method="POST" action="${escapeHtml(loginPath)}">
			<input type="hidden" name="${escapeHtml(resourceField)}" value="${escapeHtml(resourceUri)}" />
			${returnToInput}
			${actionInput}
			<input
				type="text"
				name="handle"
				placeholder="you.bsky.social"
				autocomplete="username"
				required
				autofocus
			/>
			<button type="submit" class="vocs_Button_button vocs_Button_button_accent">${escapeHtml(buttonLabel)}</button>
		</form>
	`,
		styleHref,
	);
}

export function renderSuccess(
	params: {
		resourceUri: string;
		resourceLabel: string;
		recordUri: string | null;
		heading: string;
		msg: string;
		returnTo?: string;
	},
	styleHref: string,
): string {
	const { resourceUri, resourceLabel, recordUri, heading, msg, returnTo } =
		params;
	const escapedResourceUri = escapeHtml(resourceUri);
	const escapedReturnTo = returnTo ? escapeHtml(returnTo) : "";

	const redirectHtml = returnTo
		? `<p class="vocs_Paragraph" id="redirect-msg">Redirecting to <a class="vocs_Anchor" href="${escapedReturnTo}">${escapedReturnTo}</a> in <span id="countdown">${REDIRECT_DELAY_SECONDS}</span>\u00a0seconds\u2026</p>
		<script>
		(function(){
			var secs = ${REDIRECT_DELAY_SECONDS};
			var el = document.getElementById('countdown');
			var iv = setInterval(function(){
				secs--;
				if (el) el.textContent = String(secs);
				if (secs <= 0) { clearInterval(iv); location.href = ${JSON.stringify(returnTo)}; }
			}, 1000);
		})();
		</script>`
		: "";
	const headExtra = returnTo
		? `<meta http-equiv="refresh" content="${REDIRECT_DELAY_SECONDS};url=${escapedReturnTo}" />`
		: "";

	return page(
		`
		<h1 class="vocs_H1 vocs_Heading">${escapeHtml(heading)}</h1>
		<p class="vocs_Paragraph">${msg}</p>
		${redirectHtml}
		<table class="vocs_Table" style="display:table;table-layout:fixed;width:100%;overflow:hidden;">
			<colgroup><col style="width:7rem;"><col></colgroup>
			<tbody>
				<tr class="vocs_TableRow">
					<td class="vocs_TableCell">${escapeHtml(resourceLabel)}</td>
					<td class="vocs_TableCell" style="overflow:hidden;">
						<div style="overflow-x:auto;white-space:nowrap;"><code class="vocs_Code"><a href="https://pds.ls/${escapedResourceUri}">${escapedResourceUri}</a></code></div>
					</td>
				</tr>
				${
					recordUri
						? `<tr class="vocs_TableRow">
					<td class="vocs_TableCell">Record</td>
					<td class="vocs_TableCell" style="overflow:hidden;">
						<div style="overflow-x:auto;white-space:nowrap;"><code class="vocs_Code"><a href="https://pds.ls/${escapeHtml(recordUri)}">${escapeHtml(recordUri)}</a></code></div>
					</td>
				</tr>`
						: ""
				}
			</tbody>
		</table>
	`,
		styleHref,
		headExtra,
	);
}

export function renderError(message: string, styleHref: string): string {
	return page(
		`<h1 class="vocs_H1 vocs_Heading">Error</h1><p class="vocs_Paragraph error">${escapeHtml(message)}</p>`,
		styleHref,
	);
}

export function page(body: string, styleHref: string, headExtra = ""): string {
	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Sequoia</title>
  <link rel="stylesheet" href="${styleHref}" />
  <script>if(window.matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')</script>
  ${headExtra}
  <style>
    .page-container {
      max-width: calc(var(--vocs-content_width, 480px) / 1.6);
      margin: 4rem auto;
      padding: 0 var(--vocs-space_20, 1.25rem);
    }
    .vocs_Heading { margin-bottom: var(--vocs-space_12, .75rem); }
    .vocs_Paragraph { margin-bottom: var(--vocs-space_16, 1rem); }
    input[type="text"] {
      padding: var(--vocs-space_8, .5rem) var(--vocs-space_12, .75rem);
      border: 1px solid var(--vocs-color_border, #D5D1C8);
      border-radius: var(--vocs-borderRadius_6, 6px);
      margin-bottom: var(--vocs-space_20, 1.25rem);
	  min-width: 30vh;
	  width: 100%;
      font-size: var(--vocs-fontSize_16, 1rem);
      font-family: inherit;
      background: var(--vocs-color_background, #F5F3EF);
      color: var(--vocs-color_text, #2C2C2C);
    }
    input[type="text"]:focus {
      border-color: var(--vocs-color_borderAccent, #3A5A40);
      outline: 2px solid var(--vocs-color_borderAccent, #3A5A40);
      outline-offset: 2px;
    }
    .error { color: var(--vocs-color_dangerText, #8B3A3A); }
  </style>
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
