/**
 * Single source of truth for annotation-kind presentation. Every timeline
 * surface (player scrubber, clips editor ruler, full-editor overlay, review
 * strip) renders markers from this map so the design language cannot drift —
 * the clips editor and the full editor must stay visually cohesive even
 * though they come from different codebases.
 */

export interface AnnotationKindStyle {
  /** Solid fill for needles/bands (Tailwind class). */
  bg: string;
  /** Chip style for lists/strips (Tailwind classes). */
  chip: string;
  /** i18n key for the kind's display name (annotationsStrip.*). */
  labelKey: string;
}

const KIND_STYLES: Record<string, AnnotationKindStyle> = {
  generic: {
    bg: "bg-amber-400",
    chip: "bg-muted text-muted-foreground",
    labelKey: "annotationsStrip.marker",
  },
  "editor-note": {
    bg: "bg-blue-400",
    chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    labelKey: "annotationsStrip.editorNote",
  },
  "b-roll": {
    bg: "bg-purple-400",
    chip: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    labelKey: "annotationsStrip.bRoll",
  },
  retake: {
    bg: "bg-red-400",
    chip: "bg-red-500/15 text-red-600 dark:text-red-400",
    labelKey: "annotationsStrip.retake",
  },
};

/** Canonical kind order for pickers and menus. */
export const ANNOTATION_KIND_ORDER = [
  "generic",
  "editor-note",
  "b-roll",
  "retake",
] as const;

export function annotationKindStyle(kind: string): AnnotationKindStyle {
  return KIND_STYLES[kind] ?? KIND_STYLES.generic;
}

/** Needle/band fill class for a kind. */
export function annotationColorClass(kind: string): string {
  return annotationKindStyle(kind).bg;
}

/** Chip classes for a kind (lists, strips). */
export function annotationChipClass(kind: string): string {
  return annotationKindStyle(kind).chip;
}

/**
 * Display name for a kind given a `t` function; custom kinds fall back to
 * the raw kebab-case kind.
 */
export function annotationKindLabel(
  kind: string,
  t: (key: string) => string,
): string {
  const style = KIND_STYLES[kind];
  return style ? t(style.labelKey) : kind;
}
