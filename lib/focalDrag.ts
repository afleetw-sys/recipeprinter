import type { PointerEvent as ReactPointerEvent } from "react";

/** A CSS object-position focal point, in percent (0–100 on each axis). */
export interface FocalPoint {
  x: number;
  y: number;
}

/**
 * Drag-to-reposition for a full-bleed `object-fit: cover` photo. Grab the photo
 * and drag: the crop follows the pointer (dragging right reveals more of the
 * left), reported back as an object-position focal point the caller persists.
 *
 * Distances are read from the element's on-screen bounding rect, so the mapping
 * stays correct even though the print deck renders each page transform-scaled —
 * a full-width drag sweeps the full focal range regardless of zoom. Movement is
 * tracked on `window` (not the element) so the drag survives the pointer briefly
 * leaving the photo.
 */
export function startFocalDrag(
  event: ReactPointerEvent<HTMLElement>,
  start: FocalPoint,
  onChange: (point: FocalPoint) => void,
): void {
  const target = event.currentTarget;
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  event.preventDefault();
  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startX = start.x;
  const startY = start.y;
  const clamp = (value: number) => Math.max(0, Math.min(100, value));

  function handleMove(moveEvent: globalThis.PointerEvent) {
    const dx = ((moveEvent.clientX - startClientX) / rect.width) * 100;
    const dy = ((moveEvent.clientY - startClientY) / rect.height) * 100;
    onChange({ x: clamp(startX - dx), y: clamp(startY - dy) });
  }

  function handleUp() {
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleUp);
  }

  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  window.addEventListener("pointercancel", handleUp);
}
