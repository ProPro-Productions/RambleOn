/**
 * Descript's split glyph — a playhead line between two facing brackets
 * ("[|]"). Tabler has no equivalent, so this is a hand-drawn icon in
 * Tabler's own style (24px grid, stroke 2, round caps) so it sits next to
 * Tabler icons without looking foreign.
 */
export function IconSplitSegment({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3v18" />
      <path d="M8 6H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h1" />
      <path d="M16 6h1a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-1" />
    </svg>
  );
}
