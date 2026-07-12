/**
 * Accept or reject a proposed edit version. Owner/admin only — the recording
 * owner stays in control of what actually ships.
 *
 * Accepting applies the version's editsJson to the recording; the previous
 * edits (when non-empty and different) are preserved automatically as a
 * `superseded` version, so accepting is never destructive. Rejecting only
 * flips status — leave feedback for the author with comments or annotations.
 *
 * Usage:
 *   pnpm action review-edit-version --id=<versionId> --decision=accept
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { resolveAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { nanoid } from "../server/lib/recordings.js";

export default defineAction({
  description:
    "Accept or reject a proposed edit version (recording owner/admin only). Accept applies the version's edits to the recording and archives the previous edits as a 'superseded' version; reject just flips status. Leave feedback for the author via comments/annotations.",
  schema: z.object({
    id: z.string().describe("Edit version ID"),
    decision: z.enum(["accept", "reject"]).describe("Review decision"),
  }),
  run: async (args) => {
    const db = getDb();
    const [version] = await db
      .select()
      .from(schema.recordingEditVersions)
      .where(eq(schema.recordingEditVersions.id, args.id))
      .limit(1);
    if (!version) throw new Error(`Edit version not found: ${args.id}`);
    if (version.status !== "proposed") {
      throw new Error(
        `Only proposed versions can be reviewed (status: ${version.status})`,
      );
    }

    const access = await resolveAccess("recording", version.recordingId);
    const role = String(access?.role ?? "");
    if (role !== "owner" && role !== "admin") {
      throw new Error(
        "Only the recording owner can accept or reject edit versions.",
      );
    }
    const reviewer = getRequestUserEmail() ?? null;
    const now = new Date().toISOString();

    if (args.decision === "reject") {
      await db
        .update(schema.recordingEditVersions)
        .set({
          status: "rejected",
          reviewedAt: now,
          reviewedBy: reviewer,
          updatedAt: now,
        })
        .where(eq(schema.recordingEditVersions.id, args.id));
      await writeAppState("refresh-signal", { ts: Date.now() });
      return { id: args.id, status: "rejected" };
    }

    const [recording] = await db
      .select({
        id: schema.recordings.id,
        editsJson: schema.recordings.editsJson,
        organizationId: schema.recordings.organizationId,
      })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, version.recordingId))
      .limit(1);
    if (!recording) {
      throw new Error(`Recording not found: ${version.recordingId}`);
    }

    // Never lose the edits being replaced: archive them as a superseded
    // version unless they're empty or identical to the proposal.
    const previous = recording.editsJson ?? "";
    let supersededId: string | null = null;
    if (previous.trim() && previous !== version.editsJson) {
      supersededId = nanoid();
      await db.insert(schema.recordingEditVersions).values({
        id: supersededId,
        recordingId: version.recordingId,
        organizationId: recording.organizationId,
        title: `Edits before "${version.title}"`,
        note: "Automatic snapshot taken when the version was accepted.",
        editsJson: previous,
        authorEmail: reviewer,
        authorKind: "user",
        status: "superseded",
        createdAt: now,
        updatedAt: now,
      });
    }

    await db
      .update(schema.recordings)
      .set({ editsJson: version.editsJson, updatedAt: now })
      .where(eq(schema.recordings.id, version.recordingId));
    await db
      .update(schema.recordingEditVersions)
      .set({
        status: "accepted",
        reviewedAt: now,
        reviewedBy: reviewer,
        updatedAt: now,
      })
      .where(eq(schema.recordingEditVersions.id, args.id));

    await writeAppState("refresh-signal", { ts: Date.now() });
    return {
      id: args.id,
      status: "accepted",
      applied: true,
      supersededVersionId: supersededId,
    };
  },
});
