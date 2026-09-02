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
