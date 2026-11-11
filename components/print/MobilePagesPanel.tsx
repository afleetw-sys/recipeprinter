"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CheckIcon, ICON_SIZE, MoreHorizontalIcon, PlusIcon, TrashIcon, XIcon } from "@/components/icons";
import { ChapterNameInput } from "@/components/print/ChapterNameInput";
import { MoveToSectionMenu } from "@/components/print/MoveToSectionMenu";
import { ScaledPage } from "@/components/print/ScaledPage";
import { BOOK_PAGE_ADD_LABEL, type BookPageSlot } from "@/components/print/PageRail";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { coverSideOf } from "@/lib/pageDeletion";
import { PAGE_DIMS } from "@/lib/printGeometry";
import type { FontScale } from "@/lib/fontScale";
import { NOT_IN_A_CHAPTER, NOT_IN_A_CHAPTER_LABEL, recipeMoveDestinations } from "@/lib/recipeMoveDestinations";
import { useLongPress } from "@/lib/useLongPress";
import type { NavItem, PageSheet } from "@/lib/usePrintSheets";
import type { Section } from "@/types/recipe";

/** The smallest a thumbnail gets before a row loses a column. Three to a row
    on a phone (Amelia, 2026-11-10); more on a tablet's wider screen. */
const MIN_TILE = 96;
const GAP = 12;
/** How long a finger rests on a recipe, in Organize, before it's a drag. */
const DRAG_HOLD_MS = 350;

type Group = {
  key: string;
  /** The chapter this group is, or null for the front of the book, the
      recipes in no chapter, and the back. */
  sectionId: string | null;
  heading: string | null;
  tiles: Array<{ nav: NavItem; index: number } | { add: BookPageSlot }>;
};

/** Where a page sits among a book's optional pages, so a deleted one's "Add …"
    tile stands where it would be. */
function frontOrder(nav: NavItem): number {
  if (nav.kind === "toc") return 2;
  if (nav.kind !== "cover") return 3;
  const side = coverSideOf(nav);
  return side === "front" ? 0 : side === "dedication" ? 1 : 4;
}
const SLOT_ORDER: Record<BookPageSlot, number> = { cover: 0, dedication: 1, toc: 2, "back-cover": 4 };

/** Mounts a page only once it scrolls near the view: a long book would
    otherwise draw every page the moment the view opens. */
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
      { root, rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root, shown]);
  return (
    <span ref={ref} className="recipe-pages-view__thumb">
      {shown ? children : null}
    </span>
  );
}

/**
 * A phone's Pages view (Amelia, 2026-11-10): opened from the page count's
 * caret or the Pages tile, it takes over the space between the top bar and the
 * bottom tools, so the book is the whole screen. Pages run left to right,
 * three to a row, a chapter's under its own heading the way a Pinterest
 * board's sections sit. Tap a page to go to it.
 *
 * Organize happens here, not in a sheet of its own, the way Pinterest
 * organizes a board: tap Organize, tick recipes, and move them to a chapter
 * or delete them from the bar at the bottom; or press and hold a recipe and
 * drag it to a new spot. Chapter names can be typed over, and each chapter's
 * "⋯" holds its own moves and Delete.
 */
export function MobilePagesPanel({
  open,
  onClose,
  navItems,
  sheets,
  sections,
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
  onChapterMenu,
  sectionOfNav,
  itemIdsForSection,
  onRenameChapter,
  onMoveRecipes,
  onNewChapterFrom,
  onDeleteRecipes,
  onReorderRecipe,
  onAddChapter,
}: {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  sheets: PageSheet[];
  sections: Section[];
  /** The page in view, marked in the grid. */
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
  /** A chapter's "⋯", or a long press on its heading: its menu. */
  onChapterMenu?: (point: { x: number; y: number }, sectionId: string) => void;
  /** The chapter (or the unnamed group) a page belongs to. */
  sectionOfNav: (nav: NavItem) => string | null;
  itemIdsForSection: (sectionId: string) => string[];
  onRenameChapter: (sectionId: string, name: string) => void;
  onMoveRecipes: (ids: string[], sectionId: string) => void;
  onNewChapterFrom: (ids: string[]) => void;
  onDeleteRecipes: (ids: string[]) => void;
  onReorderRecipe: (id: string, sectionId: string, index: number) => void;
  onAddChapter: () => void;
}) {
  // A cookbook's Pages is always Organize (Amelia, 2026-11-10): a tap on a
  // page goes to it, a tick selects a recipe, and holding one drags it.
  // Recipe cards have no chapters to organize, so theirs is just the grid.
  const organizing = cookbookMode;
  const viewRef = useRef<HTMLElement | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [top, setTop] = useState(0);
  const [cols, setCols] = useState(3);
  const [tileW, setTileW] = useState(MIN_TILE);
  const [selected, setSelected] = useState<string[]>([]);
  const [moveAt, setMoveAt] = useState<{ x: number; y: number } | null>(null);
  const [drop, setDrop] = useState<{ recipeId?: string; after?: boolean; sectionId?: string } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Hangs straight off the bottom of the top bar, where the page count
  // becomes its tab (print.css, `html[data-pages-view]`), and runs to the
  // bottom of the screen; the bottom tools step aside while it's open.
  useLayoutEffect(() => {
    if (!open) return;
    const bar = document.querySelector<HTMLElement>(".recipe-mobile-topbar");
    if (bar) setTop(bar.getBoundingClientRect().bottom);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    root.setAttribute("data-pages-view", "");
    return () => root.removeAttribute("data-pages-view");
  }, [open]);

  // Columns from the width: three on a phone, more on a tablet.
  useEffect(() => {
    if (!open || !scroller) return;
    const measure = () => {
      const width = scroller.clientWidth - 32;
      const next = Math.max(3, Math.floor((width + GAP) / (MIN_TILE + 44 + GAP)));
      setCols(next);
      setTileW(Math.floor((width - GAP * (next - 1)) / next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [open, scroller]);

  // Opens on the page in view.
  useEffect(() => {
    if (!open || !scroller) return;
    const current = scroller.querySelector<HTMLElement>("[aria-current='page']");
    if (current) scroller.scrollTop = Math.max(0, current.offsetTop - scroller.clientHeight / 3);
  }, [open, scroller]);

  useEffect(() => {
    if (!open) setSelected([]);
  }, [open]);

  // A recipe that's been deleted leaves the selection with it.
  useEffect(() => {
    setSelected((current) => {
      const next = current.filter((id) => navItems.some((nav) => nav.kind === "recipe" && nav.recipeId === id));
      return next.length === current.length ? current : next;
    });
  }, [navItems]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pressChapter = useLongPress<string>((point, sectionId) => onChapterMenu?.(point, sectionId));

  // Press and hold a recipe in Organize to drag it. Its own touch listeners,
  // not React's, so the scroll can be held still once a drag has begun.
  const dragState = useRef<{
    id: string;
    tile: HTMLElement;
    startX: number;
    startY: number;
    timer: number | null;
    live: boolean;
    raf: number;
    x: number;
    y: number;
  } | null>(null);
  const dropRef = useRef(drop);
  dropRef.current = drop;
  const reorderRef = useRef({ onReorderRecipe, itemIdsForSection, sectionOfNav, navItems });
  reorderRef.current = { onReorderRecipe, itemIdsForSection, sectionOfNav, navItems };
  useEffect(() => {
    if (!open || !organizing || !scroller) return;
    const targetAt = (x: number, y: number) => {
      const hit = document.elementFromPoint(x, y);
      const tile = hit?.closest<HTMLElement>("[data-drop-recipe]");
      if (tile) {
        const box = tile.getBoundingClientRect();
        return { recipeId: tile.dataset.dropRecipe!, after: x > box.left + box.width / 2 };
      }
      const head = hit?.closest<HTMLElement>("[data-drop-section]");
      if (head) return { sectionId: head.dataset.dropSection! };
      return null;
    };
    const autoScroll = () => {
      const state = dragState.current;
      if (!state?.live) return;
      const box = scroller.getBoundingClientRect();
      const edge = 56;
      if (state.y < box.top + edge) scroller.scrollTop -= 8;
      else if (state.y > box.bottom - edge) scroller.scrollTop += 8;
      state.raf = requestAnimationFrame(autoScroll);
    };
    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      const tile = (event.target as Element | null)?.closest<HTMLElement>("[data-drop-recipe]");
      if (!touch || !tile || event.touches.length !== 1) return;
      const state = {
        id: tile.dataset.dropRecipe!,
        tile,
        startX: touch.clientX,
        startY: touch.clientY,
        timer: null as number | null,
        live: false,
        raf: 0,
        x: touch.clientX,
        y: touch.clientY,
      };
      state.timer = window.setTimeout(() => {
        state.live = true;
        tile.classList.add("is-dragging");
        setDragging(state.id);
        state.raf = requestAnimationFrame(autoScroll);
      }, DRAG_HOLD_MS);
      dragState.current = state;
    };
    const onMove = (event: TouchEvent) => {
      const state = dragState.current;
      const touch = event.touches[0];
      if (!state || !touch) return;
      state.x = touch.clientX;
      state.y = touch.clientY;
      if (!state.live) {
        // Moved before the hold: it's a scroll.
        if (Math.hypot(touch.clientX - state.startX, touch.clientY - state.startY) > 10) {
          if (state.timer) window.clearTimeout(state.timer);
          dragState.current = null;
        }
        return;
      }
      event.preventDefault();
      state.tile.style.transform = `translate(${touch.clientX - state.startX}px, ${touch.clientY - state.startY}px)`;
      const target = targetAt(touch.clientX, touch.clientY);
      setDrop(target && target.recipeId !== state.id ? target : null);
    };
    const finish = (commit: boolean) => {
      const state = dragState.current;
      dragState.current = null;
      if (!state) return;
      if (state.timer) window.clearTimeout(state.timer);
      cancelAnimationFrame(state.raf);
      state.tile.style.transform = "";
      state.tile.classList.remove("is-dragging");
      setDragging(null);
      const target = dropRef.current;
      setDrop(null);
      if (!commit || !state.live || !target) return;
      const { onReorderRecipe: reorder, itemIdsForSection: idsOf, sectionOfNav: sectionOf, navItems: navs } =
        reorderRef.current;
      if (target.sectionId) {
        reorder(state.id, target.sectionId, 0);
        return;
      }
      const onto = navs.find((nav) => nav.kind === "recipe" && nav.recipeId === target.recipeId);
      const sectionId = onto ? sectionOf(onto) : null;
      if (!sectionId || !target.recipeId) return;
      const ids = idsOf(sectionId).filter((id) => id !== state.id);
      const at = ids.indexOf(target.recipeId);
      if (at === -1) return;
      reorder(state.id, sectionId, at + (target.after ? 1 : 0));
    };
    const onEnd = (event: TouchEvent) => {
      if (dragState.current?.live) event.preventDefault();
      finish(true);
    };
    const onCancel = () => finish(false);
    scroller.addEventListener("touchstart", onStart, { passive: true });
    scroller.addEventListener("touchmove", onMove, { passive: false });
    scroller.addEventListener("touchend", onEnd, { passive: false });
    scroller.addEventListener("touchcancel", onCancel);
    return () => {
      scroller.removeEventListener("touchstart", onStart);
      scroller.removeEventListener("touchmove", onMove);
      scroller.removeEventListener("touchend", onEnd);
      scroller.removeEventListener("touchcancel", onCancel);
      finish(false);
    };
  }, [open, organizing, scroller]);

  if (!open) return null;

  // Group the book: the front matter, then each chapter (or the recipes in no
  // chapter) under its heading, then the back cover.
  const named = sections.filter((section) => section.title?.trim());
  const groups: Group[] = [];
  const missing = cookbookMode ? [...missingBookPages] : [];
  const groupFor = (nav: NavItem): { key: string; sectionId: string | null; heading: string | null } => {
    if (!cookbookMode) return { key: "all", sectionId: null, heading: null };
    if (nav.kind === "toc" || (nav.kind === "cover" && coverSideOf(nav) !== "back")) {
      return { key: "front", sectionId: null, heading: null };
    }
    if (nav.kind === "cover") return { key: "back", sectionId: null, heading: null };
    const sectionId = sectionOfNav(nav);
    const section = sectionId ? sections.find((entry) => entry.id === sectionId) : undefined;
    const title = section?.title?.trim();
    if (sectionId && title) return { key: sectionId, sectionId, heading: title };
    return { key: "loose", sectionId: sectionId ?? null, heading: named.length > 0 ? NOT_IN_A_CHAPTER_LABEL : null };
  };
  navItems.forEach((nav, index) => {
    if (!sheets[nav.sheetIndex]) return;
    const at = groupFor(nav);
    let group = groups[groups.length - 1];
    if (!group || group.key !== at.key) {
      group = { key: at.key, sectionId: at.sectionId, heading: at.heading, tiles: [] };
      groups.push(group);
    }
    if (at.key === "front" || at.key === "back") {
      const order = frontOrder(nav);
      missing
        .filter((page) => SLOT_ORDER[page] < order)
        .forEach((page) => {
          missing.splice(missing.indexOf(page), 1);
          group.tiles.push({ add: page });
        });
    }
    group.tiles.push({ nav, index });
  });
  // An empty chapter still has a heading to drop onto, in book order.
  named.forEach((section) => {
    if (groups.some((group) => group.key === section.id)) return;
    const backAt = groups.findIndex((group) => group.key === "back");
    const empty: Group = { key: section.id, sectionId: section.id, heading: section.title!.trim(), tiles: [] };
    if (backAt === -1) groups.push(empty);
    else groups.splice(backAt, 0, empty);
  });
  if (missing.length) {
    const last = groups.find((group) => group.key === "back") ?? (() => {
      const back: Group = { key: "back", sectionId: null, heading: null, tiles: [] };
      groups.push(back);
      return back;
    })();
    missing.forEach((page) => last.tiles.push({ add: page }));
  }

  const scale = tileW / PAGE_DIMS[cardSize].w;
  const tileH = Math.round(tileW * (PAGE_DIMS[cardSize].h / PAGE_DIMS[cardSize].w));
  const toggle = (id: string) =>
    setSelected((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const destinations = moveAt
    ? recipeMoveDestinations(selected, sections, itemIdsForSection, (itemId) => {
        const nav = navItems.find((entry) => entry.kind === "recipe" && entry.recipeId === itemId);
        const sectionId = nav ? sectionOfNav(nav) : null;
        return sectionId ? sections.find((section) => section.id === sectionId)?.title?.trim() : undefined;
      })
    : [];

  return (
    <>
    {/* Everything outside the sheet dims and closes it when tapped, so the
        sheet is plainly what to look at. */}
    <button type="button" className="recipe-pages-view__scrim no-print" aria-label="Close pages" onClick={onClose} />
    <section
      ref={viewRef}
      className="recipe-pages-view no-print"
      style={{ top }}
      aria-label="Pages"
    >
      <div className="recipe-pages-view__head">
        <h2 className="recipe-pages-view__title">Pages</h2>
        <button type="button" className="icon-close-btn" aria-label="Close pages" onClick={onClose}>
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>
      {organizing && (
        <p className="recipe-pages-view__hint">
          Tap a page to go to it. Tick recipes to move them, or press and hold one to drag it.
        </p>
      )}
      <div ref={setScroller} className="recipe-pages-view__scroll">
        {groups.map((group) => (
          <div key={group.key} className="recipe-pages-view__group">
            {group.heading && (
              <div
                className={`recipe-pages-view__heading rp-long-press ${
                  drop?.sectionId && drop.sectionId === group.sectionId ? "is-drop-target" : ""
                }`}
                data-drop-section={group.sectionId ?? undefined}
                {...(group.sectionId && group.key !== "loose" && onChapterMenu ? pressChapter(group.sectionId) : {})}
              >
                {organizing && group.sectionId && group.key !== "loose" ? (
                  <ChapterNameInput
                    data-chapter-name-input={group.sectionId}
                    className="recipe-pages-view__chapter-name"
                    value={sections.find((section) => section.id === group.sectionId)?.title ?? ""}
                    placeholder="Chapter name"
                    aria-label="Chapter name"
                    onRename={(value) => onRenameChapter(group.sectionId!, value)}
                  />
                ) : (
                  <h3>{group.heading}</h3>
                )}
                {group.sectionId && group.key !== "loose" && onChapterMenu && (
                  <button
                    type="button"
                    className="icon-button icon-button--bare recipe-pages-view__chapter-more"
                    aria-label={`Actions for ${group.heading}`}
                    onClick={(event) => {
                      const box = event.currentTarget.getBoundingClientRect();
                      onChapterMenu({ x: box.right - 200, y: box.bottom + 4 }, group.sectionId!);
                    }}
                  >
                    <MoreHorizontalIcon size={ICON_SIZE.md} />
                  </button>
                )}
              </div>
            )}
            {group.tiles.length === 0 ? (
              <p className="recipe-pages-view__empty" data-drop-section={group.sectionId ?? undefined}>
                {organizing ? "Drag a recipe here." : "No recipes yet."}
              </p>
            ) : (
              <ol className="recipe-pages-view__grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {group.tiles.map((tile) => {
                  if ("add" in tile) {
                    return (
                      <li key={`add-${tile.add}`}>
                        <button
                          type="button"
                          className="recipe-pages-view__add"
                          style={{ height: tileH }}
                          onClick={() => onAddBookPage(tile.add)}
                        >
                          <PlusIcon size={ICON_SIZE.sm} />
                          {BOOK_PAGE_ADD_LABEL[tile.add]}
                        </button>
                      </li>
                    );
                  }
                  const { nav, index } = tile;
                  const sheet = sheets[nav.sheetIndex];
                  const isRecipe = nav.kind === "recipe";
                  const picked = isRecipe && selected.includes(nav.recipeId);
                  const dropHere = isRecipe && drop?.recipeId === nav.recipeId;
                  return (
                    <li
                      key={`${nav.kind}-${nav.recipeId}-${nav.sheetIndex}-${nav.slotIndex}`}
                      className={`${dropHere ? (drop?.after ? "is-drop-after" : "is-drop-before") : ""} ${
                        dragging === nav.recipeId ? "is-dragging-source" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className={`recipe-pages-view__page rp-long-press ${picked ? "is-selected" : ""}`}
                        aria-current={index === currentNavIndex ? "page" : undefined}
                        data-drop-recipe={organizing && isRecipe ? nav.recipeId : undefined}
                        onClick={() => {
                          // Once something's ticked, taps tick more (a page
                          // that can't be ticked stays put), as on Pinterest.
                          if (selected.length > 0) {
                            if (isRecipe) toggle(nav.recipeId);
                            return;
                          }
                          onClose();
                          onGoToPage(index);
                        }}
                      >
                        <span className="recipe-pages-view__frame" style={{ height: tileH }}>
                          <LazyThumb root={scroller}>
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
                        </span>
                        <span className="recipe-pages-view__label">{nav.label}</span>
                      </button>
                      {organizing && isRecipe && (
                        <button
                          type="button"
                          className={`recipe-pages-view__check ${picked ? "is-checked" : ""}`}
                          aria-pressed={picked}
                          aria-label={`Select ${nav.label}`}
                          onClick={() => toggle(nav.recipeId)}
                        >
                          {picked && <CheckIcon size={ICON_SIZE.sm} />}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        ))}
      </div>
      {organizing && (
        <div className="recipe-pages-view__bar">
          {selected.length > 0 ? (
            <>
              <span className="recipe-pages-view__count">
                {selected.length} selected
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  setMoveAt({ x: box.left, y: box.top - 8 });
                }}
              >
                Move to chapter
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-ghost--danger btn-compact"
                // The selection stays until they're gone: cancelling the
                // confirm keeps what was ticked.
                onClick={() => onDeleteRecipes(selected)}
              >
                <TrashIcon size={ICON_SIZE.sm} />
                Delete
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary btn-compact" onClick={onAddChapter}>
              <PlusIcon size={ICON_SIZE.sm} />
              Add chapter
            </button>
          )}
        </div>
      )}
      {moveAt && (
        <MoveToSectionMenu
          anchor={moveAt}
          heading={selected.length > 1 ? `Move ${selected.length} recipes to` : "Move to"}
          sections={destinations}
          onMove={(sectionId) => {
            onMoveRecipes(selected, sectionId === NOT_IN_A_CHAPTER ? NOT_IN_A_CHAPTER : sectionId);
            setSelected([]);
          }}
          onNewSection={() => {
            onNewChapterFrom(selected);
            setSelected([]);
          }}
          onClose={() => setMoveAt(null)}
        />
      )}
    </section>
    </>
  );
}
