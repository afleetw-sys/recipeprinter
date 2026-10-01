"use client";

/**
 * Would `window.print()` called right now, outside a click, be blocked?
 *
 * WebKit (Safari on the Mac, and every browser on iOS) only opens the print
 * sheet straight away when `print()` runs inside the user's own click. Called
 * from anywhere else — after an `await`, a `requestAnimationFrame`, a timer, a
 * React effect — it is "automatic printing", and Safari answers with its own
 * "This webpage is trying to print" / "blocked from automatically printing"
 * alert, or, after a few of those, with nothing at all. That is exactly what a
 * dead Print button that needs three clicks and a reload looks like.
 *
 * Chromium and Firefox print without a gesture, so this is false there and
 * their behavior is unchanged. Where `navigator.userActivation` exists and is
 * still active (a click moments ago), WebKit will take it too.
 */
export function printNeedsLiveGesture(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!isWebKitPrinter()) return false;
  const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } })
    .userActivation;
  return !activation?.isActive;
}

/** Safari on the Mac, or any browser on iOS — WebKit's print engine. */
export function isWebKitPrinter(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (iOS) return true;
  return /Safari/.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Android|Firefox|FxiOS/.test(ua);
}
