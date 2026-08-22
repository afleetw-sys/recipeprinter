/**
 * The "invert" half of a FLIP: the transform that puts an element back where it
 * used to be, so animating to `none` carries it to where it now is.
 *
 * Pulled out as a pure function because the interesting part is arithmetic that
 * is easy to get subtly wrong — a sign flipped, or width and height divided the
 * wrong way round — and impossible to eyeball afterwards, since a wrong answer
 * still animates, just from the wrong place. Everything around it (measuring,
 * `element.animate`) needs a browser; this doesn't.
 *
 * Assumes `transform-origin: top left`. With the default centre origin the
 * translation would also have to account for how scaling moves the midpoint,
 * which is exactly the kind of correction that goes unnoticed until a large
 * element flies in visibly offset.
 */

export interface FlipRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Returns null when either rectangle has no area — an element that is
 * `display: none` (the page rail below 820px), not laid out yet, or measured
 * while the tab was hidden. Callers skip the animation entirely on null rather
 * than dividing by zero and flinging something off screen.
 */
export function flipTransform(from: FlipRect | null, to: FlipRect | null): string | null {
  if (!from || !to) return null;
  if (from.width <= 0 || from.height <= 0 || to.width <= 0 || to.height <= 0) return null;

  const dx = from.left - to.left;
  const dy = from.top - to.top;
  const sx = from.width / to.width;
  const sy = from.height / to.height;

  // Already in place and the same size: nothing to animate.
  if (dx === 0 && dy === 0 && sx === 1 && sy === 1) return null;

  return `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
}
