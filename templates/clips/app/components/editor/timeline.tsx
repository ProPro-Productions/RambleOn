import { useMemo } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatMs } from "@/lib/timestamp-mapping";
import { cn } from "@/lib/utils";

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

// Same kind → color language as the player scrubber (scrubber.tsx).
const ANNOTATION_COLORS: Record<string, string> = {
  "editor-note": "bg-blue-400",
  "b-roll": "bg-purple-400",
  retake: "bg-red-400",
};

function annotationColor(kind: string): string {
  return ANNOTATION_COLORS[kind] ?? "bg-amber-400";
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
  className?: string;
}

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
  className,
}: TimelineProps) {
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

  return (
    <div className={cn("relative", className)}>
      {/* Ruler */}
      <div
        className="relative border-b border-border bg-card/40 cursor-pointer"
        style={{ width, height: RULER_HEIGHT }}
        onClick={handleSeek}
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
            <div
              key={`split-${i}-${ms}`}
              className="absolute top-0 h-full w-px"
              style={{ left: x, background: "rgba(244,63,94,0.8)" }}
              title={`Split @ ${formatMs(ms)}`}
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
                  annotationColor(a.kind),
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onClickAnnotation?.(a);
                  }}
                  className={cn(
                    "absolute -top-1 flex -translate-x-1/2 flex-col items-center",
                    a.resolved && "opacity-40",
                  )}
                  style={{ left: x, height: RULER_HEIGHT + 4 }}
                >
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full border border-black/30 transition-transform hover:scale-125",
                      annotationColor(a.kind),
                    )}
                  />
                  <span
                    className={cn("w-0.5 flex-1", annotationColor(a.kind))}
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
}
