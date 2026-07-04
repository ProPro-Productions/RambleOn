/**
 * List a recording's annotations — the unified time-anchored view of
 * editorial intent: whole-video notes, point timestamps, and sections, plus
 * (by default) the recording's comments mapped into the same shape.
 *
 * Comments are included so agents and UIs get ONE ordered surface for
 * "everything anchored to this recording's timeline". Legacy comments have
 * entity="comment" and keep their thread fields; edit them through the
 * comment actions, not update-annotation.
 *
 * Usage:
 *   pnpm action list-annotations --recordingId=<id>
 *   pnpm action list-annotations --recordingId=<id> --kind=b-roll --includeComments=false
 */

import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export type AnnotationAnchorType = "video" | "point" | "range";

function anchorType(
  startMs: number | null,
  endMs: number | null,
): AnnotationAnchorType {
  if (startMs === null || startMs === undefined) return "video";
  if (endMs === null || endMs === undefined) return "point";
  return "range";
}

function parseGroups(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((g): g is string => typeof g === "string")
      : [];
  } catch {
    return [];
  }
}

export default defineAction({
  description:
    "List a recording's annotations (whole-video notes, point timestamps, sections) sorted by anchor time — whole-video entries first. Includes the recording's comments mapped into the same shape (entity='comment') unless includeComments=false. Filter by kind (e.g. editor-note, b-roll, retake).",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    kind: z
      .string()
      .optional()
      .describe(
        "Only annotations of this kind (comments are never filtered out by kind unless includeComments=false)",
      ),
    includeComments: z
      .preprocess(
        (v) => (typeof v === "string" ? v === "true" : v),
        z.boolean(),
      )
      .default(true)
      .describe("Also include comments mapped into the annotation shape"),
    includeResolved: z
      .preprocess(
        (v) => (typeof v === "string" ? v === "true" : v),
        z.boolean(),
      )
      .default(true)
      .describe("Include resolved annotations/comments"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args) => {
    await assertAccess("recording", args.recordingId, "viewer");
    const db = getDb();

    const annotationRows = await db
      .select()
      .from(schema.recordingAnnotations)
      .where(eq(schema.recordingAnnotations.recordingId, args.recordingId))
      .orderBy(asc(schema.recordingAnnotations.startMs));

    const annotations = annotationRows
      .filter((a) => (args.kind ? a.kind === args.kind : true))
      .filter((a) => (args.includeResolved ? true : !a.resolved))
      .map((a) => ({
        entity: "annotation" as const,
        id: a.id,
        recordingId: a.recordingId,
        anchorType: anchorType(a.startMs, a.endMs),
        startMs: a.startMs,
        endMs: a.endMs,
        kind: a.kind,
        label: a.label,
        body: a.body,
        authorEmail: a.authorEmail,
        authorName: a.authorName,
        authorKind: a.authorKind,
        source: a.source,
        groups: parseGroups(a.groupsJson),
        resolved: Boolean(a.resolved),
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
      }));

    let comments: Array<Record<string, unknown>> = [];
    if (args.includeComments) {
      const commentRows = await db
        .select()
        .from(schema.recordingComments)
        .where(eq(schema.recordingComments.recordingId, args.recordingId))
        .orderBy(asc(schema.recordingComments.videoTimestampMs));
      comments = commentRows
        .filter((c) => (args.includeResolved ? true : !c.resolved))
        .map((c) => ({
          entity: "comment" as const,
          id: c.id,
          recordingId: c.recordingId,
          anchorType: "point" as const,
          startMs: c.videoTimestampMs,
          endMs: null,
          kind: "comment",
          label: null,
          body: c.content,
          authorEmail: c.authorEmail,
          authorName: c.authorName,
          authorKind: "user",
          source: "manual",
          groups: [],
          resolved: Boolean(c.resolved),
          // Thread fields only comments have:
          threadId: c.threadId,
          parentId: c.parentId,
          annotationId: c.annotationId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }));
    }

    // One ordered surface: whole-video entries first, then by anchor time.
    const merged = [...annotations, ...comments].sort((a, b) => {
      const aStart = (a.startMs as number | null) ?? -1;
      const bStart = (b.startMs as number | null) ?? -1;
      if (aStart !== bStart) return aStart - bStart;
      return String(a.createdAt).localeCompare(String(b.createdAt));
    });

    return { annotations: merged, total: merged.length };
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
