/**
 * Update an annotation. The author can always edit their own annotation;
 * anyone with editor access to the recording can edit any annotation.
 *
 * Anchor edits: pass startMs/endMs to move; pass clearAnchor=true to turn the
 * annotation into a whole-video note; pass endMs=null-like via clearEnd=true
 * to collapse a section to a point.
 *
 * Usage:
 *   pnpm action update-annotation --id=<id> --label="tighter cut here"
 *   pnpm action update-annotation --id=<id> --resolved=true
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

const KIND_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function coerceBool(v: unknown) {
  return typeof v === "string" ? v === "true" : v;
}

export default defineAction({
  description:
    "Update an annotation's anchor, kind, label, body, groups, or resolved state. Authors edit their own; recording editors edit any. Use clearAnchor=true for whole-video, clearEnd=true to collapse a section to a point timestamp.",
  schema: z.object({
    id: z.string().describe("Annotation ID"),
    startMs: z.coerce.number().int().min(0).optional(),
    endMs: z.coerce.number().int().min(0).optional(),
    clearAnchor: z
      .preprocess(coerceBool, z.boolean())
      .default(false)
      .describe("Remove the anchor entirely (whole-video annotation)"),
    clearEnd: z
      .preprocess(coerceBool, z.boolean())
      .default(false)
      .describe("Drop endMs (section becomes a point timestamp)"),
    kind: z.string().regex(KIND_PATTERN).max(32).optional(),
    label: z.string().max(200).nullish(),
    body: z.string().nullish(),
    groups: z.array(z.string().min(1).max(64)).optional(),
    resolved: z.preprocess(coerceBool, z.boolean()).optional(),
  }),
  run: async (args) => {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(schema.recordingAnnotations)
      .where(eq(schema.recordingAnnotations.id, args.id))
      .limit(1);
    if (!existing) throw new Error(`Annotation not found: ${args.id}`);

    const userEmail = getRequestUserEmail();
    const isAuthor =
      !!userEmail &&
      !!existing.authorEmail &&
      userEmail.toLowerCase() === existing.authorEmail.toLowerCase();
    // Authors keep control of their own annotations (viewer access is enough);
    // everyone else needs editor rights on the recording.
    await assertAccess(
      "recording",
      existing.recordingId,
      isAuthor ? "viewer" : "editor",
    );

    const startMs = args.clearAnchor
      ? null
      : (args.startMs ?? existing.startMs);
    const endMs =
      args.clearAnchor || args.clearEnd ? null : (args.endMs ?? existing.endMs);
    if (endMs !== null && startMs === null) {
      throw new Error("A section needs startMs — set startMs or clearEnd.");
    }
    if (endMs !== null && startMs !== null && endMs <= startMs) {
      throw new Error("endMs must be greater than startMs.");
    }

    await db
      .update(schema.recordingAnnotations)
      .set({
        startMs,
        endMs,
        kind: args.kind ?? existing.kind,
        label: args.label === undefined ? existing.label : args.label,
        body: args.body === undefined ? existing.body : args.body,
        groupsJson:
          args.groups === undefined
            ? existing.groupsJson
            : JSON.stringify(args.groups),
        resolved: args.resolved ?? Boolean(existing.resolved),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.recordingAnnotations.id, args.id));

    await writeAppState("refresh-signal", { ts: Date.now() });
    return { id: args.id, recordingId: existing.recordingId };
  },
});
