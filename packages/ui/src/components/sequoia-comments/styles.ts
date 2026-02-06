export const styles = `
:host {
	display: block;
	font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	color: var(--sequoia-fg-color, #1f2937);
	line-height: 1.5;
}

* {
	box-sizing: border-box;
}

.sequoia-comments-container {
	max-width: 100%;
}

.sequoia-loading,
.sequoia-error,
.sequoia-empty,
.sequoia-warning {
	padding: 1rem;
	border-radius: var(--sequoia-border-radius, 8px);
	text-align: center;
}

.sequoia-loading {
	background: var(--sequoia-bg-color, #ffffff);
	border: 1px solid var(--sequoia-border-color, #e5e7eb);
	color: var(--sequoia-secondary-color, #6b7280);
}

.sequoia-loading-spinner {
	display: inline-block;
	width: 1.25rem;
	height: 1.25rem;
	border: 2px solid var(--sequoia-border-color, #e5e7eb);
	border-top-color: var(--sequoia-accent-color, #2563eb);
	border-radius: 50%;
	animation: sequoia-spin 0.8s linear infinite;
	margin-right: 0.5rem;
	vertical-align: middle;
}

@keyframes sequoia-spin {
	to { transform: rotate(360deg); }
}

.sequoia-error {
	background: #fef2f2;
	border: 1px solid #fecaca;
	color: #dc2626;
}

.sequoia-warning {
	background: #fffbeb;
	border: 1px solid #fde68a;
	color: #d97706;
}

.sequoia-empty {
	background: var(--sequoia-bg-color, #ffffff);
	border: 1px solid var(--sequoia-border-color, #e5e7eb);
	color: var(--sequoia-secondary-color, #6b7280);
}

.sequoia-comments-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	margin-bottom: 1rem;
	padding-bottom: 0.75rem;
	border-bottom: 1px solid var(--sequoia-border-color, #e5e7eb);
}

.sequoia-comments-title {
	font-size: 1.125rem;
	font-weight: 600;
	margin: 0;
}

.sequoia-reply-button {
	display: inline-flex;
	align-items: center;
	gap: 0.375rem;
	padding: 0.5rem 1rem;
	background: var(--sequoia-accent-color, #2563eb);
	color: #ffffff;
	border: none;
	border-radius: var(--sequoia-border-radius, 8px);
	font-size: 0.875rem;
	font-weight: 500;
	cursor: pointer;
	text-decoration: none;
	transition: background-color 0.15s ease;
}

.sequoia-reply-button:hover {
	background: color-mix(in srgb, var(--sequoia-accent-color, #2563eb) 85%, black);
}

.sequoia-reply-button svg {
	width: 1rem;
	height: 1rem;
}

.sequoia-comments-list {
	display: flex;
	flex-direction: column;
	gap: 0;
}

.sequoia-comment {
	padding: 1rem;
	background: var(--sequoia-bg-color, #ffffff);
	border: 1px solid var(--sequoia-border-color, #e5e7eb);
	border-radius: var(--sequoia-border-radius, 8px);
	margin-bottom: 0.75rem;
}

.sequoia-comment-header {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	margin-bottom: 0.5rem;
}

.sequoia-comment-avatar {
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 50%;
	background: var(--sequoia-border-color, #e5e7eb);
	object-fit: cover;
	flex-shrink: 0;
}

.sequoia-comment-avatar-placeholder {
	width: 2.5rem;
	height: 2.5rem;
	border-radius: 50%;
	background: var(--sequoia-border-color, #e5e7eb);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-shrink: 0;
	color: var(--sequoia-secondary-color, #6b7280);
	font-weight: 600;
	font-size: 1rem;
}

.sequoia-comment-meta {
	display: flex;
	flex-direction: column;
	min-width: 0;
}

.sequoia-comment-author {
	font-weight: 600;
	color: var(--sequoia-fg-color, #1f2937);
	text-decoration: none;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sequoia-comment-author:hover {
	color: var(--sequoia-accent-color, #2563eb);
}

.sequoia-comment-handle {
	font-size: 0.875rem;
	color: var(--sequoia-secondary-color, #6b7280);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sequoia-comment-time {
	font-size: 0.75rem;
	color: var(--sequoia-secondary-color, #6b7280);
	margin-left: auto;
	flex-shrink: 0;
}

.sequoia-comment-text {
	margin: 0;
	white-space: pre-wrap;
	word-wrap: break-word;
}

.sequoia-comment-text a {
	color: var(--sequoia-accent-color, #2563eb);
	text-decoration: none;
}

.sequoia-comment-text a:hover {
	text-decoration: underline;
}

.sequoia-comment-replies {
	margin-top: 0.75rem;
	margin-left: 1.5rem;
	padding-left: 1rem;
	border-left: 2px solid var(--sequoia-border-color, #e5e7eb);
}

.sequoia-comment-replies .sequoia-comment {
	margin-bottom: 0.5rem;
}

.sequoia-comment-replies .sequoia-comment:last-child {
	margin-bottom: 0;
}

.sequoia-bsky-logo {
	width: 1rem;
	height: 1rem;
}
`;
