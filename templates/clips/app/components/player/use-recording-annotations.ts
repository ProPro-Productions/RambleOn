import { useActionQuery } from "@agent-native/core/client";

/** One row from list-annotations (annotations only, comments excluded). */
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
  resolved: boolean;
}

/**
 * The one query for a recording's annotations on the player page. Every
 * consumer (review strip, scrubber markers) must use the same args so React
 * Query dedupes them into a single fetch/cache entry.
 */
export function useRecordingAnnotations(recordingId: string) {
  const query = useActionQuery(
    "list-annotations" as any,
    { recordingId, includeComments: false } as any,
  ) as {
    data?: { annotations?: RecordingAnnotation[] };
    refetch: () => void;
  };
  return {
    annotations: query.data?.annotations ?? [],
    refetch: query.refetch,
  };
}
