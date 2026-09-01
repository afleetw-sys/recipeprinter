/**
 * Zoom for a full-bleed `object-fit: cover` photo, as a scale about the focal
 * point the cook has already dragged to (see lib/focalDrag.ts).
 *
 * There is deliberately no zooming OUT past 1. The photo's job on a full-page
 * spread is to cover the sheet edge to edge; anything under a 1.0 scale would
 * pull the picture off the bleed and print paper down the sides, which is never
 * what "smaller" means here. Zooming out therefore means returning toward the
 * cover fit, and 1 is the floor.
 */
export const IMAGE_ZOOM_MIN = 1;
export const IMAGE_ZOOM_MAX = 3;
/** One press of the +/- control. A quarter turn is a visible change without
    making the buttons feel like they barely do anything. */
export const IMAGE_ZOOM_STEP = 0.25;

/** The steps the control's percentage offers, matching the deck's own menu.
    1 is the cover fit and the floor (see above), so it is annotated rather
    than being one more number in a list. */
export const IMAGE_ZOOM_STEPS = [1, 1.5, 2, 2.5, 3] as const;

export function clampImageZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return IMAGE_ZOOM_MIN;
  return Math.min(IMAGE_ZOOM_MAX, Math.max(IMAGE_ZOOM_MIN, zoom));
}

/**
 * The zoom a pinch (or ctrl/⌘ + wheel) lands on. Multiplicative rather than
 * additive so a pinch feels the same at every zoom level — the same gesture
 * covers the same proportion of the range whether you are at 1.1× or 2.5×.
 * `deltaY` follows the wheel convention: negative = pinch open = zoom in.
 */
export function zoomByWheel(current: number, deltaY: number): number {
  return clampImageZoom(current * Math.exp(-deltaY / 220));
}

/** Rounded for display: "150%". */
export function formatImageZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
