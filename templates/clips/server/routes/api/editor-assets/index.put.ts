/**
 * Asset upload for the full video editor (b-roll images, music, extra video).
 *
 * Route: PUT /api/editor-assets
 * Body: raw asset bytes, Content-Type set to the asset MIME type.
 * Returns `{ url, fileKey }` — the final read URL from the configured storage
 * provider (Builder.io Connect / S3-compatible), or an inline data URL in
 * local dev when no provider is configured.
 */

import { randomUUID } from "node:crypto";

import { uploadFile } from "@agent-native/core/file-upload";
import { runWithRequestContext } from "@agent-native/core/server";
import {
  defineEventHandler,
  getHeader,
  readRawBody,
  setResponseStatus,
  type H3Event,
} from "h3";

import { getEventOwnerContext } from "../../../lib/recordings.js";
import { requiresConfiguredVideoStorage } from "../../../lib/video-storage.js";
import {
  EDITOR_ASSET_MAX_BYTES,
  EDITOR_ASSET_MAX_BYTES_INLINE,
} from "./shared.js";

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

export default defineEventHandler(async (event: H3Event) => {
  let ownerEmail: string;
  let orgId: string | undefined;
  try {
    const context = await getEventOwnerContext(event);
    ownerEmail = context.userEmail;
    orgId = context.orgId;
  } catch {
    setResponseStatus(event, 401);
    return { error: "Unauthorized" };
  }

  return runWithRequestContext({ userEmail: ownerEmail, orgId }, async () => {
    const contentLength = Number(getHeader(event, "content-length") || 0);
    if (contentLength > EDITOR_ASSET_MAX_BYTES) {
      setResponseStatus(event, 413);
      return { error: "Asset too large" };
    }

    const raw = await readRawBody(event, false);
    if (!raw || raw.byteLength === 0) {
      setResponseStatus(event, 400);
      return { error: "Empty body" };
    }
    if (raw.byteLength > EDITOR_ASSET_MAX_BYTES) {
      setResponseStatus(event, 413);
      return { error: "Asset too large" };
    }

    const mimeType = (getHeader(event, "content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const ext = EXTENSION_BY_MIME[mimeType] ?? "bin";
    const fileKey = `editor-asset-${randomUUID()}.${ext}`;

    const bytes: Uint8Array =
      raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);

    const uploaded = await uploadFile({
      data: bytes,
      mimeType: mimeType || "application/octet-stream",
      filename: fileKey,
      ownerEmail,
    });

    if (uploaded?.url) {
      return { url: uploaded.url, fileKey };
    }

    // Local dev fallback: no provider configured — inline small assets so the
    // editor keeps working while the user connects storage.
    if (!requiresConfiguredVideoStorage()) {
      if (bytes.byteLength > EDITOR_ASSET_MAX_BYTES_INLINE) {
        setResponseStatus(event, 413);
        return {
          error:
            "Asset too large to store without configured storage. Connect Builder.io or S3-compatible storage.",
        };
      }
      const base64 = Buffer.from(bytes).toString("base64");
      return {
        url: `data:${mimeType || "application/octet-stream"};base64,${base64}`,
        fileKey,
      };
    }

    setResponseStatus(event, 424);
    return {
      error:
        "No storage configured. Connect Builder.io or S3-compatible storage in Settings.",
    };
  });
});
