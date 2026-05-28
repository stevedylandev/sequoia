import type { Agent } from "@atproto/api";
import { escapeHtml, page } from "../lib/theme";

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

export function renderHandleForm(params: {
	resourceUri: string;
	resourceField: string;
	loginPath: string;
	title: string;
	description: string;
	buttonLabel: string;
	returnTo?: string;
	error?: string;
	action?: string;
}): string {
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

	const errorHtml = error ? `<p class="error">${escapeHtml(error)}</p>` : "";
	const returnToInput = returnTo
		? `<input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}" />`
		: "";
	const actionInput = action
		? `<input type="hidden" name="action" value="${escapeHtml(action)}" />`
		: "";

	return page(`
		<h1>${escapeHtml(title)}</h1>
		<p>${escapeHtml(description)}</p>
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
			<button type="submit">${escapeHtml(buttonLabel)}</button>
		</form>
	`);
}

export function renderSuccess(params: {
	resourceUri: string;
	resourceLabel: string;
	recordUri: string | null;
	heading: string;
	msg: string;
	returnTo?: string;
}): string {
	const { resourceUri, resourceLabel, recordUri, heading, msg, returnTo } =
		params;
	const escapedResourceUri = escapeHtml(resourceUri);
	const escapedReturnTo = returnTo ? escapeHtml(returnTo) : "";

	const redirectHtml = returnTo
		? `<p id="redirect-msg">Redirecting to <a href="${escapedReturnTo}">${escapedReturnTo}</a> in <span id="countdown">${REDIRECT_DELAY_SECONDS}</span>\u00a0seconds\u2026</p>
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
		<h1>${escapeHtml(heading)}</h1>
		<p>${msg}</p>
		${redirectHtml}
		<table>
			<colgroup><col style="width:7rem;"><col></colgroup>
			<tbody>
				<tr>
					<td>${escapeHtml(resourceLabel)}</td>
					<td>
						<div><code><a href="https://pds.ls/${escapedResourceUri}">${escapedResourceUri}</a></code></div>
					</td>
				</tr>
				${
					recordUri
						? `<tr>
					<td>Record</td>
					<td>
						<div><code><a href="https://pds.ls/${escapeHtml(recordUri)}">${escapeHtml(recordUri)}</a></code></div>
					</td>
				</tr>`
						: ""
				}
			</tbody>
		</table>
	`,
		headExtra,
	);
}

export function renderError(message: string): string {
	return page(`<h1>Error</h1><p class="error">${escapeHtml(message)}</p>`);
}
