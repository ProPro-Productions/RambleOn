/**
 * Move a split point to a new position — one atomic call backing the
 * timeline's drag-a-split gesture. Moving a split is how segment edges move:
 * dragging a segment's start/end just relocates the shared boundary, which
 * automatically affects the neighboring segment (never duplicates or shifts
 * content like Descript's scene-drag does).
 *
 * Usage:
 *   pnpm action move-recording-split --recordingId=<id> --fromMs=90558 --toMs=92000
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { parseEdits, serializeEdits } from "../app/lib/timestamp-mapping.js";
import { getDb, schema } from "../server/db/index.js";

const DEFAULT_TOLERANCE_MS = 80;
/** A moved split keeps at least this much distance from its neighbors. */
const MIN_GAP_MS = 100;

export default defineAction({
  description:
    "Move the split point nearest to fromMs (within toleranceMs, default 80) to toMs. Clamped so it never crosses a neighboring split or the recording bounds.",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    fromMs: z.coerce
      .number()
      .int()
      .min(0)
      .describe("Current position of the split to move (original ms)"),
    toMs: z.coerce
      .number()
      .int()
      .min(0)
      .describe("Target position (original ms)"),
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
      .select({
        editsJson: schema.recordings.editsJson,
        durationMs: schema.recordings.durationMs,
      })
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
      const distance = Math.abs(split.startMs - args.fromMs);
      if (
        distance <= args.toleranceMs &&
        (!nearest || distance < Math.abs(nearest.startMs - args.fromMs))
      ) {
        nearest = split;
      }
    }
    if (!nearest) {
      return {
        recordingId: args.recordingId,
        moved: false,
        note: `No split within ${args.toleranceMs}ms of ${args.fromMs}ms.`,
      };
    }

    const durationMs = existing.durationMs ?? 0;
    let lower = MIN_GAP_MS;
    let upper = durationMs > 0 ? durationMs - MIN_GAP_MS : args.toMs;
    for (const split of splits) {
      if (split === nearest) continue;
      if (split.startMs < nearest.startMs) {
        lower = Math.max(lower, split.startMs + MIN_GAP_MS);
      } else {
        upper = Math.min(upper, split.startMs - MIN_GAP_MS);
      }
    }
    const clampedMs = Math.round(Math.min(Math.max(args.toMs, lower), upper));

    const next = {
      ...edits,
      trims: edits.trims.map((t) =>
        t === nearest ? { ...t, startMs: clampedMs, endMs: clampedMs } : t,
      ),
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
      moved: true,
      fromMs: nearest.startMs,
      toMs: clampedMs,
      clamped: clampedMs !== args.toMs,
    };
  },
});
