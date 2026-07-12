/**
 * Fetch one edit version including its full editsJson, plus the recording's
 * current editsJson so a reviewer (human or agent) can diff the proposal
 * against what is live.
 *
 * Usage:
 *   pnpm action get-edit-version --id=<versionId>
 */

import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Get one edit version with its full proposed editsJson and the recording's current editsJson for comparison.",
  schema: z.object({
    id: z.string().describe("Edit version ID"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async (args) => {
    const db = getDb();
    const [version] = await db
      .select()
      .from(schema.recordingEditVersions)
      .where(eq(schema.recordingEditVersions.id, args.id))
      .limit(1);
    if (!version) throw new Error(`Edit version not found: ${args.id}`);

    await assertAccess("recording", version.recordingId, "viewer");

    const [recording] = await db
      .select({ editsJson: schema.recordings.editsJson })
      .from(schema.recordings)
      .where(eq(schema.recordings.id, version.recordingId))
      .limit(1);

    return {
      version,
      currentEditsJson: recording?.editsJson ?? "",
    };
  },
});
