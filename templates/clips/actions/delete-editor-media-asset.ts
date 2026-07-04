/**
 * Remove an entry from the editor media assets index (the "recent sources"
 * list). Metadata only — the stored file is untouched, and projects that
 * already reference its URL keep working.
 *
 * Usage:
 *   pnpm action delete-editor-media-asset --id=<assetId>
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { ownerEmailMatches } from "../server/lib/recordings.js";

export default defineAction({
  description:
    "Remove a media asset from the full editor's recent-sources list. Only the metadata entry is deleted — the uploaded file and any projects referencing it are unaffected.",
  schema: z.object({
    id: z.string().describe("Editor media asset id"),
  }),
  run: async (args) => {
    const email = getRequestUserEmail();
    if (!email) {
      throw new Error("Not authenticated");
    }

    const db = getDb();
    const [deleted] = await db
      .delete(schema.editorMediaAssets)
      .where(
        and(
          eq(schema.editorMediaAssets.id, args.id),
          ownerEmailMatches(schema.editorMediaAssets.ownerEmail, email),
        ),
      )
      .returning({ id: schema.editorMediaAssets.id });

    if (!deleted) {
      throw new Error(`Editor media asset not found: ${args.id}`);
    }

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { id: args.id, deleted: true };
  },
});
