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
