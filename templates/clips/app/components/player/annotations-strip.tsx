import { useActionMutation, useT } from "@agent-native/core/client";
import { IconBookmark, IconX } from "@tabler/icons-react";

import { formatTimecode } from "@/lib/timecodes";

import { useRecordingAnnotations } from "./use-recording-annotations";

const KIND_STYLES: Record<string, string> = {
  "editor-note": "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "b-roll": "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  retake: "bg-red-500/15 text-red-600 dark:text-red-400",
};

/**
 * Compact review strip for a recording's annotations — the markers dropped
 * with recorder hotkeys plus any added later. Renders nothing when the
 * recording has no annotations. Full marker editing lands with the timeline
 * layer (M3); this strip covers review: see, seek, remove.
 */
export function AnnotationsStrip({
  recordingId,
  canEdit,
  currentUserEmail,
  onSeek,
}: {
  recordingId: string;
  canEdit: boolean;
  currentUserEmail?: string | null;
  onSeek: (ms: number) => void;
}) {
  const t = useT();
  const { annotations, refetch } = useRecordingAnnotations(recordingId);
  const deleteAnnotation = useActionMutation("delete-annotation" as any);

  if (annotations.length === 0) return null;

  const kindLabel = (kind: string) => {
    switch (kind) {
      case "editor-note":
        return t("annotationsStrip.editorNote");
      case "b-roll":
        return t("annotationsStrip.bRoll");
      case "retake":
        return t("annotationsStrip.retake");
      case "generic":
        return t("annotationsStrip.marker");
      default:
        return kind;
    }
  };

  return (
    <div className="mb-3 shrink-0 rounded-lg border bg-muted/30 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-medium text-muted-foreground">
        <IconBookmark className="h-3.5 w-3.5" />
        {t("annotationsStrip.title", { count: annotations.length })}
      </div>
      <ul className="max-h-36 space-y-0.5 overflow-y-auto">
        {annotations.map((a) => {
          const mayDelete =
            canEdit ||
            (!!currentUserEmail &&
              !!a.authorEmail &&
              currentUserEmail.toLowerCase() === a.authorEmail.toLowerCase());
          return (
            <li
              key={a.id}
              className="group flex items-center gap-2 rounded-md px-1 py-0.5 text-xs hover:bg-muted/60"
            >
              {a.startMs !== null ? (
                <button
                  type="button"
                  onClick={() => onSeek(a.startMs ?? 0)}
                  className="shrink-0 font-mono tabular-nums text-primary hover:underline"
                >
                  {formatTimecode(a.startMs)}
                  {a.endMs !== null ? `–${formatTimecode(a.endMs)}` : ""}
                </button>
              ) : (
                <span className="shrink-0 font-mono text-muted-foreground">
                  {t("annotationsStrip.wholeVideo")}
                </span>
              )}
              <span
                className={
                  "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium " +
                  (KIND_STYLES[a.kind] ?? "bg-muted text-muted-foreground")
                }
              >
                {kindLabel(a.kind)}
              </span>
              <span className="min-w-0 flex-1 truncate text-foreground/80">
                {a.label ?? a.body ?? ""}
              </span>
              {mayDelete && (
                <button
                  type="button"
                  onClick={() =>
                    deleteAnnotation.mutate(
                      { id: a.id } as any,
                      {
                        onSettled: () => refetch(),
                      } as any,
                    )
                  }
                  aria-label={t("annotationsStrip.delete")}
                  className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                >
                  <IconX className="h-3 w-3" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
