"use client";

import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";
import { readKeyboard } from "@/lib/keyboard";
import { isDeckMobile } from "@/lib/useDeckScroller";

/** How far a bar sits off what it belongs to, and off the viewport edge. */
const GAP = 8;
const MARGIN = 8;

/**
 * Park a fixed-position bar directly above something on the card, or below it
 * when above is taken.
 *
 * Shared by the two bars that follow the text rather than the page: the
 * formatting bar over the field being typed in, and the delete bar over a
 * selection that runs across several lines. Both are drawn at viewport size
 * through a portal, because the card itself is drawn at print scale and app
 * chrome mounted inside it lands at about a third of a legible size.
 *
 * Writes straight to the node rather than through state: this runs on every
 * scroll frame, and the deck is the one surface in the app where a render per
 * frame is measurably expensive.
 */
export function useFloatingBarPlacement({
  barRef,
  getAnchorRect,
  observe,
  active,
  dockAboveKeyboard = false,
}: {
  barRef: RefObject<HTMLElement | null>;
  /** The rect the bar hangs off, read fresh on every placement. */
  getAnchorRect: () => DOMRect | null;
  /** Something whose own size changes should re-place the bar (a field that
      wraps onto a second row moves everything under it). */
  observe?: Element | null;
  active: boolean;
  /** On the phone layout, sit just above the on-screen keyboard instead of
      over the line, and only while the keyboard is up. A bar hanging off a
      line on a phone landed under the cook's thumb or behind the keys, and
      with the keyboard down there is nothing being typed to format. */
  dockAboveKeyboard?: boolean;
}) {
  const place = useCallback(() => {
    const bar = barRef.current;
    const anchor = bar ? getAnchorRect() : null;
    if (!bar || !anchor) return;
    const viewport = window.visualViewport;
    const viewTop = viewport?.offsetTop ?? 0;
    const viewLeft = viewport?.offsetLeft ?? 0;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const viewWidth = viewport?.width ?? window.innerWidth;

    if (dockAboveKeyboard && isDeckMobile()) {
      bar.setAttribute("data-docked", "");
      if (!readKeyboard().open) {
        bar.style.visibility = "hidden";
        return;
      }
      // The bottom of what is visible is the top of the keyboard, whichever
      // way the browser makes room for it (lib/keyboard.ts).
      //
      // Absolute, in page coordinates, not fixed. With the keyboard up, iOS
      // Safari shifts the visible area within the page, and then hit-tests a
      // fixed element as far off as the shift (measured: about 200pt on an
      // iPhone 16 Pro): the bar drawn above the keys ignored taps on itself
      // and took taps meant for the recipe above it. An absolute element is
      // hit-tested where it is drawn. `pageTop` is where the visible area
      // sits on the page, scroll included.
      const docked = bar.getBoundingClientRect();
      const pageTop = viewport?.pageTop ?? window.scrollY + viewTop;
      const pageLeft = viewport?.pageLeft ?? window.scrollX + viewLeft;
      bar.style.position = "absolute";
      bar.style.left = `${pageLeft + Math.max(MARGIN, (viewWidth - docked.width) / 2)}px`;
      bar.style.top = `${pageTop + viewHeight - docked.height - MARGIN}px`;
      bar.style.visibility = "visible";
      return;
    }
    bar.removeAttribute("data-docked");
    bar.style.position = "";

    const self = bar.getBoundingClientRect();

    // Centred on the anchor, then pulled back inside the viewport. Settled
    // before the vertical, because whether the bar clears the page toolbar
    // depends on where it ends up horizontally.
    const left = Math.max(
      viewLeft + MARGIN,
      Math.min(
        anchor.left + anchor.width / 2 - self.width / 2,
        viewLeft + viewWidth - self.width - MARGIN,
      ),
    );

    // The page toolbar is the other floating thing over this card. Landing on
    // top of it is exactly the muddle this split is meant to end, so the bar
    // goes under the anchor instead when the space above belongs to that one.
    const pageBar = document
      .querySelector(".recipe-page-canvas__controls .recipe-page-toolbar")
      ?.getBoundingClientRect();
    const above = anchor.top - self.height - GAP;
    const collides = Boolean(
      pageBar &&
        above < pageBar.bottom + GAP &&
        above + self.height + GAP > pageBar.top &&
        left < pageBar.right + GAP &&
        left + self.width + GAP > pageBar.left,
    );
    const top = above >= viewTop + MARGIN && !collides ? above : anchor.bottom + GAP;

    bar.style.left = `${left}px`;
    bar.style.top = `${Math.max(
      viewTop + MARGIN,
      Math.min(top, viewTop + viewHeight - self.height - MARGIN),
    )}px`;
    bar.style.visibility = "visible";
  }, [barRef, getAnchorRect, dockAboveKeyboard]);

  // Before paint, so the bar is never seen at the top-left corner it renders at.
  useLayoutEffect(place);

  // A docked bar answers a tap on the touch itself. iOS spends the first tap
  // on a button on hover and holds its mouse events back, so every control on
  // the bar above the keyboard took two taps (seen in the simulator: the
  // first tap only drew the pressed look). A finger lifted on a button
  // without moving cancels iOS's own delayed mouse events and presses the
  // button now, as a mouse would (down, up, click), so each tap acts once.
  // A field on the bar (the size box) and a sideways swipe along it are left
  // to the browser.
  useEffect(() => {
    const bar = barRef.current;
    if (!active || !dockAboveKeyboard || !bar) return;
    let start: { x: number; y: number } | null = null;
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      start = event.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY } : null;
    };
    const onMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (start && touch && Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > 8) start = null;
    };
    const onEnd = (event: TouchEvent) => {
      const tapped = start;
      start = null;
      if (!tapped || !bar.hasAttribute("data-docked")) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target || target.closest("input, textarea")) return;
      const button = target.closest<HTMLButtonElement>("button");
      if (!button || !bar.contains(button) || button.disabled) return;
      event.preventDefault();
      const at = { bubbles: true, cancelable: true, clientX: tapped.x, clientY: tapped.y, view: window };
      button.dispatchEvent(new MouseEvent("mousedown", at));
      button.dispatchEvent(new MouseEvent("mouseup", at));
      button.dispatchEvent(new MouseEvent("click", at));
    };
    bar.addEventListener("touchstart", onStart, { passive: true });
    bar.addEventListener("touchmove", onMove, { passive: true });
    bar.addEventListener("touchend", onEnd, { passive: false });
    return () => {
      bar.removeEventListener("touchstart", onStart);
      bar.removeEventListener("touchmove", onMove);
      bar.removeEventListener("touchend", onEnd);
    };
    // `observe` is the field being edited: a new field can come with a new bar.
  }, [active, dockAboveKeyboard, barRef, observe]);

  useEffect(() => {
    if (!active) return;
    // `capture` because the deck scrolls, not the window — a bubbling listener
    // on `window` never hears it.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    // The keyboard can go down with the field still focused (iOS's hide-key),
    // and that is a resize of the visual viewport, handled above; focus
    // moving is the other way it comes and goes.
    document.addEventListener("focusin", place);
    document.addEventListener("focusout", place);
    const observer = observe ? new ResizeObserver(place) : null;
    if (observe && observer) observer.observe(observe);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("focusin", place);
      document.removeEventListener("focusout", place);
      observer?.disconnect();
    };
  }, [active, observe, place]);
}
