/**
 * List the current user's previously uploaded editor media assets (b-roll,
 * images, music) — the metadata index behind the full editor's "recent
 * sources" picker. Rows point at the single canonical copy in storage;
 * nothing is duplicated.
 *
 * Usage:
 *   pnpm action list-editor-media-assets
 */

import { defineAction } from "@agent-native/core";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { desc } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ownerEmailMatches } from "../server/lib/recordings.js";

export default defineAction({
  description:
    "List media assets previously uploaded through the full video editor (b-roll, images, music), newest first. Each entry's url can be added to a video project as a source without re-uploading.",
  schema: z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const email = getRequestUserEmail();
    if (!email) {
      throw new Error("Not authenticated");
    }

    const db = getDb();
    const rows = await db
      .select({
        id: schema.editorMediaAssets.id,
        filename: schema.editorMediaAssets.filename,
        mimeType: schema.editorMediaAssets.mimeType,
        sizeBytes: schema.editorMediaAssets.sizeBytes,
        url: schema.editorMediaAssets.url,
        createdAt: schema.editorMediaAssets.createdAt,
      })
      .from(schema.editorMediaAssets)
      .where(ownerEmailMatches(schema.editorMediaAssets.ownerEmail, email))
      .orderBy(desc(schema.editorMediaAssets.createdAt))
      .limit(args.limit ?? 50);

    return { assets: rows };
  },
});
