/**
 * The two decisions a pinch on the print deck makes.
 *
 * Pulled out of `useDeckScroller` because they are the whole feel of the
 * gesture and they were unreachable: the hook runs them inside a
 * `requestAnimationFrame` callback behind a non-passive wheel listener, which
 * no test and no hidden browser tab can drive. Here they are ordinary
 * functions, and the hook is left holding only the plumbing.
 */

/** How fast a pinch travels. Tuned so one comfortable trackpad gesture crosses
    roughly one preset step rather than the whole range. */
export const ZOOM_WHEEL_SENSITIVITY = 0.006;

/** How close to a preset a FINISHED gesture has to land before it eases onto
    it. The presets are 25 points apart, so 6 gives each one a noticeable pull
    without the gaps between them becoming unreachable. */
export const ZOOM_DETENT = 0.06;

/**
 * Where a wheel delta moves the zoom.
 *
 * Multiplicative, so the same finger movement covers the same proportion at
 * every zoom level — additive steps feel fast when zoomed out and glacial when
 * zoomed in. `deltaY` follows the wheel convention: negative is pinch-open.
 *
 * Deliberately unrounded. Quantizing to whole percents put a floor under how
 * fine the gesture could be, and a floor on a continuous gesture is felt as
 * steps rather than as zoom.
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
 * Where a finished gesture comes to rest.
 *
 * Snapping DURING a pinch is a stutter by construction: the applied zoom holds
 * at 100% while the fingers keep moving, then lets go all at once, and the hand
 * reads the pause as the app failing to keep up. Every canvas tool zooms
 * continuously and reserves snapping for a keystroke. So this runs once, after
 * the fingers stop — landing exactly on 100% is worth keeping, paying for it
 * mid-gesture is not.
 *
 * Returns `raw` unchanged when it finished nowhere near a preset.
 */
export function settleZoom(raw: number, presets: readonly number[] | undefined): number {
  if (!presets || presets.length === 0) return raw;
  const nearest = presets.reduce(
    (best, step) => (Math.abs(step - raw) < Math.abs(best - raw) ? step : best),
    presets[0],
  );
  // The epsilon is floating point, not taste: a gesture ending exactly
  // ZOOM_DETENT away computes as 0.06000000000000005 and would fail to snap.
  return Math.abs(nearest - raw) <= ZOOM_DETENT + 1e-9 ? nearest : raw;
}
