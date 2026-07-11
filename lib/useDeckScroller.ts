"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { PrintCardSize } from "@/components/RecipeCardPrint";

const SINGLE_RECIPE_DECK_TOP_PADDING = 16;

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
    // scroll-snap-type: mandatory fights a smooth scrollTo() that spans
    // multiple snap points — the deck stops at an intermediate slide
    // instead of the requested one. Suspend snapping for the animation.
    deck.style.scrollSnapType = "none";
    const restore = () => {
      deck.style.scrollSnapType = "";
    };
    deck.addEventListener("scrollend", restore, { once: true });
    window.setTimeout(restore, 600);
  }
  deck.scrollTo(options);
}

/**
 * Owns the print page's scrollable deck: which face (front/back) is showing,
 * the scale that fits each page to the viewport, and scrolling to a given
 * slide (by click or by the scroll position itself settling closest to one).
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
        setDeckScale(Math.max(0.12, Math.min(1.05, widthScale, heightScale)));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardSize, sheetsLength, pageWidth, pageHeight]);

  // Scrolling the deck selects whichever slide is closest to the centre.
  // Every nav item — including a second recipe sharing a sheet with the
  // first — has its own slide, so this is a direct index lookup.
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (suppressScrollSyncRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mobile = window.matchMedia("(max-width: 820px)").matches;
        const mid = mobile ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 2;
        let bestIndex = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        slideRefs.current.forEach((slide, index) => {
          if (!slide) return;
          const center = mobile
            ? slide.offsetLeft + slide.offsetWidth / 2
            : slide.offsetTop + slide.offsetHeight / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = index;
          }
        });
        setActiveNavIndex(bestIndex);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [navItemsLength, setActiveNavIndex]);

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

      const targetTop = singleRecipePrintView
        ? slide.offsetTop - SINGLE_RECIPE_DECK_TOP_PADDING
        : slide.offsetTop - (deck.clientHeight - slide.offsetHeight) / 2;
      const maxTop = deck.scrollHeight - deck.clientHeight;
      scrollDeckTo(deck, {
        top: Math.max(0, Math.min(targetTop, maxTop)),
        behavior,
      });
    },
    [singleRecipePrintView],
  );

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
        // Hold off the scroll listener until the animation settles, otherwise it
        // overwrites our selection with the page that's centred partway through.
        suppressScrollSyncRef.current = true;
        window.clearTimeout(scrollSyncTimerRef.current);
        scrollSyncTimerRef.current = window.setTimeout(
          () => {
            suppressScrollSyncRef.current = false;
          },
          behavior === "smooth" ? 500 : 120,
        );
        centerSlide(navIndex, behavior);
      }
      setActiveNavIndex(navIndex);
    },
    [activeNavIndex, centerSlide, setActiveNavIndex],
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
