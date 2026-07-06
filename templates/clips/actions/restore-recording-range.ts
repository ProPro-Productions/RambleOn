/**
 * Restore (un-ignore) a range of a recording — the inverse of
 * `trim-recording`. Any excluded trims intersecting the range are removed,
 * shrunk, or split so the range plays again. This powers the Descript-style
 * "Restore ignored text" flow: Ignore strikes content through
 * (trim-recording), Restore brings it back.
 *
 * Usage:
 *   pnpm action restore-recording-range --recordingId=<id> --startMs=12000 --endMs=15000
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { parseEdits, serializeEdits } from "../app/lib/timestamp-mapping.js";
import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Restore (un-ignore) a time range of a recording: removes, shrinks, or splits any excluded trims intersecting the range so it plays again. Inverse of trim-recording.",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    startMs: z.coerce
      .number()
      .int()
      .min(0)
      .describe("Start of the range to restore (original ms)"),
    endMs: z.coerce
      .number()
      .int()
      .min(0)
      .describe("End of the range to restore (original ms)"),
  }),
  run: async (args) => {
    if (args.endMs <= args.startMs) {
      throw new Error("endMs must be greater than startMs");
    }
    await assertAccess("recording", args.recordingId, "editor");

    const db = getDb();
    const [existing] = await db
      .select({ editsJson: schema.recordings.editsJson })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, args.recordingId));
    if (!existing) {
      throw new Error(`Recording not found: ${args.recordingId}`);
    }

    const edits = parseEdits(existing.editsJson);
    let restoredMs = 0;
    const nextTrims: typeof edits.trims = [];
    for (const trim of edits.trims) {
      if (!trim.excluded || trim.endMs <= args.startMs || trim.startMs >= args.endMs) {
        nextTrims.push(trim);
        continue;
      }
      const overlapStart = Math.max(trim.startMs, args.startMs);
      const overlapEnd = Math.min(trim.endMs, args.endMs);
      restoredMs += overlapEnd - overlapStart;
      // Keep the parts of the trim outside the restored range.
      if (trim.startMs < args.startMs) {
        nextTrims.push({ ...trim, endMs: args.startMs });
      }
      if (trim.endMs > args.endMs) {
        nextTrims.push({ ...trim, startMs: args.endMs });
      }
    }

    if (restoredMs === 0) {
      return {
        recordingId: args.recordingId,
        restoredMs: 0,
        note: "No excluded range intersects the given range.",
      };
    }

    const next = { ...edits, trims: nextTrims };
    await db
      .update(schema.recordings)
      .set({
        editsJson: serializeEdits(next),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.recordings.id, args.recordingId));

    await writeAppState("refresh-signal", { ts: Date.now() });
    return {
      recordingId: args.recordingId,
      restoredMs,
      remainingExcludedRanges: nextTrims.filter((t) => t.excluded).length,
    };
  },
});
