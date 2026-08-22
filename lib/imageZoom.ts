/**
 * Zoom for a full-bleed `object-fit: cover` photo, as a scale about the focal
 * point the cook has already dragged to (see lib/focalDrag.ts).
 *
 * 1 is the cover fit: the photo filling the page, cropped on whichever axis is
 * too long. Above 1 magnifies into it. Below 1 backs out of that crop toward
 * seeing the WHOLE photo — which is only meaningful when cover was cropping in
 * the first place, and only down to the point where the whole picture is
 * visible. So the floor is a property of the photo, not a constant: a picture
 * shaped like the page has nothing to back out of and cannot zoom out at all,
 * while a wide landscape on a tall page has a great deal.
 */
export const IMAGE_ZOOM_MAX = 3;
/** The cover fit — the photo filling the page, cropped to do it. */
export const IMAGE_ZOOM_FIT = 1;
/** However lopsided the photo, never shrink it to a stamp in the middle of the
    page; past this there is no framing decision left to make. */
export const IMAGE_ZOOM_FLOOR = 0.25;
/** Below this much overshoot, `cover` is only shaving a sliver off a photo that
    is essentially the page's own shape. There is no framing decision in it —
    nothing worth dragging through, and nothing worth backing out to — so both
    affordances treat it as an exact fit. */
export const IMAGE_CROP_TOLERANCE = 1.015;
/** One press of the +/- control. A quarter turn is a visible change without
    making the buttons feel like they barely do anything. */
export const IMAGE_ZOOM_STEP = 0.25;

/**
 * How far THIS photo can zoom out, given how much `cover` is cropping it.
 *
 * `cropRatio` is the factor by which cover has to overshoot the frame to fill
 * it — 1 for a photo shaped exactly like the page, 1.5 for one that has to be
 * blown up 50% past fit. Backing that out exactly is `1 / cropRatio`, at which
 * point the whole photo is visible (the `contain` fit) and the page shows paper
 * on the two short sides.
 */
export function minZoomFor(cropRatio: number | undefined): number {
  if (!cropRatio || !Number.isFinite(cropRatio)) return IMAGE_ZOOM_FIT;
  if (cropRatio <= IMAGE_CROP_TOLERANCE) return IMAGE_ZOOM_FIT;
  return Math.max(IMAGE_ZOOM_FLOOR, 1 / cropRatio);
}

export function clampImageZoom(zoom: number, min: number = IMAGE_ZOOM_FIT): number {
  const floor = Math.min(min, IMAGE_ZOOM_FIT);
  if (!Number.isFinite(zoom)) return IMAGE_ZOOM_FIT;
  return Math.min(IMAGE_ZOOM_MAX, Math.max(floor, zoom));
}

/**
 * The zoom a pinch (or ctrl/⌘ + wheel) lands on. Multiplicative rather than
 * additive so a pinch feels the same at every zoom level — the same gesture
 * covers the same proportion of the range whether you are at 1.1× or 2.5×.
 * `deltaY` follows the wheel convention: negative = pinch open = zoom in.
 */
export function zoomByWheel(current: number, deltaY: number, min?: number): number {
  return clampImageZoom(current * Math.exp(-deltaY / 220), min);
}

/** Rounded for display: "150%". */
export function formatImageZoom(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}
