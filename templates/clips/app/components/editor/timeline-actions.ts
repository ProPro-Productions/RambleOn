import {
  ANNOTATION_KIND_ORDER,
  annotationKindLabel,
} from "@/lib/annotation-kinds";

/**
 * The single registry of timeline actions for the clips editor.
 *
 * Both the toolbar's context-aware Actions dropdown and the timeline's
 * right-click menu render from this list, so the two surfaces always offer
 * the same operations for a given position/selection — the dropdown and the
 * context menu are two doors to one room. Availability is expressed as
 * `disabled` (kept visible so users learn what exists) except where an
 * action is meaningless entirely.
 */

export interface TimelineActionItem {
  id: string;
  label: string;
  /** Marker-kind id when the item creates an annotation (for color dots). */
  markerKind?: string;
  disabled?: boolean;
  destructive?: boolean;
  run: () => void;
}

export interface TimelineActionsInput {
  /** The position the actions operate on (playhead or right-clicked time). */
  atMs: number;
  durationMs: number;
  selectionRange?: { startMs: number; endMs: number } | null;
  t: (key: string, params?: Record<string, unknown>) => string;
  formatTime: (ms: number) => string;
  handlers: {
    splitAt: (ms: number) => void;
    trimRange: (startMs: number, endMs: number) => void;
    addMarker: (ms: number, kind: string) => void;
  };
}

export function buildTimelineActions(
  input: TimelineActionsInput,
): TimelineActionItem[] {
  const { atMs, durationMs, selectionRange, t, formatTime, handlers } = input;
  const at = Math.round(atMs);
  const time = formatTime(at);

  const items: TimelineActionItem[] = [
    {
      id: "split",
      label: t("editorToolbar.splitAtTime", { time }),
      disabled: at <= 0 || at >= durationMs,
      run: () => handlers.splitAt(at),
    },
    {
      id: "trim-selection",
      label: t("editorToolbar.cutSelection"),
      disabled: !selectionRange,
      destructive: true,
      run: () => {
        if (!selectionRange) return;
        handlers.trimRange(
          Math.round(selectionRange.startMs),
          Math.round(selectionRange.endMs),
        );
      },
    },
    {
      id: "trim-start",
      label: t("editorToolbar.cutStartToTime", { time }),
      disabled: at < 500,
      destructive: true,
      run: () => handlers.trimRange(0, at),
    },
    {
      id: "trim-end",
      label: t("editorToolbar.cutTimeToEnd", { time }),
      disabled: durationMs - at < 500,
      destructive: true,
      run: () => handlers.trimRange(at, Math.round(durationMs)),
    },
  ];

  for (const kind of ANNOTATION_KIND_ORDER) {
    items.push({
      id: `marker-${kind}`,
      label: t("annotationsStrip.addKindAt", {
        kind: annotationKindLabel(kind, t),
        time,
      }),
      markerKind: kind,
      run: () => handlers.addMarker(at, kind),
    });
  }

  return items;
}
