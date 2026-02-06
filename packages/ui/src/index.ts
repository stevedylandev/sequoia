// Components
export { SequoiaComments } from "./components/sequoia-comments";

// AT Protocol client utilities
export {
	parseAtUri,
	resolvePDS,
	getRecord,
	getDocument,
	getPostThread,
	buildBskyAppUrl,
} from "./lib/atproto-client";

// Types
export type {
	StrongRef,
	ProfileViewBasic,
	PostRecord,
	PostView,
	ThreadViewPost,
	BlockedPost,
	NotFoundPost,
	DocumentRecord,
} from "./types/bluesky";

export { isThreadViewPost } from "./types/bluesky";

// Styles and theming
export type { SequoiaTheme, SequoiaCSSVar } from "./types/styles";
export { SEQUOIA_CSS_VARS } from "./types/styles";
