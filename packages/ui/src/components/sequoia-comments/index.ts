import { SequoiaComments } from "./sequoia-comments";

// Register the custom element if not already registered
if (
	typeof customElements !== "undefined" &&
	!customElements.get("sequoia-comments")
) {
	customElements.define("sequoia-comments", SequoiaComments);
}

export { SequoiaComments };
