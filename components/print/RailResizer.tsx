"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  ORGANIZE_COLLAPSE_WIDTH,
  ORGANIZE_EXPAND_WIDTH,
  RAIL_KEY_STEP,
  RAIL_MIN_WIDTH,
  clampRailWidth,
  type RailWidthMode,
} from "@/lib/railWidth";

const WIDTH_VAR: Record<RailWidthMode, string> = {
  pages: "--rail-user-w",
  organize: "--organize-rail-user-w",
  settings: "--panel-user-w",
};

const LABEL: Record<RailWidthMode, string> = {
  pages: "Resize pages panel",
  organize: "Resize organizer",
  settings: "Resize settings panel",
};

/**
 * The draggable line between a side panel and the preview: the left rail's
 * right edge, or the settings panel's left edge.
 *
 * A drag writes the width straight onto the shell's CSS variable every move,
 * so the print page (thousands of nodes) does not re-render per pixel; the
 * width is handed to React once, on release. Arrow keys nudge it, and a
 * double-click puts the layout's own width back.
 *
 * The organizer has no squeezed state: drag it (or arrow it) past its minimum
 * and `onCollapse` returns the rail to the page thumbnails. Drag the page rail
 * wide and `onExpand` opens the organizer. Either way the drag ends there and
 * the switch animates on from where the line was let go, not from where the
 * drag started, and the dragged width is dropped, so each mode reopens at the
 * width it had before.
 */
export function RailResizer({
  mode,
  width,
  onCommit,
  onReset,
  onCollapse,
  onExpand,
}: {
  mode: RailWidthMode;
  /** The stored width for this mode, if the cook has set one. */
  width: number | undefined;
  onCommit: (mode: RailWidthMode, width: number) => void;
  onReset: (mode: RailWidthMode) => void;
  /** Organizer only: leave organize mode when dragged past its minimum. */
  onCollapse?: () => void;
  /** Page rail only: enter organize mode when dragged wide. */
  onExpand?: () => void;
}) {
  const side = mode === "settings" ? "right" : "left";
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{
    shell: HTMLElement;
    other: number;
    last: number;
    initial: string;
    expandAt: number;
  } | null>(null);
  const collapses = mode === "organize" && Boolean(onCollapse);
  const expands = mode === "pages" && Boolean(onExpand);

  /** This panel's width and the one across the preview from it. */
  const room = (shell: HTMLElement) => {
    const columns = getComputedStyle(shell).gridTemplateColumns.split(" ").map(parseFloat);
    const rail = columns[0] ?? 0;
    const settings = columns[2] ?? 0;
    return {
      shellWidth: shell.getBoundingClientRect().width,
      ownWidth: side === "left" ? rail : settings,
      otherWidth: side === "left" ? settings : rail,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const shell = event.currentTarget.closest<HTMLElement>(".recipe-print-shell");
    if (!shell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { ownWidth, otherWidth } = room(shell);
    drag.current = {
      shell,
      other: otherWidth,
      last: ownWidth,
      initial: shell.style.getPropertyValue(WIDTH_VAR[mode]),
      // A rail already saved wider than the threshold opens the organizer only
      // when dragged wider still, not on the first pixel of any drag.
      expandAt: Math.max(ORGANIZE_EXPAND_WIDTH, ownWidth + RAIL_KEY_STEP),
    };
    shell.classList.add("recipe-print-shell--rail-resizing");
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const rect = current.shell.getBoundingClientRect();
    const wanted = side === "left" ? event.clientX - rect.left : rect.right - event.clientX;
    const switchTo = collapses && wanted < ORGANIZE_COLLAPSE_WIDTH
      ? onCollapse
      : expands && wanted > current.expandAt
        ? onExpand
        : undefined;
    if (switchTo) {
      drag.current = null;
      current.shell.classList.remove("recipe-print-shell--rail-resizing");
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setDragging(false);
      // Switch first: the animation measures its start from the width on
      // screen now, the dragged one. Only then drop that width. The other mode
      // has taken the rail by now, so putting this mode's width back moves
      // nothing on screen.
      switchTo();
      if (current.initial) current.shell.style.setProperty(WIDTH_VAR[mode], current.initial);
      else current.shell.style.removeProperty(WIDTH_VAR[mode]);
      return;
    }
    const next = clampRailWidth(wanted, mode, {
      shellWidth: rect.width,
      otherWidth: current.other,
    });
    current.last = next;
    current.shell.style.setProperty(WIDTH_VAR[mode], `${next}px`);
  };

  const finish = () => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    current.shell.classList.remove("recipe-print-shell--rail-resizing");
    setDragging(false);
    onCommit(mode, current.last);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const shell = event.currentTarget.closest<HTMLElement>(".recipe-print-shell");
    if (!shell) return;
    event.preventDefault();
    const { shellWidth, ownWidth, otherWidth } = room(shell);
    // The arrow moves the LINE, so on the right-hand panel it is reversed.
    const outward = (event.key === "ArrowRight") === (side === "left");
    const step = outward ? RAIL_KEY_STEP : -RAIL_KEY_STEP;
    // Already at the minimum, one more press inward is the same as dragging past it.
    if (collapses && !outward && ownWidth <= RAIL_MIN_WIDTH[mode] + 0.5) {
      onCollapse?.();
      return;
    }
    if (expands && outward && ownWidth + step > ORGANIZE_EXPAND_WIDTH) {
      onExpand?.();
      return;
    }
    onCommit(mode, clampRailWidth(ownWidth + step, mode, { shellWidth, otherWidth }));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={LABEL[mode]}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      className={`recipe-rail-resizer recipe-rail-resizer--${side} no-print ${dragging ? "is-dragging" : ""}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onReset(mode)}
    />
  );
}
