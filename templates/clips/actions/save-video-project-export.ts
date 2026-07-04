/**
 * Save a rendered video-project export as a new library recording. The MP4 /
 * WebM was rendered client-side (@remotion/web-renderer) and uploaded through
 * the framework file-upload route; this creates the ready `recordings` row so
 * sharing, embeds, comments, and transcription work on the result.
 *
 * Usage:
 *   pnpm action save-video-project-export --projectId=<id> --videoUrl=<url> --durationMs=12000 --width=1920 --height=1080
 */

import { defineAction } from "@agent-native/core";
import { writeAppState } from "@agent-native/core/application-state";
import { assertAccess } from "@agent-native/core/sharing";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  getCurrentOwnerEmail,
  nanoid,
  requireOrganizationAccess,
} from "../server/lib/recordings.js";

export default defineAction({
  description:
    "Create a ready library recording from a rendered video-project export. videoUrl must already point at uploaded storage (not a data: URL). Returns the new recording id; open it at /r/:id.",
  schema: z.object({
    projectId: z.string().describe("Source video project id"),
    videoUrl: z.string().describe("Uploaded video URL (storage provider)"),
    durationMs: z.coerce.number().int().min(0).describe("Duration in ms"),
    width: z.coerce.number().int().min(0).default(0).optional(),
    height: z.coerce.number().int().min(0).default(0).optional(),
    sizeBytes: z.coerce.number().int().min(0).default(0).optional(),
    format: z.enum(["mp4", "webm"]).default("mp4").optional(),
    title: z
      .string()
      .optional()
      .describe("Recording title (defaults to the project title)"),
  }),
  link: ({ result }) => {
    const id = (result as { id?: unknown } | null)?.id;
    if (typeof id !== "string") return null;
    return { url: `/r/${id}`, label: "Open exported recording" };
  },
  run: async (args) => {
    if (args.videoUrl.startsWith("data:")) {
      throw new Error(
        "Exports must be uploaded to Builder.io or S3-compatible storage before saving to the library.",
      );
    }

    await assertAccess("video-project", args.projectId, "viewer");

    const db = getDb();
    const [project] = await db
      .select({
        id: schema.videoProjects.id,
        title: schema.videoProjects.title,
        organizationId: schema.videoProjects.organizationId,
      })
      .from(schema.videoProjects)
      .where(eq(schema.videoProjects.id, args.projectId));
    if (!project) {
      throw new Error(`Video project not found: ${args.projectId}`);
    }

    const ownerEmail = getCurrentOwnerEmail();
    const { organizationId } = await requireOrganizationAccess(
      project.organizationId ?? undefined,
    );
    const id = nanoid();
    const now = new Date().toISOString();

    await db.insert(schema.recordings).values({
      id,
      organizationId,
      orgId: organizationId,
      title: args.title?.trim() || project.title,
      status: "ready",
      uploadProgress: 100,
      videoUrl: args.videoUrl,
      videoFormat: args.format ?? "mp4",
      videoSizeBytes: args.sizeBytes ?? 0,
      durationMs: args.durationMs,
      width: args.width ?? 0,
      height: args.height ?? 0,
      hasAudio: true,
      hasCamera: false,
      ownerEmail,
      createdAt: now,
      updatedAt: now,
    });

    await writeAppState("refresh-signal", { ts: Date.now() });

    return {
      id,
      projectId: args.projectId,
      url: `/r/${id}`,
    };
  },
});
