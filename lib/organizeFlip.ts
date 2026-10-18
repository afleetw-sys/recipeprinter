/**
 * How far along the organizer's open/close animation is at a frame, eased
 * (cubic-out). `start` is when the switch happened; `now` is the frame's
 * requestAnimationFrame timestamp, which is the start of the frame and so can
 * be earlier than `start`. That frame is progress 0, not negative: the ease
 * would turn a negative into a jump the wrong way.
 */
export function organizeFlipProgress(now: number, start: number, durationMs: number): number {
  const t = Math.min(1, Math.max(0, (now - start) / durationMs));
  return 1 - Math.pow(1 - t, 3);
}
