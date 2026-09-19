/**
 * Where a pinch on the print deck lands.
 *
 * Pulled out of `useDeckScroller` because it is the whole feel of the gesture
 * and it was unreachable: the hook runs it inside a `requestAnimationFrame`
 * callback behind a non-passive wheel listener, which no test and no hidden
 * browser tab can drive. Here it is an ordinary function, and the hook is left
 * holding only the plumbing.
 */

/** How fast a pinch travels. Tuned so one comfortable trackpad gesture covers
    about a quarter of the range rather than all of it. */
export const ZOOM_WHEEL_SENSITIVITY = 0.006;

/**
 * Where a wheel delta moves the zoom.
 *
 * Multiplicative, so the same finger movement covers the same proportion at
 * every zoom level — additive steps feel fast when zoomed out and glacial when
 * zoomed in. `deltaY` follows the wheel convention: negative is pinch-open.
 *
 * Unrounded, and it lands wherever it lands. Quantizing to whole percents put
 * a floor under how fine the gesture could be, and snapping the result to the
 * menu's presets made a pinch stop being a pinch: it held at 100% while the
 * fingers kept moving, then let go all at once. The +/- control and the menu
 * are how you ask for a preset. A trackpad is how you ask for a value.
 *
 * A delta that produces a non-finite zoom leaves the zoom where it was. No
 * trackpad sends one; a synthetic event can, and moving the deck to Infinity
 * is not a better failure than not moving it.
 */
export function zoomFromWheel(
  current: number,
  deltaY: number,
  range: { min: number; max: number },
): number {
  const next = current * Math.exp(-deltaY * ZOOM_WHEEL_SENSITIVITY);
  if (!Number.isFinite(next)) return current;
  return Math.min(range.max, Math.max(range.min, next));
}

/**
 * How far a finger pinch can take the deck on a phone.
 *
 * Its own range rather than the +/- control's. The desktop zoom tops out at 2x
 * the fit, which on a laptop is a page at about real size. A phone's fit is a
 * letter page squeezed into ~300 points, so 2x of that is still small print —
 * and the whole point of pinching there is to read it. The floor is fit: below
 * it the page would only shrink inside a filmstrip that is already sized to it.
 */
export const TOUCH_ZOOM_RANGE = { min: 1, max: 4 };

/**
 * Where two fingers put the zoom.
 *
 * The ratio of how far apart they are now to how far apart they started, applied
 * to the zoom they started at. Anchored on the START of the gesture rather than
 * accumulated frame to frame, so fingers that return to where they began return
 * the page to where it was — an accumulating gesture drifts, and a pinch has no
 * business ending somewhere the fingers do not.
 *
 * A degenerate start (fingers on the same point) leaves the zoom where it was
 * instead of dividing by zero.
 */
export function zoomFromPinch(
  startZoom: number,
  startDistance: number,
  distance: number,
  range: { min: number; max: number },
): number {
  if (!(startDistance > 0) || !Number.isFinite(distance)) return startZoom;
  const next = startZoom * (distance / startDistance);
  if (!Number.isFinite(next)) return startZoom;
  return Math.min(range.max, Math.max(range.min, next));
}

/**
 * How big the bars that float over the text are at a given deck zoom.
 *
 * The two of them (formatting, and delete-these-lines) sit ON the words rather
 * than beside the page, and they are drawn outside the deck's transform so app
 * chrome is never rendered at print scale. That left them one fixed size while
 * the card grew under them — and someone who zooms because they cannot read
 * the card at 100% is being handed smaller controls precisely when they need
 * bigger ones. Whatever it looks like, that is the wrong way round.
 *
 * So they grow, but nothing like as fast as the card. Tracking the zoom one
 * for one put a 56px slab over the recipe at the top of the range, which is a
 * bar that has stopped being chrome and become furniture. A fifth of the
 * zoom's growth is enough for the bar to read as coming with you: over the
 * deck's whole range it goes from 28px to 34, gaining a little at every step
 * rather than jumping and then stopping.
 *
 * 34 is also under the 36px page toolbar parked above the card. The bar that
 * acts on one line stays the smaller of the two, whatever the zoom.
 *
 * Downward it does nothing. Zooming out to see the whole page is not a request
 * for a smaller button, and 22px is already as small as these should get.
 */
export const TEXT_BAR_MAX_SCALE = 1.2;
/** How much of the zoom's growth the bar takes on. */
const TEXT_BAR_TRACKING = 0.2;

export function textBarScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 1) return 1;
  return Math.min(TEXT_BAR_MAX_SCALE, 1 + (zoom - 1) * TEXT_BAR_TRACKING);
}
