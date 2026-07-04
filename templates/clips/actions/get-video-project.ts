/**
 * Get one video project including its serialized editor state and any pending
 * recording imports. The full editor route loads projects through this.
 *
 * Usage:
 *   pnpm action get-video-project --id=<projectId>
 */

import { defineAction } from "@agent-native/core";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Get a video project by id, including its serialized editor state (tracks/items/assets JSON), pending recording imports, and source recording ids.",
  schema: z.object({
    id: z.string().describe("Video project id"),
  }),
  http: { method: "GET" },
  link: ({ args }) => ({
    url: `/video-projects/${(args as { id: string }).id}`,
    label: "Open video project",
  }),
  run: async (args) => {
    await assertAccess("video-project", args.id, "viewer");

    const db = getDb();
    const [project] = await db
      .select()
      .from(schema.videoProjects)
      .where(eq(schema.videoProjects.id, args.id));

    if (!project || project.trashedAt) {
      throw new Error(`Video project not found: ${args.id}`);
    }

    return {
      id: project.id,
      title: project.title,
      stateJson: project.stateJson,
      pendingImportsJson: project.pendingImportsJson,
      sourceRecordingIds: project.sourceRecordingIds,
      visibility: project.visibility,
      ownerEmail: project.ownerEmail,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    };
  },
});
