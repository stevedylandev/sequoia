/**
 * CSS custom properties for theming SequoiaComments
 *
 * @example
 * ```css
 * :root {
 *   --sequoia-fg-color: #1f2937;
 *   --sequoia-bg-color: #ffffff;
 *   --sequoia-accent-color: #2563eb;
 * }
 * ```
 */
export interface SequoiaTheme {
	/** Primary text color (default: #1f2937) */
	"--sequoia-fg-color"?: string;
	/** Background color for comments and containers (default: #ffffff) */
	"--sequoia-bg-color"?: string;
	/** Border color for separators and outlines (default: #e5e7eb) */
	"--sequoia-border-color"?: string;
	/** Secondary/muted text color (default: #6b7280) */
	"--sequoia-secondary-color"?: string;
	/** Accent color for links and buttons (default: #2563eb) */
	"--sequoia-accent-color"?: string;
	/** Border radius for cards and buttons (default: 8px) */
	"--sequoia-border-radius"?: string;
}

/**
 * All available CSS custom property names
 */
export const SEQUOIA_CSS_VARS = [
	"--sequoia-fg-color",
	"--sequoia-bg-color",
	"--sequoia-border-color",
	"--sequoia-secondary-color",
	"--sequoia-accent-color",
	"--sequoia-border-radius",
] as const;

export type SequoiaCSSVar = (typeof SEQUOIA_CSS_VARS)[number];
