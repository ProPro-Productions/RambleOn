/**
 * List video projects (full multi-track editor) the current user can access.
 *
 * Usage:
 *   pnpm action list-video-projects
 */

import { defineAction } from "@agent-native/core";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";
import { accessFilter } from "@agent-native/core/sharing";
import { and, desc, isNull } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getActiveOrganizationId } from "../server/lib/recordings.js";

export default defineAction({
  description:
    "List video projects (multi-source compositions edited in the full editor at /video-projects/:id), newest first. Excludes trashed projects.",
  schema: z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50).optional(),
  }),
  http: { method: "GET" },
  link: () => ({ url: "/video-projects", label: "Open video projects" }),
  run: async (args) => {
    const db = getDb();

    // Resolve the active org explicitly so CLI/agent contexts (which may not
    // carry an org on the request) still see org-stamped projects.
    const accessCtx = {
      userEmail: getRequestUserEmail(),
      orgId: (await getActiveOrganizationId()) ?? undefined,
    };

    const rows = await db
      .select({
        id: schema.videoProjects.id,
        title: schema.videoProjects.title,
        sourceRecordingIds: schema.videoProjects.sourceRecordingIds,
        visibility: schema.videoProjects.visibility,
        ownerEmail: schema.videoProjects.ownerEmail,
        createdAt: schema.videoProjects.createdAt,
        updatedAt: schema.videoProjects.updatedAt,
      })
      .from(schema.videoProjects)
      .where(
        and(
          isNull(schema.videoProjects.trashedAt),
          accessFilter(
            schema.videoProjects,
            schema.videoProjectShares,
            accessCtx,
          ),
        ),
      )
      .orderBy(desc(schema.videoProjects.updatedAt))
      .limit(args.limit ?? 50);

    return {
      projects: rows.map((row) => ({
        ...row,
        sourceRecordingIds: safeParseIds(row.sourceRecordingIds),
      })),
    };
  },
});

function safeParseIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}
