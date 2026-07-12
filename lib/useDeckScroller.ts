"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PrintCardSize } from "@/components/RecipeCardPrint";

const SINGLE_RECIPE_DECK_TOP_PADDING = 16;
const PREVIEW_SELECTOR = ".recipe-page-scaler";

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

function scrollDeckTo(deck: HTMLDivElement, options: ScrollToOptions) {
  if (options.behavior === "smooth") {
    // A snap-enabled smooth scrollTo() spanning multiple snap points can stop
    // at an intermediate preview instead of the requested one. Suspend
    // snapping for the programmatic animation, then restore normal wheel/touch
    // snapping for the deck.
    deck.style.scrollSnapType = "none";
    const restore = () => {
      deck.style.scrollSnapType = "";
    };
    deck.addEventListener("scrollend", restore, { once: true });
    window.setTimeout(restore, 600);
  }
  deck.scrollTo(options);
}

function getPreviewMetrics(deck: HTMLDivElement, slide: HTMLDivElement) {
  const preview = slide.querySelector<HTMLElement>(PREVIEW_SELECTOR);
  if (!preview) {
    return {
      top: slide.offsetTop,
      left: slide.offsetLeft,
      width: slide.offsetWidth,
      height: slide.offsetHeight,
    };
  }

  const deckRect = deck.getBoundingClientRect();
  const previewRect = preview.getBoundingClientRect();
  return {
    top: previewRect.top - deckRect.top + deck.scrollTop,
    left: previewRect.left - deckRect.left + deck.scrollLeft,
    width: previewRect.width,
    height: previewRect.height,
  };
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
  const deckRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  // While we scroll the deck programmatically (after a click), ignore the
  // scroll-driven selection so it doesn't yank the outline back to whichever
  // page is momentarily centred mid-animation.
  const suppressScrollSyncRef = useRef(false);
  const scrollSyncTimerRef = useRef<number | undefined>(undefined);

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
    const el = deckRef.current;
    if (!el) return;
    const update = () => {
      const mobile = window.matchMedia("(max-width: 820px)").matches;
      // On mobile each slide is narrower than the deck itself (100vw - 96px)
      // so neighbouring pages peek in on both sides; the scale must fit that
      // slide width, not the full deck width, or the card overflows its slot.
      const availW = el.clientWidth - (mobile ? 96 : 40);
      const availH = el.clientHeight;
      if (availW > 0 && availH > 0) {
        const widthScale = availW / pageWidth;
        const heightScale = (availH * (mobile ? 0.86 : 0.74)) / pageHeight;
        const scale = Math.max(0.12, Math.min(1.05, widthScale, heightScale));
        setDeckScale(scale);
        // Give the CSS top padding (see `--deck-top-pad` in globals.css) the
        // exact offset that centres the first slide, computed analytically
        // from the same scale rather than measured post-render, so it's
        // never a frame behind. That makes scrollTop:0 the first slide's own
        // resting position, with no gap above it left to overscroll into.
        if (!mobile) {
          const topPad = Math.max(0, (availH - pageHeight * scale) / 2);
          el.style.setProperty("--deck-top-pad", `${topPad}px`);
        }
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardSize, sheetsLength, pageWidth, pageHeight]);

  const centerSlide = useCallback(
    (index: number, behavior: ScrollBehavior = "auto") => {
      const deck = deckRef.current;
      const slide = slideRefs.current[index];
      if (!deck || !slide) return;

      if (window.matchMedia("(max-width: 820px)").matches) {
        const targetLeft = slide.offsetLeft - (deck.clientWidth - slide.offsetWidth) / 2;
        const maxLeft = deck.scrollWidth - deck.clientWidth;
        scrollDeckTo(deck, {
          left: Math.max(0, Math.min(targetLeft, maxLeft)),
          behavior,
        });
        return;
      }

      const preview = getPreviewMetrics(deck, slide);
      const targetTop = singleRecipePrintView
        ? preview.top - SINGLE_RECIPE_DECK_TOP_PADDING
        : preview.top - (deck.clientHeight - preview.height) / 2;
      const maxTop = deck.scrollHeight - deck.clientHeight;
      scrollDeckTo(deck, {
        top: Math.max(0, Math.min(targetTop, maxTop)),
        behavior,
      });
    },
    [singleRecipePrintView],
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
    const el = deckRef.current;
    if (!el) return;
    let raf = 0;

    const closestIndex = (mobile: boolean) => {
      const mid = mobile ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 2;
      let bestIndex = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      slideRefs.current.forEach((slide, index) => {
        if (!slide) return;
        const preview = mobile ? null : getPreviewMetrics(el, slide);
        const center = mobile
          ? slide.offsetLeft + slide.offsetWidth / 2
          : preview!.top + preview!.height / 2;
        const dist = Math.abs(center - mid);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = index;
        }
      });
      return bestIndex;
    };

    const onScroll = () => {
      if (suppressScrollSyncRef.current) return;
      const mobile = window.matchMedia("(max-width: 820px)").matches;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setActiveNavIndex(closestIndex(mobile));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [navItemsLength, setActiveNavIndex]);

  // Centre the active page when the deck is first laid out or rescaled.
  useEffect(() => {
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
    deckRef,
    slideRefs,
    goToSlide,
    centerSlide,
  };
}
