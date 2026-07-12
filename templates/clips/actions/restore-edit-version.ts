/**
 * Restore a past edit version — bring a superseded snapshot, a rejected
 * proposal, or an older accepted cut back as the recording's live edits.
 * Owner/admin only, and non-destructive like accepting: the edits being
 * replaced are archived automatically as a `superseded` version first.
 *
 * Proposed versions are not restorable — review them with
 * review-edit-version instead.
 *
 * Usage:
 *   pnpm action restore-edit-version --id=<versionId>
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
    "Restore a past edit version (superseded, rejected, or accepted) as the recording's live edits. Owner/admin only. The current edits are archived as a 'superseded' version first, so restoring is never destructive. Proposed versions must go through review-edit-version instead.",
  schema: z.object({
    id: z.string().describe("Edit version ID"),
  }),
  run: async (args) => {
    const db = getDb();
    const [version] = await db
      .select()
      .from(schema.recordingEditVersions)
      .where(eq(schema.recordingEditVersions.id, args.id))
      .limit(1);
    if (!version) throw new Error(`Edit version not found: ${args.id}`);
    if (version.status === "proposed") {
      throw new Error(
        "Proposed versions are reviewed, not restored — use review-edit-version.",
      );
    }

    const access = await resolveAccess("recording", version.recordingId);
    const role = String(access?.role ?? "");
    if (role !== "owner" && role !== "admin") {
      throw new Error("Only the recording owner can restore edit versions.");
    }
    const reviewer = getRequestUserEmail() ?? null;
    const now = new Date().toISOString();

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

    const previous = recording.editsJson ?? "";
    if (previous === version.editsJson) {
      return { id: args.id, status: version.status, applied: false };
    }

    // Same guarantee as accepting: never lose the edits being replaced.
    let supersededId: string | null = null;
    if (previous.trim()) {
      supersededId = nanoid();
      await db.insert(schema.recordingEditVersions).values({
        id: supersededId,
        recordingId: version.recordingId,
        organizationId: recording.organizationId,
        title: `Edits before restoring "${version.title}"`,
        note: "Automatic snapshot taken when a past version was restored.",
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
