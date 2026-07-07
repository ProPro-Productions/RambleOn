/**
 * The annotation layer's shared hover surface — used by BOTH the clips
 * editor timeline and the full editor's marker overlay so the two editors
 * stay one product: a marker dot is only half the story, hovering it must
 * reveal everything attached to that timestamp (kind, note text, author,
 * and the comment thread if one is anchored there).
 *
 * Positioning stays with the host (the clips editor works in ms→px, the
 * full editor in frames→px); this module owns grouping and presentation.
 */

import { useT } from "@agent-native/core/client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  annotationChipClass,
  annotationKindLabel,
} from "@/lib/annotation-kinds";
import { cn } from "@/lib/utils";

export interface AnnotationThreadComment {
  id: string;
  authorName: string | null;
  body: string;
}

/** An annotation (or standalone comment) with its attached thread folded in. */
export interface ThreadedAnnotation {
  id: string;
  entity: "annotation" | "comment";
  startMs: number | null;
  endMs: number | null;
  kind: string;
  label: string | null;
  body: string | null;
  authorName?: string | null;
  resolved: boolean;
  comments: AnnotationThreadComment[];
}

interface ListAnnotationsRow {
  entity: "annotation" | "comment";
  id: string;
  startMs: number | null;
  endMs: number | null;
  kind: string;
  label: string | null;
  body: string | null;
  authorName?: string | null;
  resolved: boolean;
  threadId?: string | null;
  parentId?: string | null;
  annotationId?: string | null;
}

/**
 * Folds the flat list-annotations rows into timeline markers: comments
 * attached to a marker/section (annotationId) join that annotation's
 * thread, replies join their thread root, and standalone root comments
 * become their own markers (kind "comment").
 */
export function attachCommentThreads(
  rows: ListAnnotationsRow[],
): ThreadedAnnotation[] {
  const annotations = new Map<string, ThreadedAnnotation>();
  for (const row of rows) {
    if (row.entity !== "annotation") continue;
    annotations.set(row.id, { ...row, comments: [] });
  }

  const commentRows = rows.filter((r) => r.entity === "comment");
  const rootsByThread = new Map<string, ThreadedAnnotation>();
  const standalone: ThreadedAnnotation[] = [];

  // Roots first so replies can find their thread regardless of row order.
  for (const row of commentRows) {
    if (row.parentId) continue;
    const attachedTo = row.annotationId
      ? annotations.get(row.annotationId)
      : undefined;
    if (attachedTo) {
      attachedTo.comments.push({
        id: row.id,
        authorName: row.authorName ?? null,
        body: row.body ?? "",
      });
      if (row.threadId) rootsByThread.set(row.threadId, attachedTo);
      continue;
    }
    const marker: ThreadedAnnotation = { ...row, comments: [] };
    standalone.push(marker);
    if (row.threadId) rootsByThread.set(row.threadId, marker);
  }
  for (const row of commentRows) {
    if (!row.parentId) continue;
    const target =
      (row.threadId ? rootsByThread.get(row.threadId) : undefined) ??
      (row.annotationId ? annotations.get(row.annotationId) : undefined);
    (target?.comments ?? []).push({
      id: row.id,
      authorName: row.authorName ?? null,
      body: row.body ?? "",
    });
  }

  return [...annotations.values(), ...standalone].sort(
    (a, b) => (a.startMs ?? -1) - (b.startMs ?? -1),
  );
}

const MAX_VISIBLE_COMMENTS = 4;

/**
 * Wrap any host-rendered marker needle/dot in the shared hover card. The
 * trigger stays the host's element so click/drag/context-menu wiring is
 * untouched.
 */
export function AnnotationHoverCard({
  marker,
  timeText,
  side = "top",
  children,
}: {
  marker: ThreadedAnnotation;
  /** Preformatted timecode in the host's timebase (recording vs composition). */
  timeText: string;
  side?: "top" | "bottom";
  children: React.ReactNode;
}) {
  const t = useT();
  const overflow = marker.comments.length - MAX_VISIBLE_COMMENTS;
  return (
    <HoverCard openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        sideOffset={10}
        className="w-72 space-y-2 p-3 text-left"
        collisionPadding={8}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-[11px] font-medium",
              annotationChipClass(marker.kind),
            )}
          >
            {annotationKindLabel(marker.kind, t)}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {timeText}
          </span>
          {marker.resolved ? (
            <span className="ml-auto text-[11px] text-muted-foreground">
              {t("annotationsStrip.resolvedChip")}
            </span>
          ) : null}
        </div>
        {marker.label ? (
          <div className="text-sm font-medium leading-snug">{marker.label}</div>
        ) : null}
        {marker.body ? (
          <div className="line-clamp-6 whitespace-pre-wrap text-sm leading-snug text-foreground/90">
            {marker.body}
          </div>
        ) : null}
        {marker.authorName ? (
          <div className="text-[11px] text-muted-foreground">
            {marker.authorName}
          </div>
        ) : null}
        {marker.comments.length > 0 ? (
          <div className="space-y-1.5 border-t border-border pt-2">
            {marker.comments.slice(0, MAX_VISIBLE_COMMENTS).map((c) => (
              <div key={c.id} className="text-sm leading-snug">
                <span className="mr-1.5 text-xs font-medium text-muted-foreground">
                  {c.authorName ?? "·"}
                </span>
                <span className="line-clamp-3 inline">{c.body}</span>
              </div>
            ))}
            {overflow > 0 ? (
              <div className="text-[11px] text-muted-foreground">
                {t("annotationsStrip.moreComments", { count: overflow })}
              </div>
            ) : null}
          </div>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}
