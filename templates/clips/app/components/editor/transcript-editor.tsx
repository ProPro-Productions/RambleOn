import { useT } from "@agent-native/core/client";
import {
  IconArrowBackUp,
  IconBookmark,
  IconBookmarks,
  IconScissors,
} from "@tabler/icons-react";
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
import {
  formatMs,
  getExcludedRanges,
  isExcluded,
  type EditsJson,
} from "@/lib/timestamp-mapping";
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
  /** Restores (un-ignores) an excluded range — Descript's Restore. */
  onRestoreRange?: (range: { startMs: number; endMs: number }) => void;
  /** Adds a point marker at a position (selection start). */
  onAddMarkerAt?: (ms: number) => void;
  className?: string;
}

interface Selection {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * A silence gap this long between segments starts a new paragraph — the
 * transcript must read like a real document, never one text blob.
 */
const PARAGRAPH_PAUSE_MS = 1_400;

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
  onRestoreRange,
  onAddMarkerAt,
  className,
}: TranscriptEditorProps) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [toolbarPos, setToolbarPos] = useState<{ x: number; y: number } | null>(
    null,
  );

  const clearSelection = () => {
    setSelection(null);
    setToolbarPos(null);
    onSelectionChange?.(null);
    window.getSelection()?.removeAllRanges();
  };

  const selectionTouchesExcluded = useMemo(() => {
    if (!selection) return false;
    return getExcludedRanges(edits).some(
      (r) => r.startMs < selection.endMs && r.endMs > selection.startMs,
    );
  }, [selection, edits]);

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
    if (sel && rootRef.current) {
      const domSel = window.getSelection();
      const rect =
        domSel && domSel.rangeCount > 0
          ? domSel.getRangeAt(0).getBoundingClientRect()
          : null;
      const rootRect = rootRef.current.getBoundingClientRect();
      if (rect && rect.width > 0) {
        setToolbarPos({
          x: rect.left - rootRect.left + rect.width / 2,
          y: rect.top - rootRect.top + rootRef.current.scrollTop,
        });
      }
    } else {
      setToolbarPos(null);
    }
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
    let paragraph: React.ReactNode[] = [];
    const paragraphs: React.ReactNode[] = [];
    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      paragraphs.push(
        <p key={`para-${paragraphs.length}`} className="mb-3">
          {paragraph}
        </p>,
      );
      paragraph = [];
    };
    const pushMarkersBefore = (ms: number) => {
      while (
        markerIndex < markers.length &&
        markers[markerIndex].startMs < ms
      ) {
        const m = markers[markerIndex++];
        paragraph.push(
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
    let prevEndMs: number | null = null;
    segments.forEach((s, i) => {
      if (prevEndMs !== null && s.startMs - prevEndMs > PARAGRAPH_PAUSE_MS) {
        flushParagraph();
      }
      prevEndMs = s.endMs;
      pushMarkersBefore(s.endMs);
      const excluded = isExcluded(s.startMs, edits);
      const active = currentMs >= s.startMs && currentMs < s.endMs;
      paragraph.push(
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
    flushParagraph();
    return paragraphs;
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
      </div>

      <div
        ref={rootRef}
        onMouseUp={handleMouseUp}
        onKeyDown={handleKeyDown}
        tabIndex={0}
        className="relative flex-1 overflow-auto p-3 text-[14px] leading-relaxed outline-none"
      >
        {selection && toolbarPos ? (
          <div
            className="absolute z-20 flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-md"
            style={{ left: toolbarPos.x, top: Math.max(0, toolbarPos.y - 6) }}
            onMouseUp={(e) => e.stopPropagation()}
          >
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => {
                onTrimRange?.({
                  startMs: selection.startMs,
                  endMs: selection.endMs,
                });
                clearSelection();
              }}
            >
              <IconScissors className="me-1 h-3.5 w-3.5" />
              {t("transcriptEditor.ignore")}
            </Button>
            {selectionTouchesExcluded && onRestoreRange ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  onRestoreRange({
                    startMs: selection.startMs,
                    endMs: selection.endMs,
                  });
                  clearSelection();
                }}
              >
                <IconArrowBackUp className="me-1 h-3.5 w-3.5" />
                {t("transcriptEditor.restore")}
              </Button>
            ) : null}
            {onCreateSection ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  onCreateSection({
                    startMs: selection.startMs,
                    endMs: selection.endMs,
                  });
                  clearSelection();
                }}
              >
                <IconBookmark className="me-1 h-3.5 w-3.5" />
                {t("transcriptEditor.createSection")}
              </Button>
            ) : null}
            {onAddMarkerAt ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => {
                  onAddMarkerAt(selection.startMs);
                  clearSelection();
                }}
              >
                <IconBookmarks className="me-1 h-3.5 w-3.5" />
                {t("transcriptEditor.addMarker")}
              </Button>
            ) : null}
          </div>
        ) : null}
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
