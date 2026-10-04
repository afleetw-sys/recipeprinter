"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RAIL_KEY_STEP, clampRailWidth, type RailWidthMode } from "@/lib/railWidth";

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
 */
export function RailResizer({
  mode,
  width,
  onCommit,
  onReset,
}: {
  mode: RailWidthMode;
  /** The stored width for this mode, if the cook has set one. */
  width: number | undefined;
  onCommit: (mode: RailWidthMode, width: number) => void;
  onReset: (mode: RailWidthMode) => void;
}) {
  const side = mode === "settings" ? "right" : "left";
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ shell: HTMLElement; other: number; last: number } | null>(null);

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
    drag.current = { shell, other: otherWidth, last: ownWidth };
    shell.classList.add("recipe-print-shell--rail-resizing");
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const rect = current.shell.getBoundingClientRect();
    const next = clampRailWidth(side === "left" ? event.clientX - rect.left : rect.right - event.clientX, mode, {
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
