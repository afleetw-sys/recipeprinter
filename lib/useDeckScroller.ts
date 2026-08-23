"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PrintCardSize } from "@/components/RecipeCardPrint";

const PREVIEW_SELECTOR = ".recipe-page-scaler";
/** Mirrors `scroll-padding-top` on `.recipe-page-deck` in app/print/print.css.
    Reserves room above every card for its floating controls (front/back flip +
    Edit), which would otherwise tuck behind the sticky top bar. */
const DECK_SCROLL_PADDING_TOP = 72;

/**
 * The element CSS actually snaps for this slide — which differs by mode.
 *
 * A cookbook spread snaps the SLIDE; a recipe card snaps its `.recipe-page-
 * scaler` (see the two `scroll-snap-align: center` rules in print.css). Aiming
 * a programmatic scroll at the wrong one is aiming at a position the browser
 * does not consider a snap point, which it then corrects with a visible jump.
 */
function snapTargetIn(slide: HTMLElement): HTMLElement {
  if (getComputedStyle(slide).scrollSnapAlign !== "none") return slide;
  return slide.querySelector<HTMLElement>(PREVIEW_SELECTOR) ?? slide;
}

/**
 * Where the browser would rest this slide, computed the way CSS scroll-snap
 * computes it: against the SNAPPORT (the scrollport inset by `scroll-padding`),
 * honouring the target's own `scroll-snap-align`.
 *
 * This used to be hand-rolled as `top - max(72, (clientHeight - height) / 2)`,
 * which ignored `scroll-padding-top: 72px` entirely and so landed every card
 * 36px — half the padding — off the real snap point. `scrollDeckTo` suspends
 * snapping for the animation and restores it on `scrollend` on the premise
 * that "we always scroll to a snap point, so restoring moves nothing"; the
 * premise was false, so restoring moved everything by 36px. That correction,
 * arriving just after the scroll appeared to finish, is the overshoot-then-
 * catch glitch. Deriving the target from the same inputs CSS uses makes the
 * premise true instead of approximately true.
 */
function snapScrollTopFor(deck: HTMLElement, slide: HTMLElement): number {
  const target = snapTargetIn(slide);
  const deckStyle = getComputedStyle(deck);
  const padTop = parseFloat(deckStyle.scrollPaddingTop) || 0;
  const padBottom = parseFloat(deckStyle.scrollPaddingBottom) || 0;
  const deckRect = deck.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const top = rect.top - deckRect.top + deck.scrollTop;
  // One value applies to both axes; two are block-then-inline. This deck
  // scrolls in the block axis, so the first value is the one that governs.
  const align = getComputedStyle(target).scrollSnapAlign.split(" ")[0];
  if (align === "start") return top - padTop;
  if (align === "end") return top + rect.height - (deck.clientHeight - padBottom);
  const snapportHeight = deck.clientHeight - padTop - padBottom;
  return top - padTop - (snapportHeight - rect.height) / 2;
}

/**
 * Which way the deck runs, asked of the deck itself.
 *
 * The deck was vertical on desktop and horizontal on small screens, and this
 * used to be re-derived here as `matchMedia("(max-width: 820px)")` — a second
 * copy of a decision the stylesheet had already made. Now that it runs
 * horizontally at every width, reading `flex-direction` keeps the one copy in
 * CSS: change the layout there and the scrolling follows, instead of the two
 * drifting apart and the deck snapping along an axis it no longer scrolls on.
 */
function isHorizontal(deck: HTMLElement): boolean {
  return getComputedStyle(deck).flexDirection === "row";
}

interface UseDeckScrollerOptions {
  activeNavIndex: number;
  setActiveNavIndex: Dispatch<SetStateAction<number>>;
  navItemsLength: number;
  cardSize: PrintCardSize;
  sheetsLength: number;
  continueOnBack: boolean;
  singleRecipePrintView: boolean;
  pageWidth: number;
  pageHeight: number;
}

// One pending "restore snapping" cleanup per deck, so back-to-back programmatic
// scrolls don't pile up listeners/timers.
const pendingSnapRestore = new WeakMap<HTMLElement, () => void>();

function scrollDeckTo(deck: HTMLDivElement, options: ScrollToOptions) {
  if (options.behavior === "smooth") {
    // Mandatory snapping fights a programmatic smooth scroll — it can pull the
    // animation to an intermediate card. So suspend snapping for the duration
    // of the animation and restore it the instant the scroll LANDS (scrollend,
    // with a timeout fallback for browsers without it).
    //
    // Restoring on landing — rather than on the user's next gesture — is what
    // makes mandatory feel like a single snap: we always scroll to the exact
    // rounded centre, which IS a snap point, so re-enabling snapping finds us
    // already snapped and moves nothing. Turning it back on mid-gesture instead
    // is what made mandatory read as a double snap.
    pendingSnapRestore.get(deck)?.();
    deck.style.scrollSnapType = "none";
    let timer = 0;
    const restore = () => {
      deck.style.scrollSnapType = "";
      deck.removeEventListener("scrollend", restore);
      window.clearTimeout(timer);
      pendingSnapRestore.delete(deck);
    };
    pendingSnapRestore.set(deck, restore);
    deck.addEventListener("scrollend", restore, { once: true });
    timer = window.setTimeout(restore, 600);
  }
  deck.scrollTo(options);
}


/**
 * Owns the print page's scrollable deck: which face (front/back) is showing,
 * the scale that fits each page to the viewport, and scrolling to a given
 * slide. Native CSS scroll-snap owns wheel/touch settling; this hook keeps
 * React state in sync and handles explicit nav clicks.
 * `deckRef`/`slideRefs` are returned for the page to attach to the actual
 * deck and slide DOM nodes it renders.
 */
export function useDeckScroller({
  activeNavIndex,
  setActiveNavIndex,
  navItemsLength,
  cardSize,
  sheetsLength,
  continueOnBack,
  singleRecipePrintView,
  pageWidth,
  pageHeight,
}: UseDeckScrollerOptions) {
  const [canvasSide, setCanvasSide] = useState<"front" | "back">("front");
  const [deckScale, setDeckScale] = useState(0.5);
  // The deck element, held two ways on purpose. `deckRef` is what the scrolling
  // helpers below read on demand; `deckNode` is the same element as STATE, so an
  // effect that binds a listener to it re-runs when React hands us a different
  // element.
  //
  // That distinction is load-bearing. The print page unmounts its whole editor
  // behind a loading gate (`items === null || projectLoading || cookbookAccess
  // === "loading"` in app/print/page.tsx) — which a signed-in cook passes
  // through more than once on a refresh, as auth resolves and the saved project
  // and its unlock are fetched. Each pass mounts a NEW deck element, while the
  // things these effects watched (page count, card size) stayed put — so the
  // scroll listener went on living on the discarded element. Scrolling then
  // selected nothing at all, while clicking a page in the rail still worked,
  // because that writes the selection directly. Depending on the node itself is
  // what makes a remount re-bind.
  const deckRef = useRef<HTMLDivElement | null>(null);
  const [deckNode, setDeckNode] = useState<HTMLDivElement | null>(null);
  const attachDeck = useCallback((node: HTMLDivElement | null) => {
    deckRef.current = node;
    setDeckNode(node);
  }, []);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  // While we scroll the deck programmatically (after a click), ignore the
  // scroll-driven selection so it doesn't yank the outline back to whichever
  // page is momentarily centred mid-animation.
  const suppressScrollSyncRef = useRef(false);
  const scrollSyncTimerRef = useRef<number | undefined>(undefined);
  // Content-space center of each slide (top for the vertical desktop deck, left
  // for the horizontal mobile one), cached so the scroll listener can find the
  // closest slide by arithmetic instead of measuring every slide on every
  // frame. Slide positions only change with count / scale / size, never with
  // scroll position, so this is recomputed on those changes (via the dirty
  // flag), not per scroll event — which is what forced a synchronous reflow on
  // every frame of a scroll on large decks.
  const slideCentersRef = useRef<{ top: number; left: number }[]>([]);
  const centersDirtyRef = useRef(true);
  // The deck's total scrollable height when those centers were measured. Any
  // change means the slides moved — pages added, a layout swapped in, art that
  // resized a page — so the cache is stale even though nothing the effects below
  // watch has changed. One property read per scroll event (not per slide) buys
  // a cache that can't silently rot.
  const measuredScrollHeightRef = useRef(0);

  const measureSlideCenters = useCallback(() => {
    const deck = deckRef.current;
    if (!deck) return;
    // The deck swaps its slides for a loading state while a layout is being
    // measured (see `previewMeasuring`). Measuring THEN would cache a center of
    // zero for every slide and clear the dirty flag — and since nothing marks it
    // dirty again when the slides come back, every later scroll would find all
    // centers equidistant and settle on the first one. That is the "scrolling
    // doesn't move the selection, it just sits on the cover" bug. Nothing
    // mounted means nothing to measure: stay dirty and try again next scroll.
    if (!slideRefs.current.some(Boolean)) return;
    measuredScrollHeightRef.current = deck.scrollHeight;
    const deckRect = deck.getBoundingClientRect();
    const { scrollTop, scrollLeft } = deck;
    slideCentersRef.current = slideRefs.current.map((slide) => {
      if (!slide) return { top: 0, left: 0 };
      const preview = slide.querySelector<HTMLElement>(PREVIEW_SELECTOR);
      if (preview) {
        const rect = preview.getBoundingClientRect();
        return {
          top: rect.top - deckRect.top + scrollTop + rect.height / 2,
          left: rect.left - deckRect.left + scrollLeft + rect.width / 2,
        };
      }
      return {
        top: slide.offsetTop + slide.offsetHeight / 2,
        left: slide.offsetLeft + slide.offsetWidth / 2,
      };
    });
    centersDirtyRef.current = false;
  }, []);

  // Keep the active recipe valid as the page list changes (size / two-sided).
  useEffect(() => {
    setActiveNavIndex((index) => Math.min(index, Math.max(0, navItemsLength - 1)));
  }, [navItemsLength, setActiveNavIndex]);

  // Always start a freshly selected recipe on its front face.
  useEffect(() => {
    setCanvasSide("front");
  }, [activeNavIndex, continueOnBack]);

  // Scale each deck page to fit the available width while leaving room above
  // and below so the previous / next pages peek in (implying you can scroll).
  useEffect(() => {
    const el = deckNode;
    if (!el) return;
    const update = () => {
      // Any resize moves the slides, so the cached centers are stale.
      centersDirtyRef.current = true;
      const horizontal = isHorizontal(el);
      // Each slide is narrower than the deck itself (`calc(100% - 96px)`) so
      // neighbouring pages peek in on both sides; the scale must fit that slide
      // width, not the full deck width, or the card overflows its slot.
      // The reserve is what the neighbouring pages show through. Bigger than
      // the old 96 because the slide now shrink-wraps its page, so this margin
      // IS the peek rather than empty slide either side of it.
      const availW = el.clientWidth - (horizontal ? 240 : 40);
      const availH = el.clientHeight;
      if (availW > 0 && availH > 0) {
        const widthScale = availW / pageWidth;
        // Height is what limits a portrait page on a short deck, so this factor
        // is the real size control. Raised from 0.86: the strip below took the
        // deck's spare height and the page shrank with it.
        const heightScale = (availH * (horizontal ? 0.94 : 0.74)) / pageHeight;
        const scale = Math.max(0.12, Math.min(1.05, widthScale, heightScale));
        setDeckScale(scale);
        // Give the CSS top padding (see `--deck-top-pad` in globals.css) the
        // exact offset that centres the first slide, computed analytically
        // from the same scale rather than measured post-render, so it's
        // never a frame behind. That makes scrollTop:0 the first slide's own
        // resting position, with no gap above it left to overscroll into.
        if (!horizontal) {
          // Centre the first card inside the SNAPPORT (the viewport inset by
          // `scroll-padding-top`), not the raw viewport — the same geometry
          // `snapScrollTopFor` uses. Centring against the raw viewport put the
          // first slide's resting place half the padding away from its own snap
          // point, so it drifted the moment snapping re-engaged. The padding
          // itself is the control clearance, so this can never fall below it.
          const snapportHeight = availH - DECK_SCROLL_PADDING_TOP;
          const topPad =
            DECK_SCROLL_PADDING_TOP +
            Math.max(0, (snapportHeight - pageHeight * scale) / 2);
          el.style.setProperty("--deck-top-pad", `${topPad}px`);
        }
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [deckNode, cardSize, sheetsLength, pageWidth, pageHeight]);

  const centerSlide = useCallback(
    (index: number, behavior: ScrollBehavior = "auto") => {
      const deck = deckRef.current;
      const slide = slideRefs.current[index];
      if (!deck || !slide) return;

      if (isHorizontal(deck)) {
        const targetLeft = slide.offsetLeft - (deck.clientWidth - slide.offsetWidth) / 2;
        const maxLeft = deck.scrollWidth - deck.clientWidth;
        // Round so the resting position is pixel-identical to the CSS snap
        // point; a fractional target is what lets snapping nudge afterward.
        scrollDeckTo(deck, {
          left: Math.round(Math.max(0, Math.min(targetLeft, maxLeft))),
          behavior,
        });
        return;
      }

      // Control clearance is no longer applied here: `scroll-padding-top` owns
      // it, and honouring that is exactly what keeps this in agreement with the
      // browser. Two implementations of one intent is what drifted.
      const targetTop = snapScrollTopFor(deck, slide);
      const maxTop = deck.scrollHeight - deck.clientHeight;
      scrollDeckTo(deck, {
        top: Math.round(Math.max(0, Math.min(targetTop, maxTop))),
        behavior,
      });
    },
    [],
  );

  // Holds off the scroll listener until a programmatic scroll settles,
  // otherwise it overwrites our selection with whichever slide is centred
  // partway through the animation.
  const suppressAndCenter = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      suppressScrollSyncRef.current = true;
      window.clearTimeout(scrollSyncTimerRef.current);
      scrollSyncTimerRef.current = window.setTimeout(
        () => {
          suppressScrollSyncRef.current = false;
        },
        behavior === "smooth" ? 500 : 120,
      );
      centerSlide(index, behavior);
    },
    [centerSlide],
  );

  // Scrolling the deck selects whichever slide is closest to the centre.
  // Every nav item — including a second recipe sharing a sheet with the
  // first — has its own slide, so this is a direct index lookup.
  useEffect(() => {
    const el = deckNode;
    if (!el) return;
    let raf = 0;

    // The slide nearest the middle of the scrollport, or null when there is
    // nothing to compare against (the deck is mid-remeasure, so its slides are
    // unmounted). Null means "leave the selection alone" — the old code fell
    // through to index 0 and yanked the cook back to the cover.
    const closestIndex = (horizontal: boolean): number | null => {
      // Re-measure once after a layout change, then reuse the cache for every
      // frame of the scroll that follows — no getBoundingClientRect per frame.
      if (centersDirtyRef.current) measureSlideCenters();
      const centers = slideCentersRef.current;
      const mid = horizontal
        ? el.scrollLeft + el.clientWidth / 2
        : el.scrollTop + el.clientHeight / 2;
      let bestIndex: number | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centers.length; index += 1) {
        if (!slideRefs.current[index]) continue;
        const center = horizontal ? centers[index].left : centers[index].top;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = index;
        }
      }
      return bestIndex;
    };

    const onScroll = () => {
      if (suppressScrollSyncRef.current) return;
      if (el.scrollHeight !== measuredScrollHeightRef.current) centersDirtyRef.current = true;
      const horizontal = isHorizontal(el);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = closestIndex(horizontal);
        if (next !== null) setActiveNavIndex(next);
      });
    };
    // A programmatic scroll (clicking a page in the rail) briefly ignores the
    // scroll-driven selection, so the animation doesn't drag the outline across
    // every page it flies past. That guard is a 500ms timer, though — and if it
    // is ever left standing (a timer dropped while the tab was backgrounded, a
    // navigation that re-armed it, a re-render mid-animation), scroll-to-select
    // is dead for the rest of the session: clicking a thumbnail still selects,
    // because that sets the selection directly, while scrolling silently stops
    // choosing anything. A real gesture settles it — the cook is driving now, so
    // their input always outranks an in-flight programmatic scroll.
    const onUserScrollIntent = () => {
      if (!suppressScrollSyncRef.current) return;
      window.clearTimeout(scrollSyncTimerRef.current);
      suppressScrollSyncRef.current = false;
    };
    el.addEventListener("wheel", onUserScrollIntent, { passive: true });
    el.addEventListener("touchmove", onUserScrollIntent, { passive: true });
    el.addEventListener("keydown", onUserScrollIntent);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("wheel", onUserScrollIntent);
      el.removeEventListener("touchmove", onUserScrollIntent);
      el.removeEventListener("keydown", onUserScrollIntent);
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [deckNode, navItemsLength, setActiveNavIndex, measureSlideCenters]);

  // Adding/removing slides or switching the deck's axis moves every slide, so
  // the cached centers must be rebuilt on the next scroll.
  useEffect(() => {
    centersDirtyRef.current = true;
  }, [navItemsLength, deckScale, cardSize, singleRecipePrintView]);

  // Centre the active page when the deck is first laid out or rescaled.
  const didInitDeckPositionRef = useRef(false);
  useEffect(() => {
    // On the FIRST real layout, land on the cover (index 0). The deck is a
    // native scroll container, so on a reload the browser restores its previous
    // `scrollTop`, and the scroll listener above then rewrites `activeNavIndex`
    // to whatever mid-book slide that lands on — the "refresh jumps to a random
    // page" bug. Force the top and suppress the sync briefly so the restore
    // scroll that fires as we reset can't corrupt the selection.
    if (!didInitDeckPositionRef.current && navItemsLength > 0) {
      didInitDeckPositionRef.current = true;
      const el = deckRef.current;
      suppressScrollSyncRef.current = true;
      if (el) {
        el.scrollTop = 0;
        el.scrollLeft = 0;
      }
      setActiveNavIndex(0);
      centerSlide(0);
      window.clearTimeout(scrollSyncTimerRef.current);
      scrollSyncTimerRef.current = window.setTimeout(() => {
        suppressScrollSyncRef.current = false;
      }, 250);
      return;
    }
    centerSlide(activeNavIndex);
    // Only re-centre on structural / size changes, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItemsLength, deckScale, cardSize]);

  const goToSlide = useCallback(
    (navIndex: number) => {
      // Every nav item has its own slide now (see the deck render below), even
      // when two recipes share a physical sheet, so this is always a real
      // scroll rather than just a same-sheet slot swap.
      if (navIndex !== activeNavIndex) {
        const behavior = Math.abs(navIndex - activeNavIndex) <= 3 ? "smooth" : "auto";
        suppressAndCenter(navIndex, behavior);
      }
      setActiveNavIndex(navIndex);
    },
    [activeNavIndex, suppressAndCenter, setActiveNavIndex],
  );

  return {
    canvasSide,
    setCanvasSide,
    deckScale,
    /** Attach this to the deck element (a callback ref, not an object): the
        listeners above follow the element it reports. */
    deckRef: attachDeck,
    slideRefs,
    goToSlide,
  };
}
