"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRightIcon, PlusIcon, XIcon, ICON_SIZE } from "@/components/icons";
import { ScaledPage } from "@/components/print/ScaledPage";
import { BOOK_PAGE_ADD_LABEL, type BookPageSlot } from "@/components/print/PageRail";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { coverSideOf } from "@/lib/pageDeletion";
import { PAGE_DIMS } from "@/lib/printGeometry";
import type { FontScale } from "@/lib/fontScale";
import type { NavItem, PageSheet } from "@/lib/usePrintSheets";

/** A thumbnail's width on screen: big enough to tell pages apart, small enough
    that a phone shows four and a bit, which says the row scrolls. */
const THUMB_WIDTH = 72;

/**
 * Where a page sits in the front-to-back order of a book's optional pages, so
 * a deleted one's "Add …" tile can stand where it would be: the cover, then the
 * dedication, then the contents, then everything else, then the back cover.
 */
function bookOrder(nav: NavItem): number {
  if (nav.kind === "toc") return 2;
  if (nav.kind !== "cover") return 3;
  const side = coverSideOf(nav);
  return side === "front" ? 0 : side === "dedication" ? 1 : 4;
}
const SLOT_ORDER: Record<BookPageSlot, number> = { cover: 0, dedication: 1, toc: 2, "back-cover": 4 };

/** Mounts its page only once it scrolls near the strip's view: a long book
    would otherwise draw every page the moment the strip opens. */
function LazyThumb({ root, children }: { root: HTMLElement | null; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (shown) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { root, rootMargin: "0px 300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root, shown]);
  return (
    <span ref={ref} className="recipe-pages-panel__thumb">
      {shown ? children : null}
    </span>
  );
}

/**
 * A phone's page overview: a strip of every page as a thumbnail that opens
 * under the top bar and pushes the deck down, rather than a sheet over it.
 * Opened from the page count's caret ("2 / 4 ⌄") or the bottom bar's Pages
 * tile, which are the same toggle. Tap a page to go to it; the strip stays
 * open and marks it. The caret, the X or Escape close it.
 *
 * A cookbook's Organize opens from here, and a deleted cover, dedication,
 * contents or back cover comes back from the spot it left, as it does in the
 * desktop rail.
 */
export function MobilePagesPanel({
  open,
  onClose,
  navItems,
  sheets,
  currentNavIndex,
  onGoToPage,
  cardSize,
  previewCardSize,
  template,
  fontScale,
  doubleSided,
  showDescription,
  cookbookMode,
  missingBookPages,
  onAddBookPage,
  onOrganize,
}: {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  sheets: PageSheet[];
  /** The page in view, marked in the strip. */
  currentNavIndex: number | null;
  onGoToPage: (navIndex: number) => void;
  cardSize: PrintCardSize;
  previewCardSize: PrintCardSize;
  template: RecipePrintTemplate;
  fontScale: FontScale;
  doubleSided: boolean;
  showDescription: boolean;
  cookbookMode: boolean;
  missingBookPages: readonly BookPageSlot[];
  onAddBookPage: (page: BookPageSlot) => void;
  /** Cookbook only: opens the organizer. */
  onOrganize?: () => void;
}) {
  const [strip, setStrip] = useState<HTMLOListElement | null>(null);

  // Open on the page you are looking at, not the start of a long book. Only
  // the strip scrolls: `scrollIntoView` would also move the deck under it.
  useEffect(() => {
    if (!open || !strip) return;
    const current = strip.querySelector<HTMLElement>("[aria-current='page']");
    if (!current) return;
    const li = current.closest("li") ?? current;
    strip.scrollLeft = li.offsetLeft - (strip.clientWidth - li.offsetWidth) / 2;
  }, [open, strip]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const scale = THUMB_WIDTH / PAGE_DIMS[cardSize].w;
  const missing = cookbookMode ? [...missingBookPages] : [];
  const addTile = (page: BookPageSlot) => (
    <li key={`add-${page}`}>
      <button
        type="button"
        className="recipe-pages-panel__add"
        style={{ width: THUMB_WIDTH, aspectRatio: `${PAGE_DIMS[cardSize].w} / ${PAGE_DIMS[cardSize].h}` }}
        onClick={() => {
          onClose();
          onAddBookPage(page);
        }}
      >
        <PlusIcon size={ICON_SIZE.sm} />
        {BOOK_PAGE_ADD_LABEL[page]}
      </button>
    </li>
  );

  return (
    <section className="recipe-pages-panel no-print" aria-label="Pages">
      <div className="recipe-pages-panel__head">
        <h2 className="recipe-pages-panel__title">Pages</h2>
        {onOrganize && (
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={() => {
              onClose();
              onOrganize();
            }}
          >
            Organize
            <ChevronRightIcon size={ICON_SIZE.sm} />
          </button>
        )}
        <button
          type="button"
          className="icon-close-btn recipe-pages-panel__close"
          aria-label="Close pages"
          onClick={onClose}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>
      <ol ref={setStrip} className="recipe-pages-panel__strip">
        {navItems.map((nav, index) => {
          const sheet = sheets[nav.sheetIndex];
          if (!sheet) return null;
          const order = cookbookMode ? bookOrder(nav) : 3;
          const before = missing.filter((page) => SLOT_ORDER[page] < order);
          before.forEach((page) => missing.splice(missing.indexOf(page), 1));
          const isCurrent = index === currentNavIndex;
          return (
            <Fragment key={`${nav.kind}-${nav.recipeId}-${nav.sheetIndex}-${nav.slotIndex}`}>
              {before.map(addTile)}
              <li>
                <button
                  type="button"
                  className="recipe-pages-panel__page"
                  aria-current={isCurrent ? "page" : undefined}
                  // Stays open: the strip is for moving around the book, and
                  // the page you go to is marked in it as you go.
                  onClick={() => onGoToPage(index)}
                >
                  <LazyThumb root={strip}>
                    <ScaledPage
                      sheet={sheet}
                      isLastSheet={nav.sheetIndex === sheets.length - 1}
                      activeSlotIndex={nav.slotIndex}
                      activeSide="front"
                      scale={scale}
                      size={previewCardSize}
                      template={template}
                      fontScale={fontScale}
                      doubleSided={doubleSided}
                      showDescription={showDescription}
                      showCutLines={false}
                      showDecoration={false}
                      cookbookMode={cookbookMode}
                    />
                  </LazyThumb>
                  <span className="recipe-pages-panel__label">{nav.label}</span>
                </button>
              </li>
            </Fragment>
          );
        })}
        {missing.map(addTile)}
      </ol>
    </section>
  );
}
