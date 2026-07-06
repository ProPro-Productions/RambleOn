import { useActionQuery } from "@agent-native/core/client";
import { useMemo } from "react";

import {
  attachCommentThreads,
  type ThreadedAnnotation,
} from "@/components/timeline/annotation-hover";

/** One row from list-annotations (annotations and mapped comments). */
export interface RecordingAnnotation {
  entity: "annotation" | "comment";
  id: string;
  anchorType: "video" | "point" | "range";
  startMs: number | null;
  endMs: number | null;
  kind: string;
  label: string | null;
  body: string | null;
  authorEmail: string | null;
  authorName?: string | null;
  resolved: boolean;
  threadId?: string | null;
  parentId?: string | null;
  annotationId?: string | null;
}

/**
 * The one query for a recording's annotations on the player page. Every
 * consumer (review strip, scrubber markers, editor timeline) must use the
 * same args so React Query dedupes them into a single fetch/cache entry.
 *
 * `annotations` keeps the historical shape (annotation entities only);
 * `threaded` is the annotation layer's view — comments folded into the
 * marker they're attached to, standalone comments as their own markers.
 */
export function useRecordingAnnotations(recordingId: string) {
  const query = useActionQuery(
    "list-annotations" as any,
    { recordingId, includeComments: true } as any,
  ) as {
    data?: { annotations?: RecordingAnnotation[] };
    refetch: () => void;
  };
  const rows = query.data?.annotations;
  const annotations = useMemo(
    () => (rows ?? []).filter((r) => r.entity === "annotation"),
    [rows],
  );
  const threaded: ThreadedAnnotation[] = useMemo(
    () => attachCommentThreads(rows ?? []),
    [rows],
  );
  return { annotations, threaded, refetch: query.refetch };
}
