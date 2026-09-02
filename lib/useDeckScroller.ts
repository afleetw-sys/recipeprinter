"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PrintCardSize } from "@/components/RecipeCardPrint";

const PREVIEW_SELECTOR = ".recipe-page-scaler";
/** Mirrors `scroll-padding-top` on `.recipe-page-deck` in app/print/print.css.
    Reserves room above every card for its floating controls (front/back flip +
    Edit), which would otherwise tuck behind the sticky top bar. */
const DECK_SCROLL_PADDING_TOP = 72;

/** How fast a pinch travels. Tuned so one comfortable trackpad gesture crosses
    roughly one preset step rather than the whole range. */
const ZOOM_WHEEL_SENSITIVITY = 0.006;
/** How close to a preset the gesture has to get before it holds there. The
    presets are 25 points apart, so 6 gives each one a noticeable pull without
    the gaps between them becoming unreachable. */
const ZOOM_DETENT = 0.06;

/**
 * Below this the deck is a horizontal filmstrip with no rail beside it; above
 * it, a vertical stack with the rail. Exported because the print page has to
 * ask the same question, and a second copy of the number is a second thing to
 * remember to change.
 */
export const DECK_MOBILE_QUERY = "(max-width: 820px)";

/** Server-safe: false before hydration, where there is no viewport to measure. */
export function isDeckMobile(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DECK_MOBILE_QUERY).matches;
}

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
  /** Anything outside this hook that changes how much room the deck has —
      folding a side panel away, for instance. The ResizeObserver alone is not
      enough: collapsing a grid column settles over more than one frame, and the
      observation that lands can be the one taken before the track resolved,
      leaving the scale sized for the old width. Changing this re-measures. */
  layoutKey?: string;
  /** The cook's own zoom, multiplied onto the fit-to-viewport scale. 1 is fit. */
  zoom?: number;
  /** Bounds for the pinch gesture, matching the +/- control's own. */
  zoomRange?: { min: number; max: number };
  /** The zoom menu's own steps. The gesture holds at one when it passes close
      to it, so a pinch can land on exactly 100% instead of near it. */
  zoomPresets?: readonly number[];
  /** Set the zoom from a trackpad pinch. Omit to leave the gesture alone. */
  onZoomChange?: (zoom: number) => void;
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
  layoutKey,
  zoom = 1,
  zoomRange,
  zoomPresets,
  onZoomChange,
}: UseDeckScrollerOptions) {
  const [canvasSide, setCanvasSide] = useState<"front" | "back">("front");
  /**
   * How much of a page fits this window — the deck's own business, changed by
   * resizing the window, folding a panel away, or switching card size.
   *
   * Held apart from the cook's zoom, which multiplies it, because the two mean
   * different things to the deck: a new FIT is a new layout and the active page
   * should be re-centred in it, while a zoom is someone leaning in on the page
   * they are already looking at and must leave their position alone. Both used
   * to arrive as one `deckScale`, so every zoom notch re-centred the active
   * page and threw away where they were looking.
   */
  const [fitScale, setFitScale] = useState(0.5);
  const deckScale = fitScale * zoom;
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

  /**
   * The deck's own geometry for a given page scale: the pad that rests the
   * first page in the centre, and whether a page has outgrown the window.
   *
   * Its own function because it has two callers that know the scale at
   * different moments. Remeasuring the fit knows it (below), and so does a
   * zoom, which changes the scale without changing anything measurable about
   * the window. It used to live only in the first, so a zoom moved the pages a
   * whole commit before the padding underneath them caught up — and the
   * correction that keeps the page still ran in the gap between, against
   * geometry that was about to change under it.
   */
  const applyDeckGeometry = useCallback(
    (el: HTMLDivElement, scale: number) => {
      // The mobile deck is a horizontal filmstrip with its own fixed padding
      // and no snapport to centre anything in.
      if (isDeckMobile()) return;
      const availW = el.clientWidth - 40;
      const availH = el.clientHeight;
      if (availW <= 0 || availH <= 0) return;
      // Centre the first card inside the SNAPPORT (the viewport inset by
      // `scroll-padding-top` AND `-bottom`), not the raw viewport — the same
      // geometry `snapScrollTopFor` uses. Centring against the raw viewport put
      // the first slide's resting place half the padding away from its own snap
      // point, so it drifted the moment snapping re-engaged. The inset is equal
      // at both ends, so the snapport's centre is the deck's centre and the top
      // inset still guarantees the control clearance.
      const snapportHeight = availH - DECK_SCROLL_PADDING_TOP * 2;
      const topPad =
        DECK_SCROLL_PADDING_TOP + Math.max(0, (snapportHeight - pageHeight * scale) / 2);
      // Computed analytically from the scale rather than measured post-render,
      // so it is never a frame behind. That makes scrollTop:0 the first slide's
      // own resting position, with no gap above it to overscroll into.
      el.style.setProperty("--deck-top-pad", `${topPad}px`);

      /**
       * Zoomed in far enough that a page no longer fits the window.
       *
       * `scroll-snap-type: y mandatory` is safe while every page fits — that is
       * the assumption written next to it in print.css, and it held until the
       * zoom control arrived and started multiplying the fit. Past fit, a page
       * is bigger than the window it is being snapped inside, and scrolling to
       * look at the bottom of one gets pulled to the next snap point instead:
       * asking for 600 landed at 843. Someone who has zoomed in is examining
       * ONE page, not flicking between them, so the deck stops snapping until
       * they zoom back out. Free scroll also brings back the scrollbars and the
       * 20px of slack at the edges (see print.css) — a page too big for the
       * window has to be pannable.
       *
       * BOTH axes, and the width half is what a book needs. Fitting a two-page
       * spread is width-bound: it fills the deck exactly at 100%, and the very
       * next notch hangs over both edges while the page still clears the
       * snapport vertically. Asking about height alone left that whole stretch
       * of zoom snapped and scrollbar-less — the deck pulling back to centre a
       * spread you were trying to look across, with no bar for a mouse to pan
       * it with. A single card is never width-bound (its fit runs out of height
       * first), so cards never showed this and a cookbook showed nothing else.
       *
       * The 1px tolerance keeps an exact fit — where the binding axis lands on
       * the budget to the pixel — from rounding itself into free scroll and
       * putting scrollbars on a deck at rest.
       */
      if (pageHeight * scale > snapportHeight + 1 || pageWidth * scale > availW + 1) {
        el.dataset.freeScroll = "true";
      } else {
        delete el.dataset.freeScroll;
      }
    },
    [pageWidth, pageHeight],
  );

  // Scale each deck page to fit the available width while leaving room above
  // and below so the previous / next pages peek in (implying you can scroll).
  useEffect(() => {
    const el = deckNode;
    if (!el) return;
    const update = () => {
      // Any resize moves the slides, so the cached centers are stale.
      centersDirtyRef.current = true;
      const mobile = isDeckMobile();
      // On mobile each slide is narrower than the deck itself (100vw - 96px)
      // so neighbouring pages peek in on both sides; the scale must fit that
      // slide width, not the full deck width, or the card overflows its slot.
      const availW = el.clientWidth - (mobile ? 96 : 40);
      const availH = el.clientHeight;
      if (availW > 0 && availH > 0) {
        const widthScale = availW / pageWidth;
        const heightScale = (availH * (mobile ? 0.86 : 0.74)) / pageHeight;
        // A page can never be taller than the SNAPPORT. `scroll-snap-align:
        // center` centres against the snapport, so a page taller than it
        // cannot be centred without eating into the inset — and the top half
        // of that inset is the room the floating Edit control sits in, which
        // would then be clipped by the deck's own overflow. This does not bind
        // at the budget above; it is the guard that keeps the two rules
        // consistent if the deck is ever short enough that it would.
        const snapportScale = mobile
          ? Infinity
          : (availH - DECK_SCROLL_PADDING_TOP * 2) / pageHeight;
        // The fit, then the cook's zoom on top of it. Clamping BEFORE the
        // multiply is what makes 100% mean "as large as this window allows"
        // and 150% mean half again — rather than the ceiling swallowing the
        // zoom whole on a small card.
        const fit = Math.max(
          0.12,
          Math.min(1.05, widthScale, heightScale, snapportScale),
        );
        setFitScale(fit);
        applyDeckGeometry(el, fit * zoom);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [deckNode, cardSize, sheetsLength, pageWidth, pageHeight, layoutKey, zoom, applyDeckGeometry]);

  /**
   * Pinch to zoom, the way every canvas tool does it.
   *
   * A trackpad pinch arrives as a `wheel` event with `ctrlKey` set — the same
   * event ctrl+wheel on a mouse produces, so both gestures land here. Plain
   * two-finger scrolling has no `ctrlKey` and is left entirely alone.
   *
   * `preventDefault` is the point of the exercise: without it the BROWSER
   * zooms, blowing up the whole workspace — chrome, rail and panel included —
   * when what the cook meant was "look closer at this page". That needs a
   * non-passive listener, which is why this is here and not an onWheel prop.
   *
   * Three things keep it from feeling jerky, and all three were missing first
   * time round:
   *
   *  1. The listener binds ONCE. Reading `zoom` and `deckScale` from the
   *     closure meant re-binding on every step of the gesture — tearing down
   *     and re-adding a listener between the frames of a live pinch.
   *  2. A pinch fires far faster than the deck can re-lay-out, and every event
   *     was its own React render. They are accumulated and applied one per
   *     animation frame instead, so the work matches the display.
   *  3. The presets pull. Within `ZOOM_DETENT` of one of them the applied zoom
   *     IS that preset, while the raw gesture keeps accumulating underneath —
   *     so a detent holds you at exactly 100% for a moment, then lets go when
   *     you genuinely mean to leave, instead of stranding you at 97%.
   */
  const rawZoomRef = useRef(zoom);
  const zoomRef = useRef(zoom);
  const pendingDeltaRef = useRef(0);
  const zoomFrameRef = useRef(0);
  /** The point the gesture is zooming about, and the page box it sits in. */
  const pendingZoomAnchorRef = useRef<
    { x: number; y: number; page: HTMLElement; fx: number; fy: number } | null
  >(null);
  // Kept current for the frame callback below without re-binding anything.
  zoomRef.current = zoom;
  // The +/- buttons and the preset menu set the zoom too; the gesture has to
  // start from wherever they left it rather than from its own last value.
  if (Math.abs(rawZoomRef.current - zoom) > 0.001 && !zoomFrameRef.current) {
    rawZoomRef.current = zoom;
  }

  useEffect(() => {
    const el = deckNode;
    if (!el || !onZoomChange || !zoomRange) return;

    const applyPendingZoom = () => {
      zoomFrameRef.current = 0;
      const delta = pendingDeltaRef.current;
      pendingDeltaRef.current = 0;
      if (!delta) return;
      const raw = Math.min(
        zoomRange.max,
        Math.max(zoomRange.min, rawZoomRef.current * Math.exp(-delta * ZOOM_WHEEL_SENSITIVITY)),
      );
      rawZoomRef.current = raw;
      const nearest = zoomPresets?.reduce(
        (best, step) => (Math.abs(step - raw) < Math.abs(best - raw) ? step : best),
        zoomPresets[0],
      );
      const next =
        nearest !== undefined && Math.abs(nearest - raw) <= ZOOM_DETENT
          ? nearest
          : Math.round(raw * 100) / 100;
      if (Math.abs(next - zoomRef.current) < 0.005) return;
      onZoomChange(next);
    };

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      pendingDeltaRef.current += event.deltaY;
      // Anchor to a PAGE, not to the deck. See the layout effect below.
      const target = event.target as Element | null;
      const page =
        target?.closest?.<HTMLElement>(".recipe-page-slide") ??
        el.querySelector<HTMLElement>(".recipe-page-slide");
      const rect = page?.getBoundingClientRect();
      pendingZoomAnchorRef.current =
        page && rect && rect.width > 0 && rect.height > 0
          ? {
              x: event.clientX,
              y: event.clientY,
              page,
              fx: (event.clientX - rect.left) / rect.width,
              fy: (event.clientY - rect.top) / rect.height,
            }
          : null;
      if (!zoomFrameRef.current) {
        zoomFrameRef.current = requestAnimationFrame(applyPendingZoom);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = 0;
      pendingDeltaRef.current = 0;
    };
  }, [deckNode, onZoomChange, zoomRange, zoomPresets]);

  /**
   * Keep the deck's padding and free-scroll in step with the scale in the SAME
   * commit the pages resize in — and before the anchor correction below reads
   * that geometry to decide where to scroll. The resize observer above cannot
   * do this half: a zoom changes the scale without changing anything it
   * observes, so it only hears about it a commit later.
   */
  useLayoutEffect(() => {
    const el = deckRef.current;
    if (el) applyDeckGeometry(el, deckScale);
  }, [deckScale, applyDeckGeometry]);

  /**
   * The +/- buttons and the preset menu zoom too, and they have no cursor to
   * zoom about — so they zoom about the middle of the window, which is where
   * whoever pressed them is looking. Without this they left the scroll offset
   * untouched and the page grew downward out of the window.
   *
   * Runs on `zoom`, which changes a render BEFORE the fit is remeasured, so the
   * geometry it captures is still the old size. A pinch has already put its own
   * anchor here by then and keeps it.
   */
  useLayoutEffect(() => {
    if (pendingZoomAnchorRef.current) return;
    const el = deckRef.current;
    const page = el?.querySelector<HTMLElement>(".recipe-page-slide.is-active")
      ?? el?.querySelector<HTMLElement>(".recipe-page-slide");
    if (!el || !page) return;
    const deckRect = el.getBoundingClientRect();
    const rect = page.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = deckRect.left + deckRect.width / 2;
    const y = deckRect.top + deckRect.height / 2;
    pendingZoomAnchorRef.current = {
      x,
      y,
      page,
      fx: (x - rect.left) / rect.width,
      fy: (y - rect.top) / rect.height,
    };
  }, [zoom]);

  /**
   * Put the anchored point back under the cursor.
   *
   * MEASURED, not derived. This used to scale the scroll offsets by the ratio
   * the deck actually resized by — `(scrollLeft + x) * ratio - x` — which is
   * only correct if the content's top-left corner sits at scroll origin. It
   * does not. The deck centres its content (`align-items: safe center`) while
   * it still fits, so horizontally the content starts at an offset that shrinks
   * as the page grows; `--deck-top-pad` does the same job vertically and is
   * recomputed from the new scale rather than scaled by it; and crossing into
   * free scroll adds edge padding and scrollbars in the same frame. Every one
   * of those breaks the assumption, so the correction was itself a jump.
   *
   * A book is where it showed. A spread's fit is width-bound, so a cookbook
   * lives right on the boundary where centring gives out and every one of those
   * terms is changing at once; a single card keeps slack on both sides for the
   * whole range and drifts too little to see.
   *
   * So: remember where the cursor sat inside a real page, find that same spot
   * after the resize, and scroll by the difference. No assumption about where
   * the content begins — whatever moved it, this reads the result.
   *
   * Layout effect, so the correction lands in the frame the new size is painted
   * and the page does not visibly jump.
   */
  useLayoutEffect(() => {
    const anchor = pendingZoomAnchorRef.current;
    const el = deckRef.current;
    pendingZoomAnchorRef.current = null;
    if (!anchor || !el || !anchor.page.isConnected) return;
    const rect = anchor.page.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = rect.left + anchor.fx * rect.width - anchor.x;
    const dy = rect.top + anchor.fy * rect.height - anchor.y;
    if (dx) el.scrollLeft += dx;
    if (dy) el.scrollTop += dy;
  }, [deckScale]);

  /**
   * Bring one element in the deck to the position the browser would rest it at.
   *
   * Split out of `centerSlide` because the loading placeholder is deliberately
   * not one of the numbered slides (see PrintDeck) and still has to be
   * scrollable to. Nothing in here ever needed the index — only the deck and
   * the element — so the split costs nothing.
   */
  const centerElement = useCallback(
    (deck: HTMLDivElement, slide: HTMLElement, behavior: ScrollBehavior = "auto") => {
      if (isDeckMobile()) {
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

  const centerSlide = useCallback(
    (index: number, behavior: ScrollBehavior = "auto") => {
      const deck = deckRef.current;
      const slide = slideRefs.current[index];
      if (!deck || !slide) return;
      centerElement(deck, slide, behavior);
    },
    [centerElement],
  );

  // Holds off the scroll listener until a programmatic scroll settles,
  // otherwise it overwrites our selection with whichever slide is centred
  // partway through the animation.
  const suppressScrollSync = useCallback((behavior: ScrollBehavior) => {
    suppressScrollSyncRef.current = true;
    window.clearTimeout(scrollSyncTimerRef.current);
    scrollSyncTimerRef.current = window.setTimeout(
      () => {
        suppressScrollSyncRef.current = false;
      },
      behavior === "smooth" ? 500 : 120,
    );
  }, []);

  const suppressAndCenter = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      suppressScrollSync(behavior);
      centerSlide(index, behavior);
    },
    [centerSlide, suppressScrollSync],
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
    const closestIndex = (mobile: boolean): number | null => {
      // Re-measure once after a layout change, then reuse the cache for every
      // frame of the scroll that follows — no getBoundingClientRect per frame.
      if (centersDirtyRef.current) measureSlideCenters();
      const centers = slideCentersRef.current;
      const mid = mobile ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 2;
      let bestIndex: number | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      for (let index = 0; index < centers.length; index += 1) {
        if (!slideRefs.current[index]) continue;
        const center = mobile ? centers[index].left : centers[index].top;
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
      const mobile = isDeckMobile();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = closestIndex(mobile);
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
    // Only re-centre on structural / size changes, not on every selection —
    // and `fitScale`, not `deckScale`, so a zoom is not one of them. Zoom holds
    // its own position instead (see the anchor effect above): re-centring on it
    // undid every pinch and pulled the page back the moment you leaned in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItemsLength, fitScale, cardSize]);

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

  /**
   * Scroll to something in the deck that is not one of the numbered slides.
   *
   * The loading placeholder is the case this exists for. It is deliberately
   * outside the sheets pipeline, so it has no nav index and `goToSlide` cannot
   * reach it. Going through the same centring as a real slide is the point:
   * a bare `scrollIntoView` would fight mandatory snapping and bring back the
   * overshoot-then-catch that `scrollDeckTo` exists to prevent.
   *
   * `activeNavIndex` is left alone, because the placeholder is not a nav item
   * and there is nothing truthful to set it to. The scroll listener settles it
   * on whichever real slide ends up nearest once suppression lapses.
   *
   * Returns false when the element is not in the deck yet, so a caller that
   * ran a frame early can tell the difference between "moved" and "missed".
   */
  const goToDeckElement = useCallback(
    (selector: string, behavior: ScrollBehavior = "smooth") => {
      const deck = deckRef.current;
      const target = deck?.querySelector<HTMLElement>(selector);
      if (!deck || !target) return false;
      suppressScrollSync(behavior);
      centerElement(deck, target, behavior);
      return true;
    },
    [centerElement, suppressScrollSync],
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
    goToDeckElement,
  };
}
