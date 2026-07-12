/**
 * Add an annotation to a recording — the unified time-anchored layer for
 * editorial intent.
 *
 * Anchors: omit startMs/endMs for a whole-video note, pass startMs alone for a
 * point timestamp (needle marker), pass startMs+endMs for a section.
 *
 * Kinds carry meaning for edit synthesis: "editor-note" (instruction for the
 * editor), "b-roll" (b-roll expected here), "retake" (fresh start — take
 * before this point is bad), "generic" (plain marker). Custom kebab-case kinds
 * are allowed.
 *
 * Usage:
 *   pnpm action add-annotation --recordingId=<id> --startMs=12000 --kind=b-roll --label="screen zoom here"
 *   pnpm action add-annotation --recordingId=<id> --startMs=5000 --endMs=18000 --kind=retake
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

export default defineAction({
  description:
    "Add an annotation to a recording: a whole-video note (no anchor), a point timestamp (startMs only), or a section (startMs+endMs). kind carries editorial meaning: editor-note, b-roll, retake, generic, or a custom kebab-case kind. Sections can carry flat group tags. Use add-comment with annotationId to hang a discussion thread off an annotation.",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    startMs: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Anchor start (ms). Omit for a whole-video annotation."),
    endMs: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Anchor end (ms) — makes the annotation a section."),
    kind: z
      .string()
      .regex(KIND_PATTERN, "kind must be kebab-case")
      .max(32)
      .default("generic")
      .describe(
        "Semantic kind: editor-note | b-roll | retake | generic | custom kebab-case",
      ),
    label: z.string().max(200).optional().describe("Short display label"),
    body: z.string().optional().describe("Longer text content, if any"),
    groups: z
      .array(z.string().min(1).max(64))
      .default([])
      .describe("Flat group tags (sections can be grouped, tag-like)"),
    source: z
      .enum(["manual", "shortcut", "voice", "ai", "import"])
      .default("manual")
      .describe("How the annotation was created"),
    authorKind: z
      .enum(["user", "ai"])
      .default("user")
      .describe("Pass 'ai' when the agent authors the annotation itself"),
    authorName: z.string().optional().describe("Display name for the author"),
  }),
  run: async (args) => {
    // Same bar as commenting: anyone who can view the recording can annotate.
    await assertAccess("recording", args.recordingId, "viewer");

    const authorEmail = getRequestUserEmail();
    if (!authorEmail) {
      throw new Error("Sign in required to annotate recordings.");
    }

    if (args.endMs !== undefined && args.startMs === undefined) {
      throw new Error("endMs requires startMs (a section needs both bounds).");
    }
    if (
      args.endMs !== undefined &&
      args.startMs !== undefined &&
      args.endMs <= args.startMs
    ) {
      throw new Error("endMs must be greater than startMs.");
    }

    const db = getDb();
    const [rec] = await db
      .select({ organizationId: schema.recordings.organizationId })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, args.recordingId))
      .limit(1);
    if (!rec) throw new Error(`Recording not found: ${args.recordingId}`);

    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(schema.recordingAnnotations).values({
      id,
      recordingId: args.recordingId,
      organizationId: rec.organizationId,
      startMs: args.startMs ?? null,
      endMs: args.endMs ?? null,
      kind: args.kind,
      label: args.label ?? null,
      body: args.body ?? null,
      authorEmail,
      authorName: args.authorName ?? null,
      authorKind: args.authorKind,
      source: args.source,
      groupsJson: JSON.stringify(args.groups),
      createdAt: now,
      updatedAt: now,
    });

    await writeAppState("refresh-signal", { ts: Date.now() });

    const anchor =
      args.startMs === undefined
        ? "whole video"
        : args.endMs === undefined
          ? `@ ${args.startMs}ms`
          : `${args.startMs}–${args.endMs}ms`;
    return { id, recordingId: args.recordingId, kind: args.kind, anchor };
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
