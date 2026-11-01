"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDownIcon, ICON_SIZE } from "@/components/icons";
import { localStore } from "@/lib/storage";
import { useDeckMobile } from "@/lib/useDeckScroller";

/** Set once someone has swiped past the first page: they know how it works. */
const SWIPE_HINT_SEEN_KEY = "recipeprinter:deck-swipe-hint:v1";

/** Every page the deck shows: a drawn page or its placeholder, a blank that
    holds a button, an import loading in a page's place. A phone leaves out
    the blanks that are only there for the printed book, so what this counts
    is what you scroll through. */
const PAGE_SELECTOR =
  ".recipe-page-scaler, .recipe-spread__blank, .recipe-page-pending--in-spread";

type Count = { page: number; total: number; sheet: number | null };

function readCount(deck: HTMLElement): Count {
  const pages = Array.from(deck.querySelectorAll<HTMLElement>(PAGE_SELECTOR)).filter(
    // Laid out (an unflipped card back is display:none), and not a page drawn
    // inside another one.
    (el) => el.getClientRects().length > 0 && !el.parentElement?.closest(PAGE_SELECTOR),
  );
  const view = deck.getBoundingClientRect();
  let page = 0;
  let best = 0;
  pages.forEach((el, index) => {
    const rect = el.getBoundingClientRect();
    const shown = Math.min(rect.bottom, view.bottom) - Math.max(rect.top, view.top);
    if (shown > best) {
      best = shown;
      page = index;
    }
  });
  const sheet = pages[page]?.closest<HTMLElement>(".recipe-spread__cell")?.dataset.focusSheet;
  return { page: page + 1, total: pages.length, sheet: sheet ? Number(sheet) : null };
}

/**
 * A phone's "3 / 12" in the top-left corner, the way a PDF reader shows where
 * you are, and the first time, a "Swipe up" hint over the first page. The page counted is the one taking up most of the screen, read
 * from the deck itself, so it agrees with what you see: stacked spreads,
 * hidden blanks and all.
 */
export function DeckPageCount({
  deck,
  onSheetInView,
}: {
  /** The deck to count, as it is now. */
  deck: HTMLElement | null;
  /** The book page on screen (the one a tap on it would focus), or null for
      anything else, so the page toolbar can act on the page you can see. */
  onSheetInView?: (sheet: number | null) => void;
}) {
  const mobile = useDeckMobile();
  const [count, setCount] = useState<Count>({ page: 1, total: 0, sheet: null });
  const onSheetRef = useRef(onSheetInView);
  onSheetRef.current = onSheetInView;
  useEffect(() => {
    if (mobile) onSheetRef.current?.(count.sheet);
  }, [mobile, count.sheet]);

  // A page per screen hides that there is more below, so the first time, the
  // first page says so. Read after mounting: there is no storage to read on
  // the server.
  const [hintSeen, setHintSeen] = useState(true);
  useEffect(() => {
    setHintSeen(localStore.get(SWIPE_HINT_SEEN_KEY) !== null);
  }, []);
  useEffect(() => {
    if (hintSeen || count.page < 2) return;
    localStore.set(SWIPE_HINT_SEEN_KEY, "1");
    setHintSeen(true);
  }, [hintSeen, count.page]);

  useEffect(() => {
    if (!mobile || !deck) return;
    let raf = 0;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = readCount(deck);
        setCount((current) =>
          current.page === next.page && current.total === next.total && current.sheet === next.sheet
            ? current
            : next,
        );
      });
    };
    update();
    deck.addEventListener("scroll", update, { passive: true });
    // Pages come and go (an import lands, a page is deleted, a far page is
    // drawn), and the fit changes their size.
    const mutations = new MutationObserver(update);
    mutations.observe(deck, { childList: true, subtree: true });
    const resize = new ResizeObserver(update);
    resize.observe(deck);
    return () => {
      cancelAnimationFrame(raf);
      deck.removeEventListener("scroll", update);
      mutations.disconnect();
      resize.disconnect();
    };
  }, [mobile, deck]);

  if (!mobile || count.total < 2) return null;
  return (
    <div className="recipe-deck-page-count no-print">
      <p className="recipe-deck-page-count__badge">
        <span className="sr-only">Page </span>
        {count.page}
        <span aria-hidden> / </span>
        <span className="sr-only"> of </span>
        {count.total}
      </p>
      {!hintSeen && count.page === 1 ? (
        <p className="recipe-deck-swipe-hint" aria-hidden>
          <ChevronDownIcon size={ICON_SIZE.sm} />
          Swipe up for the next page
        </p>
      ) : null}
    </div>
  );
}
