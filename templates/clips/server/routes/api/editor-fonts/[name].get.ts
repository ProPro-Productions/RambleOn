/**
 * Google Font info lookup for the full video editor's font picker.
 *
 * Route: GET /api/editor-fonts/:name
 * Serves one entry from the vendored fonts database (3.8MB — kept server-side
 * so the browser only ever loads the fonts it actually uses).
 */

import {
  defineEventHandler,
  getRouterParam,
  setResponseStatus,
  type H3Event,
} from "h3";

import { GOOGLE_FONTS_DATABASE } from "../../../../app/video-editor/editor/data/google-fonts.js";

export default defineEventHandler(async (event: H3Event) => {
  const name = getRouterParam(event, "name");
  const entry = GOOGLE_FONTS_DATABASE.find(
    (font) => font.fontFamily === decodeURIComponent(name ?? ""),
  );

  if (!entry) {
    setResponseStatus(event, 404);
    return { error: "Font not found" };
  }

  return entry;
});
