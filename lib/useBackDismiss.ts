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
 * Pops this module started itself and that have not landed yet.
 *
 * `history.back()` is asynchronous: the popstate it produces arrives a few
 * milliseconds later, by which time whatever else the same click set in motion
 * has already happened. Every overlay listens for popstate and reads it as "the
 * cook pressed Back", so that late arrival gets attributed to the wrong thing —
 * and the wrong thing is usually the overlay that was just opened.
 *
 * Clicking "Sign in and save it" in the "Keep this project?" confirm is the
 * case that shows it: the confirm closes and pops its entry, the sign-in dialog
 * opens 8ms later, the pop lands 4ms after that, and the sign-in dialog reads
 * it as a Back and closes itself. The click looks like it did nothing.
 *
 * So the pops this module starts are counted. They are not Back presses and
 * nothing may treat them as one.
 */
let selfPopsInFlight = 0;

/** Runs once the count reaches zero — see `whenOverlayHistorySettles`. */
const settleWaiters: Array<() => void> = [];

function settle(): void {
  selfPopsInFlight = Math.max(0, selfPopsInFlight - 1);
  if (selfPopsInFlight > 0) return;
  for (const run of settleWaiters.splice(0, settleWaiters.length)) run();
}

/**
 * Drops the entry this overlay pushed, and remembers that the popstate to come
 * is ours.
 *
 * The listener goes on BEFORE `back()`, which puts it ahead of any listener an
 * overlay opened afterwards adds, and behind the listeners of overlays that
 * were already open. That ordering is what the count needs: an outer dialog
 * still on screen sees the flag while it is set and ignores the pop, and the
 * decrement happens after it. The timeout is only there so a popstate that
 * never arrives cannot leave the count stuck above zero and every later Back
 * press ignored.
 */
function popOwnEntry(): void {
  selfPopsInFlight += 1;
  let landed = false;
  const onLanded = () => {
    if (landed) return;
    landed = true;
    window.clearTimeout(timer);
    window.removeEventListener("popstate", onLanded);
    settle();
  };
  window.addEventListener("popstate", onLanded);
  const timer = window.setTimeout(onLanded, OVERLAY_POP_GRACE_MS);
  window.history.back();
}

/** Runs `run` once no pop this module started is still in the air. */
function whenOverlayHistorySettles(run: () => void): void {
  if (selfPopsInFlight === 0) {
    run();
    return;
  }
  settleWaiters.push(run);
}

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

    let cancelled = false;
    let disarm: (() => void) | null = null;

    /**
     * Claim a history entry and start listening on it.
     *
     * Held back while a pop this module started is still in the air, because
     * an overlay that opens in the same breath as another one closing would
     * otherwise push on top of an entry that is about to disappear — and, worse,
     * would have its listener in place to catch the departing overlay's pop and
     * close itself over it. Waiting costs nothing anyone can perceive (the pop
     * lands in single-digit milliseconds) and leaves the stack as if the two had
     * never overlapped: the old entry gone, then ours pushed on top of the page.
     */
    const arm = () => {
      if (cancelled) return;

      const id = ++overlayCounter;
      const push = () => window.history.pushState(overlayHistoryState(window.history.state, id), "");
      push();

      // Whether OUR entry is already gone, which decides who has to clean it up.
      let popped = false;

      function onPopState() {
        // Bookkeeping from an overlay that just closed, not a Back press — see
        // `selfPopsInFlight`. Closing on it would shut an outer dialog the
        // moment an inner one was dismissed.
        if (selfPopsInFlight > 0) return;
        if (backDismissAction({ closeDisabled: closeDisabledRef.current }) === "reassert") {
          push();
          return;
        }
        popped = true;
        onCloseRef.current();
      }

      window.addEventListener("popstate", onPopState);
      disarm = () => {
        window.removeEventListener("popstate", onPopState);
        // Closed by any other means — Escape, the X, the backdrop, or the parent
        // simply unmounting it — leaves our entry on the stack for us to pop.
        // `isOwnOverlayEntry` is what keeps that from undoing a navigation the
        // dialog itself started; see lib/overlayHistory.
        if (!popped && isOwnOverlayEntry(window.history.state, id)) popOwnEntry();
      };
    };

    whenOverlayHistorySettles(arm);

    return () => {
      // Nothing to undo when the overlay closed again before it ever armed:
      // it pushed no entry and registered no listener.
      cancelled = true;
      disarm?.();
    };
  }, [open]);
}
