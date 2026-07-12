import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * A context menu anchored to arbitrary screen coordinates, fully controlled.
 *
 * Radix's ContextMenu owns its open state and anchor internally, which makes
 * "right-click a second marker while the menu is open" unfixable from the
 * outside — the open menu swallows or dismisses the event and never
 * re-anchors. This wraps a controlled DropdownMenu around an invisible
 * fixed-position anchor instead: callers own `open` and the coordinates, so
 * a second right-click simply updates them and the menu moves. Used by every
 * timeline surface (clips editor, player scrubber) so context menus behave
 * identically app-wide.
 */
export function CoordinateMenu({
  open,
  x,
  y,
  onOpenChange,
  children,
}: {
  open: boolean;
  x: number;
  y: number;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    // Keyed by coordinates: floating-ui only re-measures anchors on
    // scroll/resize, not on style-driven moves, so a right-click at a new
    // position must remount the menu to re-anchor there.
    <DropdownMenu
      key={`${x},${y}`}
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden
          style={{
            position: "fixed",
            left: x,
            top: y,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={2}
        // The anchor moves between right-clicks; don't animate from the old
        // position or steal focus from the timeline.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
