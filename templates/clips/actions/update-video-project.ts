/**
 * Update a video project: rename it, persist the editor state (autosave /
 * Cmd+S), and/or clear consumed pending imports.
 *
 * Usage:
 *   pnpm action update-video-project --id=<projectId> --title="New name"
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "Update a video project. Pass title to rename, stateJson to persist the full editor state (the serialized tracks/items/assets document — always write the complete document, never a fragment), and/or clearPendingImports once queued imports were materialised.",
  schema: z.object({
    id: z.string().describe("Video project id"),
    title: z.string().min(1).max(300).optional().describe("New title"),
    stateJson: z
      .string()
      .optional()
      .describe("Serialized editor UndoableState JSON (complete document)"),
    clearPendingImports: z.coerce
      .boolean()
      .optional()
      .describe("Clear the pending imports queue"),
  }),
  run: async (args) => {
    await assertAccess("video-project", args.id, "editor");

    if (args.stateJson !== undefined) {
      try {
        JSON.parse(args.stateJson);
      } catch {
        throw new Error("stateJson is not valid JSON");
      }
    }

    const db = getDb();
    const updates: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
    };
    if (args.title !== undefined) updates.title = args.title.trim();
    if (args.stateJson !== undefined) updates.stateJson = args.stateJson;
    if (args.clearPendingImports) updates.pendingImportsJson = "[]";

    const [updated] = await db
      .update(schema.videoProjects)
      .set(updates)
      .where(eq(schema.videoProjects.id, args.id))
      .returning({
        id: schema.videoProjects.id,
        title: schema.videoProjects.title,
        updatedAt: schema.videoProjects.updatedAt,
      });

    if (!updated) {
      throw new Error(`Video project not found: ${args.id}`);
    }

    await writeAppState("refresh-signal", { ts: Date.now() });

    return updated;
  },
});
