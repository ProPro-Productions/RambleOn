import type { Plugin } from "vite";

/**
 * RambleOn fork branding.
 *
 * This repo tracks the upstream Clips template daily, so the source tree
 * must stay byte-compatible with upstream — no mass renames. Instead, this
 * plugin rewrites the user-visible product name at build/dev time, which
 * also covers strings upstream adds in the future.
 *
 * The replacement is word-boundary and case-sensitive on the capitalized
 * product name, so structural identifiers never match: `com.clips.tray`,
 * `clips:*` event names, `clips:server-url` storage keys,
 * `clips.agent-native.com` URLs (all lowercase) and `CLIPS_*` env/define
 * tokens (all caps) are untouched. Lowercase generic copy ("your clips")
 * is intentionally kept — recordings are still called clips.
 *
 * The desktop bundle identity (app name, DMG, menu bar) is branded
 * separately via `desktop/src-tauri/tauri.rambleon.conf.json` through
 * `tauri build --config` (see the `tauri:*:rambleon` package scripts).
 */
export const BRAND_NAME = "RambleOn";
const UPSTREAM_NAME = "Clips";

const BRAND_PATTERN = new RegExp(`\\b${UPSTREAM_NAME}\\b`, "g");

function rebrand(text: string): string {
  BRAND_PATTERN.lastIndex = 0;
  return text.replace(BRAND_PATTERN, BRAND_NAME);
}

export function rambleOnBranding(): Plugin {
  return {
    name: "rambleon-branding",
    enforce: "pre",
    transform(code, id) {
      // Workspace source only (templates/*, packages/*); third-party
      // dependencies never carry the product name.
      if (id.includes("node_modules")) return null;
      const rebranded = rebrand(code);
      if (rebranded === code) return null;
      return { code: rebranded, map: null };
    },
    transformIndexHtml(html) {
      return rebrand(html);
    },
  };
}
