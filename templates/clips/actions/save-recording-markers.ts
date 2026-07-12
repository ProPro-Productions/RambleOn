/**
 * Persist the timestamp markers captured during a recording session — one
 * atomic batch write when the recording finishes, instead of one call per
 * marker while recording.
 *
 * UI/internal: the recorder buffers hotkey markers client-side (with elapsed
 * recording time, pauses excluded) and calls this once from the stop path.
 * Agents adding markers after the fact should use `add-annotation`.
 *
 * Usage:
 *   pnpm action save-recording-markers --recordingId=<id> --markers='[{"atMs":12000,"kind":"b-roll"}]'
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "../server/lib/recordings.js";

const KIND_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const markerSchema = z.object({
  atMs: z.number().int().min(0).describe("Recording time (ms) of the marker"),
  kind: z
    .string()
    .regex(KIND_PATTERN)
    .max(32)
    .default("generic")
    .describe(
      "Semantic kind: generic | editor-note | b-roll | retake | custom",
    ),
  label: z.string().max(200).optional(),
});

export default defineAction({
  description:
    "UI/internal: batch-save the timestamp markers captured with recorder hotkeys during a recording session (source='shortcut'). One atomic call at stop time. For ad-hoc annotations use add-annotation instead.",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    markers: z
      .preprocess(
        (v) => (typeof v === "string" ? JSON.parse(v) : v),
        z.array(markerSchema).min(1).max(200),
      )
      .describe("Markers captured during the session"),
  }),
  run: async (args) => {
    await assertAccess("recording", args.recordingId, "viewer");
    const authorEmail = getRequestUserEmail();
    if (!authorEmail) {
      throw new Error("Sign in required to save recording markers.");
    }

    const db = getDb();
    const [rec] = await db
      .select({ organizationId: schema.recordings.organizationId })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, args.recordingId))
      .limit(1);
    if (!rec) throw new Error(`Recording not found: ${args.recordingId}`);

    const now = new Date().toISOString();
    await db.insert(schema.recordingAnnotations).values(
      args.markers.map((marker) => ({
        id: nanoid(),
        recordingId: args.recordingId,
        organizationId: rec.organizationId,
        startMs: marker.atMs,
        endMs: null,
        kind: marker.kind,
        label: marker.label ?? null,
        body: null,
        authorEmail,
        authorName: null,
        authorKind: "user",
        source: "shortcut",
        groupsJson: "[]",
        createdAt: now,
        updatedAt: now,
      })),
    );

    await writeAppState("refresh-signal", { ts: Date.now() });
    return { recordingId: args.recordingId, saved: args.markers.length };
  },
});
