/**
 * Delete an annotation. The author can delete their own; anyone with editor
 * access to the recording can delete any. Comments that referenced the
 * annotation keep their own timestamp anchor (annotation_id just goes stale
 * and is cleared here).
 *
 * Usage:
 *   pnpm action delete-annotation --id=<id>
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Delete an annotation by id. Authors delete their own; recording editors delete any. Comments attached to it survive (their annotationId link is cleared).",
  schema: z.object({
    id: z.string().describe("Annotation ID"),
  }),
  run: async (args) => {
    const db = getDb();
    const [existing] = await db
      .select({
        id: schema.recordingAnnotations.id,
        recordingId: schema.recordingAnnotations.recordingId,
        authorEmail: schema.recordingAnnotations.authorEmail,
      })
      .from(schema.recordingAnnotations)
      .where(eq(schema.recordingAnnotations.id, args.id))
      .limit(1);
    if (!existing) throw new Error(`Annotation not found: ${args.id}`);

    const userEmail = getRequestUserEmail();
    const isAuthor =
      !!userEmail &&
      !!existing.authorEmail &&
      userEmail.toLowerCase() === existing.authorEmail.toLowerCase();
    await assertAccess(
      "recording",
      existing.recordingId,
      isAuthor ? "viewer" : "editor",
    );

    // Detach comments that pointed at this annotation before removing it.
    await db
      .update(schema.recordingComments)
      .set({ annotationId: null })
      .where(eq(schema.recordingComments.annotationId, args.id));
    await db
      .delete(schema.recordingAnnotations)
      .where(eq(schema.recordingAnnotations.id, args.id));

    await writeAppState("refresh-signal", { ts: Date.now() });
    return { deleted: args.id, recordingId: existing.recordingId };
  },
});
