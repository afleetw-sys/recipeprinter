"use client";

import { useEffect, useRef } from "react";
import { backDismissAction, isOwnOverlayEntry, overlayHistoryState } from "@/lib/overlayHistory";

/** Distinguishes our history entries from each other when dialogs nest. */
let overlayCounter = 0;

/**
 * Makes the device Back gesture close an overlay instead of leaving the page.
 *
 * On a phone or tablet, Back IS the close gesture — it is what a thumb reaches
 * for, and there is no Escape key to reach for instead. An overlay that owns no
 * history entry silently lets that press through to the router, so "close this
 * sheet" navigates off the page underneath it.
 *
 * On /print that is expensive rather than merely surprising: leaving lands on
 * the home page, which files the project and starts clean by design (see the
 * mount effect in PrinterWorkspace). So a Back meant to dismiss a dialog reads
 * as the recipes having been deleted. Two session replays on 2026-09-09 show
 * cooks leaving /print with no click recorded at all and re-importing on the
 * empty home page they landed on; one of them re-pasted the same URL.
 *
 * The fix is the standard one: an overlay that can be dismissed pushes a
 * history entry while it is open, so the first Back pops that entry instead of
 * the page. RevenueCat's checkout already does exactly this for itself
 * (`history.pushState({checkoutOpen: true})` plus a `popstate` listener, as
 * long as we don't pass `htmlTarget` — we don't), which is what makes it the
 * right shape to match rather than invent.
 *
 * Deliberately NOT a URL change. These are dialogs, not routes: the address bar
 * has nothing useful to say about "the delete confirm is open", a shareable
 * /print?dialog=confirm link would be a promise we can't keep across reloads,
 * and pushing the same URL keeps Next's router on the route it is already on.
 * The existing state object is spread rather than replaced so the App Router's
 * own internals ride along untouched.
 */
export function useBackDismiss(
  open: boolean,
  onClose: () => void,
  options: { closeDisabled?: boolean } = {},
) {
  const { closeDisabled = false } = options;

  // Same latest-ref pattern as `useModalFocus`, and for the same reason:
  // callers pass a fresh `onClose` arrow every render, and depending on its
  // identity would tear down and re-push the history entry on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeDisabledRef = useRef(closeDisabled);
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return;

    const id = ++overlayCounter;
    const push = () => window.history.pushState(overlayHistoryState(window.history.state, id), "");
    push();

    // Whether OUR entry is already gone, which decides who has to clean it up.
    let popped = false;

    function onPopState() {
      if (backDismissAction({ closeDisabled: closeDisabledRef.current }) === "reassert") {
        push();
        return;
      }
      popped = true;
      onCloseRef.current();
    }

    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      // Closed by any other means — Escape, the X, the backdrop, or the parent
      // simply unmounting it — leaves our entry on the stack for us to pop.
      // `isOwnOverlayEntry` is what keeps that from undoing a navigation the
      // dialog itself started; see lib/overlayHistory.
      if (!popped && isOwnOverlayEntry(window.history.state, id)) window.history.back();
    };
  }, [open]);
}
