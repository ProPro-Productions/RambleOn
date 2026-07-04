/**
 * Move a video project to trash (soft delete). Source recordings are never
 * touched — a project only references them.
 *
 * Usage:
 *   pnpm action delete-video-project --id=<projectId>
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Move a video project to trash. The recordings and assets it references are not deleted.",
  schema: z.object({
    id: z.string().describe("Video project id"),
  }),
  run: async (args) => {
    await assertAccess("video-project", args.id, "admin");

    const db = getDb();
    const [updated] = await db
      .update(schema.videoProjects)
      .set({
        trashedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.videoProjects.id, args.id))
      .returning({ id: schema.videoProjects.id });

    if (!updated) {
      throw new Error(`Video project not found: ${args.id}`);
    }

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { id: args.id, trashed: true };
  },
});
