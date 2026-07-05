/**
 * List a recording's edit versions — proposed, accepted, rejected, and
 * superseded snapshots — newest first. Metadata only; fetch a version's
 * editsJson with get-edit-version.
 *
 * Usage:
 *   pnpm action list-edit-versions --recordingId=<id>
 */

import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List a recording's edit versions (metadata only, newest first): proposals awaiting review, accepted/rejected history, and superseded snapshots of earlier edits. Use get-edit-version for a version's editsJson.",
  schema: z.object({
    recordingId: z.string().describe("Recording ID"),
    status: z
      .enum(["proposed", "accepted", "rejected", "superseded"])
      .optional()
      .describe("Only versions with this status"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args) => {
    await assertAccess("recording", args.recordingId, "viewer");
    const db = getDb();
    const rows = await db
      .select({
        id: schema.recordingEditVersions.id,
        recordingId: schema.recordingEditVersions.recordingId,
        targetKind: schema.recordingEditVersions.targetKind,
        title: schema.recordingEditVersions.title,
        note: schema.recordingEditVersions.note,
        authorEmail: schema.recordingEditVersions.authorEmail,
        authorName: schema.recordingEditVersions.authorName,
        authorKind: schema.recordingEditVersions.authorKind,
        status: schema.recordingEditVersions.status,
        reviewedAt: schema.recordingEditVersions.reviewedAt,
        reviewedBy: schema.recordingEditVersions.reviewedBy,
        createdAt: schema.recordingEditVersions.createdAt,
        updatedAt: schema.recordingEditVersions.updatedAt,
      })
      .from(schema.recordingEditVersions)
      .where(eq(schema.recordingEditVersions.recordingId, args.recordingId))
      .orderBy(desc(schema.recordingEditVersions.createdAt));
    const versions = args.status
      ? rows.filter((v) => v.status === args.status)
      : rows;
    return { versions, total: versions.length };
  },
});
