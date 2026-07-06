import { useT } from "@agent-native/core/client";
import { useMemo, useState } from "react";

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ANNOTATION_KIND_ORDER,
  annotationColorClass,
  annotationKindLabel,
} from "@/lib/annotation-kinds";
import { formatMs } from "@/lib/timestamp-mapping";
import { cn } from "@/lib/utils";

import { CoordinateMenu } from "./coordinate-menu";
import type { TimelineActionItem } from "./timeline-actions";

export interface TimelineChapter {
  startMs: number;
  title: string;
}

export interface TimelineAnnotation {
  id: string;
  startMs: number;
  endMs: number | null;
  kind: string;
  label: string | null;
  body: string | null;
  resolved: boolean;
}

export interface TimelineProps {
  width: number;
  durationMs: number;
  /** Current playhead in original ms. */
  playheadMs: number;
  chapters?: TimelineChapter[];
  annotations?: TimelineAnnotation[];
  excludedRanges?: Array<{ startMs: number; endMs: number }>;
  splitPoints?: number[];
  scrollLeft?: number;
  onSeek?: (originalMs: number) => void;
  onClickChapter?: (chapter: TimelineChapter) => void;
  onClickAnnotation?: (annotation: TimelineAnnotation) => void;
  /** Enables the right-click menu (same actions as the player scrubber). */
  onAddAnnotationAt?: (ms: number, kind: string) => void;
  onToggleAnnotationResolved?: (annotation: TimelineAnnotation) => void;
  onChangeAnnotationKind?: (
    annotation: TimelineAnnotation,
    kind: string,
  ) => void;
  onDeleteAnnotation?: (annotation: TimelineAnnotation) => void;
  /** Registry-built edit actions (split/trim) for a right-clicked position. */
  getEditActions?: (ms: number) => TimelineActionItem[];
  /** Removes the split at a position — splits are selectable entities. */
  onRemoveSplit?: (ms: number) => void;
  className?: string;
}

type TimelineMenuTarget =
  | { type: "ruler"; ms: number }
  | { type: "annotation"; annotation: TimelineAnnotation }
  | { type: "split"; ms: number };

const RULER_HEIGHT = 26;

const getBrandColor = () => {
  if (typeof window === "undefined") return "#0f172a";
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary")
    .trim();
  return v ? `hsl(${v})` : "#0f172a";
};

/** Timestamp ruler + playhead + chapter markers + excluded overlays. */
export function Timeline({
  width,
  durationMs,
  playheadMs,
  chapters = [],
  annotations = [],
  excludedRanges = [],
  splitPoints = [],
  scrollLeft = 0,
  onSeek,
  onClickChapter,
  onClickAnnotation,
  onAddAnnotationAt,
  onToggleAnnotationResolved,
  onChangeAnnotationKind,
  onDeleteAnnotation,
  getEditActions,
  onRemoveSplit,
  className,
}: TimelineProps) {
  const t = useT();
  const [menuTarget, setMenuTarget] = useState<TimelineMenuTarget | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const menuEnabled = Boolean(
    onAddAnnotationAt ||
    onToggleAnnotationResolved ||
    onDeleteAnnotation ||
    getEditActions,
  );
  const ticks = useMemo(() => {
    if (durationMs <= 0) return [];
    // Target ~1 tick per 100px at the current zoom, rounded to a human interval.
    const targetTickCount = Math.max(4, Math.floor(width / 100));
    const rawInterval = durationMs / targetTickCount;
    const niceIntervals = [
      500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000,
      600_000, 1_800_000, 3_600_000,
    ];
    const interval =
      niceIntervals.find((i) => i >= rawInterval) ??
      niceIntervals[niceIntervals.length - 1];
    const out: Array<{ ms: number; label: string }> = [];
    for (let t = 0; t <= durationMs; t += interval) {
      out.push({ ms: t, label: formatMs(t) });
    }
    return out;
  }, [durationMs, width]);

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left + scrollLeft;
    const ms = Math.max(0, Math.min(durationMs, (x / width) * durationMs));
    onSeek(ms);
  };

  const playheadX = (playheadMs / Math.max(durationMs, 1)) * width;

  const body = (
    <div className={cn("relative", className)}>
      {/* Ruler */}
      <div
        className="relative border-b border-border bg-card/40 cursor-pointer"
        style={{ width, height: RULER_HEIGHT }}
        onClick={handleSeek}
        onContextMenu={(e) => {
          if (!menuEnabled) return;
          e.preventDefault();
          // Needles set their own target (and stop propagation); the empty
          // ruler is the fallback. A right-click while the menu is open just
          // moves it: the controlled CoordinateMenu re-anchors to the new
          // coordinates instead of only dismissing.
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left + scrollLeft;
          const ms = Math.max(
            0,
            Math.min(durationMs, (x / width) * durationMs),
          );
          setMenuPos({ x: e.clientX, y: e.clientY });
          setMenuTarget({ type: "ruler", ms });
        }}
      >
        {ticks.map((t) => {
          const x = (t.ms / Math.max(durationMs, 1)) * width;
          return (
            <div
              key={t.ms}
              className="absolute top-0 h-full flex items-end text-[10px] text-muted-foreground font-mono select-none"
              style={{ left: x }}
            >
              <div
                className="w-px bg-border"
                style={{ height: RULER_HEIGHT - 10 }}
              />
              <span className="ml-1 mb-[2px]">{t.label}</span>
            </div>
          );
        })}

        {/* Split markers */}
        {splitPoints.map((ms, i) => {
          const x = (ms / Math.max(durationMs, 1)) * width;
          return (
            <button
              key={`split-${i}-${ms}`}
              type="button"
              data-annotation-marker
              className="absolute top-0 h-full w-[5px] -translate-x-1/2 cursor-pointer before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-rose-500/80 hover:before:w-[3px]"
              style={{ left: x }}
              title={`Split @ ${formatMs(ms)}`}
              onClick={(e) => {
                e.stopPropagation();
                onSeek?.(ms);
              }}
              onContextMenu={(e) => {
                if (!menuEnabled) return;
                e.preventDefault();
                e.stopPropagation();
                setMenuPos({ x: e.clientX, y: e.clientY });
                setMenuTarget({ type: "split", ms });
              }}
            />
          );
        })}

        {/* Excluded overlays */}
        {excludedRanges.map((r, i) => {
          const xStart = (r.startMs / Math.max(durationMs, 1)) * width;
          const xEnd = (r.endMs / Math.max(durationMs, 1)) * width;
          return (
            <div
              key={`ex-${i}`}
              className="absolute top-0 h-full pointer-events-none"
              style={{
                left: xStart,
                width: Math.max(1, xEnd - xStart),
                background:
                  "repeating-linear-gradient(-45deg, rgba(15,23,42,0.55) 0 4px, rgba(15,23,42,0.25) 4px 8px)",
              }}
            />
          );
        })}

        {/* Annotation sections (range bands) */}
        {annotations
          .filter((a) => a.endMs !== null)
          .map((a) => {
            const xStart = (a.startMs / Math.max(durationMs, 1)) * width;
            const xEnd =
              (Math.min(durationMs, a.endMs ?? 0) / Math.max(durationMs, 1)) *
              width;
            return (
              <div
                key={`ann-section-${a.id}`}
                className={cn(
                  "absolute top-0 h-full pointer-events-none opacity-30",
                  annotationColorClass(a.kind),
                  a.resolved && "opacity-10",
                )}
                style={{ left: xStart, width: Math.max(1, xEnd - xStart) }}
              />
            );
          })}

        {/* Annotation needles — same language as the player scrubber */}
        {annotations.map((a) => {
          const x = (a.startMs / Math.max(durationMs, 1)) * width;
          const text = a.label ?? a.body ?? "";
          return (
            <Tooltip key={`ann-${a.id}`}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-annotation-marker
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickAnnotation?.(a);
                  }}
                  onContextMenu={(e) => {
                    if (!menuEnabled) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setMenuPos({ x: e.clientX, y: e.clientY });
                    setMenuTarget({ type: "annotation", annotation: a });
                  }}
                  className={cn(
                    "absolute top-0 flex -translate-x-1/2 flex-col items-center",
                    a.resolved && "opacity-40",
                  )}
                  style={{ left: x, height: RULER_HEIGHT }}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full border border-black/30 transition-transform hover:scale-125",
                      annotationColorClass(a.kind),
                    )}
                  />
                  <span
                    className={cn("w-0.5 flex-1", annotationColorClass(a.kind))}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {`${a.kind}${text ? `: ${text.slice(0, 80)}` : ""} · ${formatMs(a.startMs)}`}
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{
            left: playheadX - 1,
            width: 2,
            background: getBrandColor(),
          }}
        >
          <div
            className="absolute top-0 -left-[3px] w-2 h-2 rounded-full"
            style={{ background: getBrandColor() }}
          />
        </div>
      </div>

      {/* Chapter markers row */}
      {chapters.length > 0 && (
        <div
          className="relative h-5 border-b border-border bg-card/30"
          style={{ width }}
        >
          {chapters.map((c, i) => {
            const x = (c.startMs / Math.max(durationMs, 1)) * width;
            return (
              <Tooltip key={`ch-${i}-${c.startMs}`}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onClickChapter?.(c)}
                    className="absolute top-0 h-full px-2 text-[10px] text-foreground/80 hover:bg-foreground/10 flex items-center border-l border-border"
                    style={{ left: x, maxWidth: 140 }}
                  >
                    <span className="truncate">{c.title}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{`${c.title} · ${formatMs(c.startMs)}`}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      )}
    </div>
  );

  if (!menuEnabled) return body;

  return (
    <>
      {body}
      <CoordinateMenu
        open={menuTarget !== null}
        x={menuPos.x}
        y={menuPos.y}
        onOpenChange={(open) => {
          if (!open) setMenuTarget(null);
        }}
      >
        {menuTarget?.type === "ruler" && getEditActions ? (
          <>
            {getEditActions(Math.round(menuTarget.ms))
              .filter((action) => !action.markerKind)
              .map((action) => (
                <DropdownMenuItem
                  key={action.id}
                  disabled={action.disabled}
                  onSelect={() => action.run()}
                  className={
                    action.destructive
                      ? "text-destructive focus:text-destructive"
                      : undefined
                  }
                >
                  {action.label}
                </DropdownMenuItem>
              ))}
            {onAddAnnotationAt ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {menuTarget?.type === "ruler" && onAddAnnotationAt
          ? ANNOTATION_KIND_ORDER.map((kind) => (
              <DropdownMenuItem
                key={kind}
                onSelect={() =>
                  onAddAnnotationAt(Math.round(menuTarget.ms), kind)
                }
              >
                <span
                  className={cn(
                    "me-2 inline-block h-2 w-2 rounded-full",
                    annotationColorClass(kind),
                  )}
                />
                {t("annotationsStrip.addKindAt", {
                  kind: annotationKindLabel(kind, t),
                  time: formatMs(menuTarget.ms),
                })}
              </DropdownMenuItem>
            ))
          : null}
        {menuTarget?.type === "split" ? (
          <>
            <DropdownMenuItem onSelect={() => onSeek?.(menuTarget.ms)}>
              {t("annotationsStrip.jumpTo", { time: formatMs(menuTarget.ms) })}
            </DropdownMenuItem>
            {onRemoveSplit ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => onRemoveSplit(menuTarget.ms)}
                >
                  {t("editorToolbar.removeSplit")}
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : null}
        {menuTarget?.type === "annotation" ? (
          <>
            <DropdownMenuItem
              onSelect={() => onSeek?.(menuTarget.annotation.startMs)}
            >
              {t("annotationsStrip.jumpTo", {
                time: formatMs(menuTarget.annotation.startMs),
              })}
            </DropdownMenuItem>
            {onChangeAnnotationKind ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {t("annotationsStrip.changeType")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {ANNOTATION_KIND_ORDER.map((kind) => (
                    <DropdownMenuItem
                      key={kind}
                      disabled={kind === menuTarget.annotation.kind}
                      onSelect={() =>
                        onChangeAnnotationKind(menuTarget.annotation, kind)
                      }
                    >
                      <span
                        className={cn(
                          "me-2 inline-block h-2 w-2 rounded-full",
                          annotationColorClass(kind),
                        )}
                      />
                      {annotationKindLabel(kind, t)}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            {onToggleAnnotationResolved || onDeleteAnnotation ? (
              <DropdownMenuSeparator />
            ) : null}
            {onToggleAnnotationResolved ? (
              <DropdownMenuItem
                onSelect={() =>
                  onToggleAnnotationResolved(menuTarget.annotation)
                }
              >
                {menuTarget.annotation.resolved
                  ? t("annotationsStrip.reopen")
                  : t("annotationsStrip.resolve")}
              </DropdownMenuItem>
            ) : null}
            {onDeleteAnnotation ? (
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDeleteAnnotation(menuTarget.annotation)}
              >
                {t("annotationsStrip.delete")}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </CoordinateMenu>
    </>
  );
}
