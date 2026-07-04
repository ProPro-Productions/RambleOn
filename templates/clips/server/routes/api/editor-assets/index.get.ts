/**
 * Upload readiness check for the full video editor's asset uploads.
 *
 * Route: GET /api/editor-assets
 * Returns `{ configured, maxSizeBytes }` — the editor's upload flow calls this
 * before PUTting bytes so it can surface a friendly "connect storage" error.
 */

import { defineEventHandler, setResponseStatus, type H3Event } from "h3";

import { getEventOwnerContext } from "../../../lib/recordings.js";
import {
  hasRequestVideoStorage,
  requiresConfiguredVideoStorage,
} from "../../../lib/video-storage.js";
import {
  EDITOR_ASSET_MAX_BYTES,
  EDITOR_ASSET_MAX_BYTES_INLINE,
} from "./shared.js";

export default defineEventHandler(async (event: H3Event) => {
  let userEmail: string;
  let orgId: string | undefined;
  try {
    const context = await getEventOwnerContext(event);
    userEmail = context.userEmail;
    orgId = context.orgId;
  } catch {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  const hasStorage = await hasRequestVideoStorage({ userEmail, orgId });
  if (hasStorage) {
    return { configured: true, maxSizeBytes: EDITOR_ASSET_MAX_BYTES };
  }

  // Local/dev SQLite mode: small assets can fall back to inline data URLs.
  if (!requiresConfiguredVideoStorage()) {
    return { configured: true, maxSizeBytes: EDITOR_ASSET_MAX_BYTES_INLINE };
  }

  return { configured: false, maxSizeBytes: 0 };
});
