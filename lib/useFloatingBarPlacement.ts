"use client";

import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";

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
}: {
  barRef: RefObject<HTMLElement | null>;
  /** The rect the bar hangs off, read fresh on every placement. */
  getAnchorRect: () => DOMRect | null;
  /** Something whose own size changes should re-place the bar (a field that
      wraps onto a second row moves everything under it). */
  observe?: Element | null;
  active: boolean;
}) {
  const place = useCallback(() => {
    const bar = barRef.current;
    const anchor = bar ? getAnchorRect() : null;
    if (!bar || !anchor) return;
    const self = bar.getBoundingClientRect();
    const viewport = window.visualViewport;
    const viewTop = viewport?.offsetTop ?? 0;
    const viewLeft = viewport?.offsetLeft ?? 0;
    const viewHeight = viewport?.height ?? window.innerHeight;
    const viewWidth = viewport?.width ?? window.innerWidth;

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
  }, [barRef, getAnchorRect]);

  // Before paint, so the bar is never seen at the top-left corner it renders at.
  useLayoutEffect(place);

  useEffect(() => {
    if (!active) return;
    // `capture` because the deck scrolls, not the window — a bubbling listener
    // on `window` never hears it.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    const observer = observe ? new ResizeObserver(place) : null;
    if (observe && observer) observer.observe(observe);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      observer?.disconnect();
    };
  }, [active, observe, place]);
}
