/**
 * Remove a split point from a recording's edits. Splits are stored as
 * zero-length non-excluded trims; this deletes the one nearest to `atMs`
 * (within a small tolerance window so UI clicks don't need to be
 * millisecond-exact).
 *
 * Usage:
 *   pnpm action remove-recording-split --recordingId=<id> --atMs=90558
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { parseEdits, serializeEdits } from "../app/lib/timestamp-mapping.js";
import { getDb, schema } from "../server/db/index.js";

const DEFAULT_TOLERANCE_MS = 80;

export default defineAction({
  description:
    "Remove the split point nearest to atMs (within toleranceMs, default 80). Segments on either side merge back together; no content is affected.",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    atMs: z.coerce
      .number()
      .int()
      .min(0)
      .describe("Position of the split to remove (original ms)"),
    toleranceMs: z.coerce
      .number()
      .int()
      .min(0)
      .max(2_000)
      .default(DEFAULT_TOLERANCE_MS),
  }),
  run: async (args) => {
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
    const splits = edits.trims.filter(
      (t) => !t.excluded && t.startMs === t.endMs,
    );
    let nearest: (typeof splits)[number] | null = null;
    for (const split of splits) {
      const distance = Math.abs(split.startMs - args.atMs);
      if (
        distance <= args.toleranceMs &&
        (!nearest || distance < Math.abs(nearest.startMs - args.atMs))
      ) {
        nearest = split;
      }
    }
    if (!nearest) {
      return {
        recordingId: args.recordingId,
        removed: false,
        note: `No split within ${args.toleranceMs}ms of ${args.atMs}ms.`,
      };
    }

    const next = {
      ...edits,
      trims: edits.trims.filter((t) => t !== nearest),
    };
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
      removed: true,
      atMs: nearest.startMs,
      remainingSplits: next.trims.filter(
        (t) => !t.excluded && t.startMs === t.endMs,
      ).length,
    };
  },
});
