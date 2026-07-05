import { useT } from "@agent-native/core/client";
import { IconBookmark, IconScissors } from "@tabler/icons-react";
import { useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  annotationColorClass,
  annotationKindLabel,
} from "@/lib/annotation-kinds";
import { formatMs, isExcluded, type EditsJson } from "@/lib/timestamp-mapping";
import { cn } from "@/lib/utils";

export interface TranscriptAnnotation {
  id: string;
  startMs: number;
  endMs: number | null;
  kind: string;
  label: string | null;
  body: string | null;
  resolved: boolean;
}

export interface TranscriptSegment {
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptEditorProps {
  segments: TranscriptSegment[];
  edits: EditsJson;
  currentMs: number;
  /** Timestamp markers rendered inline in the text at their spoken position. */
  annotations?: TranscriptAnnotation[];
  onSeek?: (originalMs: number) => void;
  /**
   * Fires with an (original) ms range when the user trims a selection — the
   * parent should call `trim-recording` with it.
   */
  onTrimRange?: (range: { startMs: number; endMs: number }) => void;
  /**
   * Mirrors the text selection onto the timeline (Descript scenes): fires
   * with the resolved ms range on select, null when cleared.
   */
  onSelectionChange?: (
    range: { startMs: number; endMs: number } | null,
  ) => void;
  /** Creates a section annotation from the selected range. */
  onCreateSection?: (range: { startMs: number; endMs: number }) => void;
  className?: string;
}

interface Selection {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Transcript viewer with selection-to-trim support.
 *
 * Users select text → press Delete (or the "Trim selection" button) → we
 * resolve the selected text's timestamp range via `segmentsJson` and call
 * `onTrimRange` with it. Segments that fall inside an excluded range render
 * with strikethrough.
 */
export function TranscriptEditor({
  segments,
  edits,
  currentMs,
  annotations = [],
  onSeek,
  onTrimRange,
  onSelectionChange,
  onCreateSection,
  className,
}: TranscriptEditorProps) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  // For each segment we add a data-start-ms attribute so we can resolve the
  // browser's text Selection back to original timestamps.
  const resolveSelection = (): Selection | null => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const root = rootRef.current;
    if (!root) return null;
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return null;

    const startEl = findSegmentElement(range.startContainer);
    const endEl = findSegmentElement(range.endContainer);
    if (!startEl || !endEl) return null;
    const startMs = Number(startEl.dataset.startMs ?? 0);
    const endMs = Number(endEl.dataset.endMs ?? 0);
    if (!isFinite(startMs) || !isFinite(endMs) || endMs <= startMs) return null;
    return { startMs, endMs, text: sel.toString() };
  };

  const handleMouseUp = () => {
    const sel = resolveSelection();
    setSelection(sel);
    onSelectionChange?.(
      sel ? { startMs: sel.startMs, endMs: sel.endMs } : null,
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      selection &&
      onTrimRange
    ) {
      e.preventDefault();
      onTrimRange({ startMs: selection.startMs, endMs: selection.endMs });
      setSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  };

  const rendered = useMemo(() => {
    // Point markers slot inline before the first segment they precede — the
    // spoken words around a marker ARE its context, so it lives in the text.
    const markers = annotations
      .filter((a) => a.endMs === null)
      .sort((a, b) => a.startMs - b.startMs);
    let markerIndex = 0;
    const out: React.ReactNode[] = [];
    const pushMarkersBefore = (ms: number) => {
      while (
        markerIndex < markers.length &&
        markers[markerIndex].startMs < ms
      ) {
        const m = markers[markerIndex++];
        out.push(
          <Tooltip key={`marker-${m.id}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeek?.(m.startMs);
                }}
                className={cn(
                  "mx-0.5 inline-block h-2.5 w-2.5 -translate-y-px cursor-pointer rounded-full border border-black/30 align-middle transition-transform hover:scale-125",
                  annotationColorClass(m.kind),
                  m.resolved && "opacity-40",
                )}
              />
            </TooltipTrigger>
            <TooltipContent>
              {`${annotationKindLabel(m.kind, t)}${(m.label ?? m.body) ? `: ${(m.label ?? m.body ?? "").slice(0, 60)}` : ""} · ${formatMs(m.startMs)}`}
            </TooltipContent>
          </Tooltip>,
        );
      }
    };
    segments.forEach((s, i) => {
      pushMarkersBefore(s.endMs);
      const excluded = isExcluded(s.startMs, edits);
      const active = currentMs >= s.startMs && currentMs < s.endMs;
      out.push(
        <Tooltip key={`${s.startMs}-${i}`}>
          <TooltipTrigger asChild>
            <span
              data-start-ms={s.startMs}
              data-end-ms={s.endMs}
              onClick={() => onSeek?.(s.startMs)}
              className={cn(
                "inline cursor-pointer px-0.5 rounded",
                active && "bg-primary/20 text-foreground",
                excluded && "line-through text-muted-foreground/70",
              )}
            >
              {s.text.trim()}{" "}
            </span>
          </TooltipTrigger>
          <TooltipContent>{`${formatMs(s.startMs)} – ${formatMs(s.endMs)}`}</TooltipContent>
        </Tooltip>,
      );
    });
    pushMarkersBefore(Number.POSITIVE_INFINITY);
    return out;
  }, [segments, edits, currentMs, onSeek, annotations, t]);

  return (
    <div className={cn("flex flex-col h-full min-h-0", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <div>
          {t("transcriptEditor.transcript")}{" "}
          {selection ? (
            <span className="text-foreground">
              {t("transcriptEditor.selectionRange", {
                start: formatMs(selection.startMs),
                end: formatMs(selection.endMs),
              })}
            </span>
          ) : (
            <span>{t("transcriptEditor.selectTextToTrim")}</span>
          )}
        </div>
        {selection ? (
          <div className="flex items-center gap-1.5">
            {onCreateSection ? (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onCreateSection({
                    startMs: selection.startMs,
                    endMs: selection.endMs,
                  });
                  setSelection(null);
                  onSelectionChange?.(null);
                  window.getSelection()?.removeAllRanges();
                }}
              >
                <IconBookmark className="mr-1 h-3.5 w-3.5" />
                {t("transcriptEditor.createSection")}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                onTrimRange?.({
                  startMs: selection.startMs,
                  endMs: selection.endMs,
                });
                setSelection(null);
                onSelectionChange?.(null);
                window.getSelection()?.removeAllRanges();
              }}
            >
              <IconScissors className="mr-1 h-3.5 w-3.5" />
              {t("transcriptEditor.cutSelection")}
            </Button>
          </div>
        ) : null}
      </div>

      <div
        ref={rootRef}
        onMouseUp={handleMouseUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="flex-1 overflow-auto p-3 text-[14px] leading-relaxed outline-none"
      >
        {segments.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            {t("transcriptEditor.noTranscript")}
          </div>
        ) : (
          rendered
        )}
      </div>
    </div>
  );
}

function findSegmentElement(node: Node | null): HTMLElement | null {
  let el: Node | null = node;
  while (el && el.nodeType !== 1) el = el.parentNode;
  while (el && el instanceof HTMLElement) {
    if (el.dataset && el.dataset.startMs != null) return el;
    el = el.parentNode;
  }
  return null;
}
