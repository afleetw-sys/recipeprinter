/**
 * The two decisions behind Back-to-dismiss (see `useBackDismiss`).
 *
 * The hook itself is all browser: pushState, a popstate listener, an effect
 * teardown. None of that is assertable in this suite's node environment, and
 * `vitest.config.ts` keeps it that way on purpose. What IS assertable is the
 * pair of judgements underneath, and they are the half that can regress
 * silently — a wrong answer here doesn't throw, it just eats a Back press or
 * undoes a navigation, both of which only show up in a session replay weeks
 * later. So they live here as pure functions.
 */

/** Marks a history entry as one an overlay pushed, and whose. */
export const OVERLAY_STATE_KEY = "__rpOverlay";

/**
 * The state object to push when an overlay opens.
 *
 * Spreads whatever is already there rather than replacing it: on the App Router
 * that object carries Next's own internals (`__NA`, the private route tree),
 * and a push that drops them leaves the router describing a page it isn't on.
 * The URL deliberately does not change — these are dialogs, not routes.
 */
export function overlayHistoryState(current: unknown, id: number): Record<string, unknown> {
  const base = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  return { ...base, [OVERLAY_STATE_KEY]: id };
}

/**
 * Whether the entry on top of the stack is still the one THIS overlay pushed.
 *
 * Guards the teardown. An overlay that closed by any route other than Back
 * (Escape, the X, the backdrop, the parent unmounting it) has left its entry
 * on the stack, and has to pop it — otherwise the next Back is spent undoing
 * bookkeeping and the cook has to press it twice.
 *
 * But a dialog can also close BECAUSE something inside it navigated: the
 * cookbook-ready dialog's link to /projects, say. The router has replaced the
 * top of the stack by then, so the entry is no longer ours, and popping would
 * undo the navigation the cook just asked for. Checking the id rather than a
 * bare flag is what separates the two: nested dialogs each pushed their own,
 * and only the topmost matches.
 */
export function isOwnOverlayEntry(state: unknown, id: number): boolean {
  if (!state || typeof state !== "object") return false;
  return (state as Record<string, unknown>)[OVERLAY_STATE_KEY] === id;
}

/**
 * What a Back press should do to an open overlay.
 *
 * "reassert" is the `closeDisabled` case — an operation is in flight, which is
 * the same reason Escape is ignored. The entry is already gone by the time
 * popstate fires, so staying open means pushing a replacement; without it the
 * guard is spent and the NEXT press leaves the page mid-save.
 */
export function backDismissAction(options: { closeDisabled: boolean }): "close" | "reassert" {
  return options.closeDisabled ? "reassert" : "close";
}
