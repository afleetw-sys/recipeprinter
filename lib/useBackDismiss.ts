"use client";

import { useEffect, useRef } from "react";
import {
  backDismissAction,
  hasOverlayEntry,
  isOwnOverlayEntry,
  overlayHistoryState,
} from "@/lib/overlayHistory";

/** Distinguishes our history entries from each other when dialogs nest. */
let overlayCounter = 0;

/**
 * How long to wait for the pop before navigating anyway.
 *
 * Only reached when the overlay entry is on top and no pop is coming — a
 * dialog that stays open while something inside it navigates. Nothing is going
 * to cancel the navigation in that case, so going ahead is right; this is the
 * bound that keeps "wait for the pop" from meaning "wait forever".
 */
const OVERLAY_POP_GRACE_MS = 400;

/**
 * Starts a navigation once no overlay's history entry is on top of the stack.
 *
 * The collision this exists for: pressing a button in a dialog that both
 * closes the dialog and navigates. Both happen in one React batch, so the
 * order is fixed and hostile — React commits, the dialog's effect teardown
 * runs `history.back()` to drop the entry it pushed, and only *then* does the
 * router get anywhere. `router.push` is a transition: it has not touched
 * history yet, so `isOwnOverlayEntry` still sees its own entry and pops it,
 * and the popstate that follows makes the App Router re-sync to the URL it is
 * already on — which throws away the pending navigation entirely.
 *
 * The symptom is not a slow navigation, it is no navigation: on /print,
 * "Leave it in this browser" filed the project, cleared the desk and then sat
 * on "Saving your recipes…" forever, because the page it was leaving for never
 * arrived. Clicking the logo again is a no-op (`leavingHome` guards re-entry),
 * so the way out was a manual reload.
 *
 * So navigate on the far side of the pop instead of racing it. The entry on
 * top of the stack answers "is an overlay about to pop out from under me"
 * synchronously, and the popstate its teardown produces is the signal that it
 * is now safe — deterministic, rather than a timeout picked to be longer than
 * the teardown usually takes.
 */
export function navigateAfterOverlayHistory(navigate: () => void): void {
  if (typeof window === "undefined" || !hasOverlayEntry(window.history.state)) {
    navigate();
    return;
  }

  let done = false;
  const run = () => {
    if (done) return;
    done = true;
    window.removeEventListener("popstate", onPop);
    window.clearTimeout(timer);
    navigate();
  };
  // Dialogs nest, and each one pops only its own entry — so a popstate that
  // reveals another overlay's entry underneath means there is still a pop to
  // come. Waiting for the stack to be clear of them rather than for one pop is
  // what makes this right for two overlays as well as one.
  const onPop = () => {
    if (!hasOverlayEntry(window.history.state)) run();
  };
  // The bound, for the case where no pop is coming at all. Navigating is the
  // right answer then: nothing is going to cancel it.
  const timer = window.setTimeout(run, OVERLAY_POP_GRACE_MS);
  window.addEventListener("popstate", onPop);
}

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
