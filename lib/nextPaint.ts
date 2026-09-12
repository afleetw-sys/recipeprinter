"use client";

/**
 * Resolves once the browser has actually drawn a frame — or immediately, where
 * it is never going to draw one.
 *
 * This exists because of a specific and repeatable failure: a button that
 * starts expensive work in its own click handler cannot look pressed. React
 * commits the new state, and then the same unbroken run of the main thread
 * carries on into the work, so the browser is never given the chance to put the
 * pressed state on screen. However the button is styled, what the user sees is
 * a control that did nothing, for as long as the work takes. Awaiting a real
 * frame before starting the work is what buys the feedback, and one frame is
 * the whole cost.
 *
 * Two frames deep on purpose. The first `requestAnimationFrame` callback runs
 * BEFORE the paint it belongs to, so resolving there hands the thread straight
 * back with the update still only committed, not drawn. The second runs after
 * that frame has been presented.
 *
 * ── The hidden-tab trap ──────────────────────────────────────────────────────
 *
 * A background tab DOES NOT RUN `requestAnimationFrame` at all — not throttled,
 * not slowed, simply never. So awaiting a frame there waits forever, and
 * whatever was supposed to happen after the paint never happens. That is not a
 * theoretical edge: the first version of this hung a recipe import on the front
 * door, spinner raised, going nowhere.
 *
 * The obvious repair — race it against a timeout — is worse than it looks,
 * because background tabs also clamp `setTimeout` to one second. A 50ms
 * fallback measured as a 1,049ms delay.
 *
 * So a hidden document returns immediately. The entire point of the wait is to
 * let somebody SEE something, and a tab nobody is looking at has nothing to
 * wait for. Switching tabs while something loads is an ordinary thing to do.
 *
 * The timeout stays for the one case the visibility check cannot cover: a tab
 * hidden AFTER the first frame is requested. Rare, and a second is the worst it
 * can cost, on a page the user is not watching.
 */
export function nextPaint(): Promise<void> {
  if (
    typeof document === "undefined" ||
    typeof requestAnimationFrame !== "function" ||
    document.visibilityState !== "visible"
  ) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    setTimeout(finish, PAINT_FALLBACK_MS);
  });
}

/** Three frames at 60Hz: long enough that a visible tab always wins the race on
    its own, short enough to be no wait at all if it somehow does not. */
const PAINT_FALLBACK_MS = 50;
