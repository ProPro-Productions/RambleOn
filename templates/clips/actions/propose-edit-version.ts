/**
 * Propose an edit version for a recording — a complete alternative
 * non-destructive edit set that lives BESIDE the current edits until the
 * owner reviews it. This is how AI edit synthesis and human editors hand
 * work back without touching the original: propose, let the owner watch it,
 * accept or reject.
 *
 * Usage:
 *   pnpm action propose-edit-version --recordingId=<id> --editsJson='{"trims":[...]}' --title="Tightened cut" --note="Removed retakes and silences"
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { parseEdits, serializeEdits } from "../app/lib/timestamp-mapping.js";
import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "../server/lib/recordings.js";

export default defineAction({
  description:
    "Propose an edit version for a recording: a complete alternative editsJson set stored beside the current edits (never applied directly). The owner reviews with review-edit-version. AI-authored proposals should pass authorKind=ai. Returns the version id.",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    editsJson: z
      .string()
      .min(2)
      .describe(
        "The proposed edit set, same JSON shape as recordings.editsJson (trims/splits/speed...). Stored normalized.",
      ),
    title: z
      .string()
      .max(200)
      .default("Untitled version")
      .describe("Short human name, e.g. 'Tightened cut'"),
    note: z
      .string()
      .optional()
      .describe("What this version changes and why — shown during review"),
    authorKind: z
      .enum(["user", "ai"])
      .default("user")
      .describe("Pass 'ai' when the agent authored the version"),
    authorName: z.string().optional(),
  }),
  run: async (args) => {
    await assertAccess("recording", args.recordingId, "editor");
    const authorEmail = getRequestUserEmail();
    if (!authorEmail) {
      throw new Error("Sign in required to propose edit versions.");
    }

    const db = getDb();
    const [rec] = await db
      .select({ organizationId: schema.recordings.organizationId })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, args.recordingId))
      .limit(1);
    if (!rec) throw new Error(`Recording not found: ${args.recordingId}`);

    // Canonicalize through the same parser playback uses, so a version can
    // never carry an edit shape the player would choke on.
    const normalized = serializeEdits(parseEdits(args.editsJson));

    const id = nanoid();
    const now = new Date().toISOString();
    await db.insert(schema.recordingEditVersions).values({
      id,
      recordingId: args.recordingId,
      organizationId: rec.organizationId,
      title: args.title,
      note: args.note ?? null,
      editsJson: normalized,
      authorEmail,
      authorName: args.authorName ?? null,
      authorKind: args.authorKind,
      createdAt: now,
      updatedAt: now,
    });

    await writeAppState("refresh-signal", { ts: Date.now() });
    return { id, recordingId: args.recordingId, status: "proposed" };
  },
  link: ({ args }) => {
    const recordingId = (args as { recordingId?: unknown })?.recordingId;
    if (typeof recordingId !== "string") return null;
    return {
      url: `/r/${encodeURIComponent(recordingId)}`,
      label: "Open recording",
    };
  },
});
