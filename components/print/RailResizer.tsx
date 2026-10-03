"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { RAIL_KEY_STEP, clampRailWidth, type RailWidthMode } from "@/lib/railWidth";

const WIDTH_VAR: Record<RailWidthMode, string> = {
  pages: "--rail-user-w",
  organize: "--organize-rail-user-w",
};

/**
 * The draggable line between the left rail and the preview.
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
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ shell: HTMLElement; left: number; panel: number; last: number } | null>(null);

  const room = (shell: HTMLElement) => {
    const columns = getComputedStyle(shell).gridTemplateColumns.split(" ").map(parseFloat);
    return {
      shellWidth: shell.getBoundingClientRect().width,
      railWidth: columns[0] ?? 0,
      panelWidth: columns[2] ?? 0,
    };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const shell = event.currentTarget.closest<HTMLElement>(".recipe-print-shell");
    if (!shell) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const { railWidth, panelWidth } = room(shell);
    drag.current = { shell, left: shell.getBoundingClientRect().left, panel: panelWidth, last: railWidth };
    shell.classList.add("recipe-print-shell--rail-resizing");
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current) return;
    const next = clampRailWidth(event.clientX - current.left, mode, {
      shellWidth: current.shell.getBoundingClientRect().width,
      panelWidth: current.panel,
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
    const { shellWidth, railWidth, panelWidth } = room(shell);
    const step = event.key === "ArrowRight" ? RAIL_KEY_STEP : -RAIL_KEY_STEP;
    onCommit(mode, clampRailWidth(railWidth + step, mode, { shellWidth, panelWidth }));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={mode === "organize" ? "Resize organizer" : "Resize pages panel"}
      aria-valuenow={width}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      className={`recipe-rail-resizer no-print ${dragging ? "is-dragging" : ""}`}
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
