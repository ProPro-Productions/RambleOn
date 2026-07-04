/**
 * Create a new (empty) video project for the full multi-track editor.
 *
 * Usage:
 *   pnpm action create-video-project --title="Launch video"
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  getCurrentOwnerEmail,
  nanoid,
  requireOrganizationAccess,
} from "../server/lib/recordings.js";

export default defineAction({
  description:
    "Create a new empty video project (full multi-track editor). Returns the project id; open it at /video-projects/:id. To start a project from an existing recording, prefer add-recording-to-video-project.",
  schema: z.object({
    title: z.string().optional().describe("Project title"),
    organizationId: z
      .string()
      .optional()
      .describe("Workspace/organization id (defaults to the active one)"),
  }),
  link: ({ result }) => {
    const id = (result as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return null;
    return { url: `/video-projects/${id}`, label: "Open video project" };
  },
  run: async (args) => {
    const db = getDb();
    const ownerEmail = getCurrentOwnerEmail();
    const { organizationId } = await requireOrganizationAccess(
      args.organizationId,
    );
    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(schema.videoProjects).values({
      id,
      organizationId,
      orgId: organizationId,
      title: args.title?.trim() || "Untitled project",
      ownerEmail,
      createdAt: now,
      updatedAt: now,
    });

    await writeAppState("refresh-signal", { ts: Date.now() });

    return { id, title: args.title?.trim() || "Untitled project" };
  },
});
