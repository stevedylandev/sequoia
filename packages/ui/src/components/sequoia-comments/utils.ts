/**
 * Format a relative time string (e.g., "2 hours ago")
 */
export function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);
	const diffWeeks = Math.floor(diffDays / 7);
	const diffMonths = Math.floor(diffDays / 30);
	const diffYears = Math.floor(diffDays / 365);

	if (diffSeconds < 60) {
		return "just now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes}m ago`;
	}
	if (diffHours < 24) {
		return `${diffHours}h ago`;
	}
	if (diffDays < 7) {
		return `${diffDays}d ago`;
	}
	if (diffWeeks < 4) {
		return `${diffWeeks}w ago`;
	}
	if (diffMonths < 12) {
		return `${diffMonths}mo ago`;
	}
	return `${diffYears}y ago`;
}

/**
 * Escape HTML special characters
 */
export function escapeHtml(text: string): string {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

/**
 * Convert post text with facets to HTML
 */
export function renderTextWithFacets(
	text: string,
	facets?: Array<{
		index: { byteStart: number; byteEnd: number };
		features: Array<
			| { $type: "app.bsky.richtext.facet#link"; uri: string }
			| { $type: "app.bsky.richtext.facet#mention"; did: string }
			| { $type: "app.bsky.richtext.facet#tag"; tag: string }
		>;
	}>,
): string {
	if (!facets || facets.length === 0) {
		return escapeHtml(text);
	}

	// Convert text to bytes for proper indexing
	const encoder = new TextEncoder();
	const decoder = new TextDecoder();
	const textBytes = encoder.encode(text);

	// Sort facets by start index
	const sortedFacets = [...facets].sort(
		(a, b) => a.index.byteStart - b.index.byteStart,
	);

	let result = "";
	let lastEnd = 0;

	for (const facet of sortedFacets) {
		const { byteStart, byteEnd } = facet.index;

		// Add text before this facet
		if (byteStart > lastEnd) {
			const beforeBytes = textBytes.slice(lastEnd, byteStart);
			result += escapeHtml(decoder.decode(beforeBytes));
		}

		// Get the facet text
		const facetBytes = textBytes.slice(byteStart, byteEnd);
		const facetText = decoder.decode(facetBytes);

		// Find the first renderable feature
		const feature = facet.features[0];
		if (feature) {
			if (feature.$type === "app.bsky.richtext.facet#link") {
				result += `<a href="${escapeHtml(feature.uri)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
			} else if (feature.$type === "app.bsky.richtext.facet#mention") {
				result += `<a href="https://bsky.app/profile/${escapeHtml(feature.did)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
			} else if (feature.$type === "app.bsky.richtext.facet#tag") {
				result += `<a href="https://bsky.app/hashtag/${escapeHtml(feature.tag)}" target="_blank" rel="noopener noreferrer">${escapeHtml(facetText)}</a>`;
			} else {
				result += escapeHtml(facetText);
			}
		} else {
			result += escapeHtml(facetText);
		}

		lastEnd = byteEnd;
	}

	// Add remaining text
	if (lastEnd < textBytes.length) {
		const remainingBytes = textBytes.slice(lastEnd);
		result += escapeHtml(decoder.decode(remainingBytes));
	}

	return result;
}

/**
 * Get initials from a name for avatar placeholder
 */
export function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
	}
	return name.substring(0, 2).toUpperCase();
}
