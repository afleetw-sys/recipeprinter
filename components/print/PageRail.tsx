"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripIcon,
  RefreshIcon,
  ICON_SIZE,
  PlusIcon,
  SortIcon,
  TrashIcon,
} from "@/components/icons";
import { IconButton } from "@/components/Controls";
import { ScaledPage } from "@/components/print/ScaledPage";
import { PendingImportRows } from "@/components/print/PendingImportRows";
import { PAGE_DIMS } from "@/lib/printGeometry";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { NavItem, usePrintSheets } from "@/lib/usePrintSheets";
import type { useProjectMeta } from "@/lib/project";
import type { useRailDrag } from "@/lib/useRailDrag";
import type { useRailSelection } from "@/lib/useRailSelection";
import type { useQueue } from "@/lib/queue";
import type { QueueItem, Section } from "@/types/recipe";

// Rail thumbnails target a fixed width so they always fit the rail column,
// regardless of page aspect ratio (letter portrait vs. 6x4 landscape).
const RAIL_THUMB_WIDTH = 112;
// The rail thumbnail zooms past fit-to-width and crops (see the
// `.recipe-page-rail__thumb .recipe-page-scaler` rule) so it reads as a real
// mini card — the top-left of the page — rather than a whole card shrunk to a
// stamp. Keep the crop box (74px) in sync with the CSS.
const RAIL_THUMB_ZOOM = 1.7;
const RAIL_SCALE: Record<PrintCardSize, number> = {
  letter: (RAIL_THUMB_WIDTH / PAGE_DIMS.letter.w) * RAIL_THUMB_ZOOM,
  "card-6x4": (RAIL_THUMB_WIDTH / PAGE_DIMS["card-6x4"].w) * RAIL_THUMB_ZOOM,
};

// How far outside the rail's scroll viewport a thumbnail starts rendering, so it
// is ready before it scrolls into view (no visible pop-in).
const RAIL_THUMB_OVERSCAN = "600px 0px";

/** How the organizer orders the recipes inside each section: the cook's own
    arrangement, or A–Z by recipe title. Section order is never touched. */
export type RailSortMode = "custom" | "title";

const RAIL_SORT_OPTIONS: Array<{ value: RailSortMode; label: string }> = [
  { value: "custom", label: "Custom order" },
  { value: "title", label: "A–Z by title" },
];

// A thumbnail is the bulk of a rail row's DOM (a full scaled card render, plus
// its own column-split measurement) and there can be dozens in one book. This
// mounts the real thumbnail only once its row nears the viewport, holding the
// exact same footprint until then with an empty `.recipe-page-scaler` box (the
// rail CSS pins that box to a fixed 112×74, independent of content — so row
// height and drag/hit geometry are unchanged). Reveal-and-keep, NOT windowed:
// once shown a thumbnail stays mounted, so scrolling never re-runs its
// measurement. The row shells and every `data-rail-*` hook the drag/selection
// code reads stay mounted throughout — only the heavy paint is deferred.
function LazyRailThumb({
  scrollRef,
  className,
  placeholder,
  children,
}: {
  scrollRef: MutableRefObject<HTMLElement | null>;
  className: string;
  placeholder: ReactNode;
  children: ReactNode;
}) {
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
      { root: scrollRef.current ?? null, rootMargin: RAIL_THUMB_OVERSCAN },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollRef, shown]);
  return (
    <span ref={ref} className={className}>
      {shown ? children : placeholder}
    </span>
  );
}

interface PageRailProps {
  railScrollRef: MutableRefObject<HTMLElement | null>;
  railDrag: ReturnType<typeof useRailDrag>;
  railSelection: ReturnType<typeof useRailSelection>;
  previewCardSize: PrintCardSize;
  cardSize: PrintCardSize;
  previewTemplate: RecipePrintTemplate;
  continueOnBack: boolean;
  previewSourceUrlOn: boolean;
  organizeMode: boolean;
  enterOrganizeMode: () => void;
  exitOrganizeMode: () => void;
  projectMeta: ReturnType<typeof useProjectMeta>;
  addCover: () => void;
  cookbookView: boolean;
  navItems: ReturnType<typeof usePrintSheets>["navItems"];
  navIndexForSheet: Map<number, number>;
  railRows: Array<{ header?: string; navItem: NavItem; index: number }>;
  sheets: ReturnType<typeof usePrintSheets>["sheets"];
  spreads: ReturnType<typeof usePrintSheets>["spreads"];
  sections: Section[];
  sectionForNavItem: (navItem: NavItem | null) => { id: string; index: number } | null;
  sectionAndIndexForItem: (itemId: string) => { sectionId: string; index: number } | null;
  sectionTitleForId: (sectionId: string) => string;
  itemIdsForSection: (sectionId: string) => string[];
  renameSectionEverywhere: (sectionId: string, value: string) => void;
  requestDeleteSection: (sectionId: string) => void;
  activeNavIndex: number;
  focusedSheet: number | null;
  focusSheetInSpread: (spreadIndex: number, sheetIndex: number | null) => void;
  goToSlide: (index: number) => void;
  railShake: { recipeId: string; nonce: number } | null;
  pendingAddAfterRecipeId: string | null;
  pendingImportItems: QueueItem[];
  queue: ReturnType<typeof useQueue>;
  setPendingAddSectionId: Dispatch<SetStateAction<string | null>>;
  setPendingAddIndex: Dispatch<SetStateAction<number | null>>;
  setPendingAddAfterRecipeId: Dispatch<SetStateAction<string | null>>;
  setShowAddRecipeDialog: Dispatch<SetStateAction<boolean>>;
  openAddRecipeBelow: (navItem?: NavItem | null) => void;
  addSectionDivider: () => void;
  makeSectionFromSelection: (selection?: ReadonlySet<string>) => void;
  /** Tile-menu move: drops `ids` at the end of `sectionId`, in book order. */
  moveRecipesToSection: (ids: string[], sectionId: string) => void;
  railSortMode: RailSortMode;
  applyRailSort: (mode: RailSortMode) => void;
  addMenuOpen: boolean;
  /** Sorts the book into sections and orders it — see `suggestCookbookLayout`. */
  suggestCookbookLayout: () => void;
  undoCookbookOrganization: () => void;
  /** True once an auto-organize has run and its "before" snapshot is still held. */
  canUndoOrganization: boolean;
  setAddMenuOpen: Dispatch<SetStateAction<boolean>>;
  addMenuRef: MutableRefObject<HTMLDivElement | null>;
}

// The left rail: a scrollable page list (reorder / structure) plus the
// add-recipe / add-section / organize footer. Hidden on phones (see the
// MobileStructureSheet). Two render paths — the cookbook spread view (grouped
// mini two-page thumbnails, pointer-drag reorder + multi-select) and the flat
// card view (single-page thumbnails, HTML5 drag-and-drop).
export function PageRail(props: PageRailProps) {
  const {
    railScrollRef,
    railDrag,
    railSelection,
    previewCardSize,
    cardSize,
    previewTemplate,
    continueOnBack,
    previewSourceUrlOn,
    organizeMode,
    enterOrganizeMode,
    exitOrganizeMode,
    projectMeta,
    addCover,
    cookbookView,
    navItems,
    navIndexForSheet,
    railRows,
    sheets,
    spreads,
    sections,
    sectionForNavItem,
    sectionAndIndexForItem,
    sectionTitleForId,
    itemIdsForSection,
    renameSectionEverywhere,
    requestDeleteSection,
    activeNavIndex,
    focusedSheet,
    focusSheetInSpread,
    goToSlide,
    railShake,
    pendingAddAfterRecipeId,
    pendingImportItems,
    queue,
    setPendingAddSectionId,
    setPendingAddIndex,
    setPendingAddAfterRecipeId,
    setShowAddRecipeDialog,
    openAddRecipeBelow,
    addSectionDivider,
    makeSectionFromSelection,
    moveRecipesToSection,
    railSortMode,
    applyRailSort,
    addMenuOpen,
    suggestCookbookLayout,
    undoCookbookOrganization,
    canUndoOrganization,
    setAddMenuOpen,
    addMenuRef,
  } = props;
  const {
    selectedRailIds,
    effectiveRailSelection,
    setRailAnchorId,
    toggleRailSelection,
    selectRailRange,
    clearRailSelection,
    orderedRailSelection,
  } = railSelection;

  // A drag that started on a selected recipe carries every selected recipe, so
  // every one of them is a source and dims — not just the card under the
  // pointer (see `resolveRailDrop`).
  const draggingSelection =
    railDrag.draggingKind === "recipe" &&
    railDrag.draggingId != null &&
    effectiveRailSelection.has(railDrag.draggingId);
  const isDragSource = (recipeId: string | null | undefined) =>
    Boolean(recipeId) &&
    railDrag.draggingKind === "recipe" &&
    (railDrag.draggingId === recipeId || (draggingSelection && effectiveRailSelection.has(recipeId!)));

  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!sortMenuOpen) return;
    const close = () => setSortMenuOpen(false);
    const onPointerDown = (event: PointerEvent) => {
      if (!sortMenuRef.current?.contains(event.target as Node)) close();
    };
    // Capture Escape ahead of the page's handler, so closing this menu doesn't
    // also clear a selection the cook is still working with.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [sortMenuOpen]);

  // Right-clicking a tile in the organizer offers the drag's destinations as a
  // list — the same moves, for a book too long to drag across. The ids are
  // captured when the menu opens so it acts on what was right-clicked even if
  // the selection changes underneath it.
  const [tileMenu, setTileMenu] = useState<
    { x: number; y: number; ids: string[]; label: string } | null
  >(null);
  const tileMenuRef = useRef<HTMLDivElement | null>(null);

  function openTileMenu(event: ReactMouseEvent, recipeId: string, label: string) {
    event.preventDefault();
    // Right-clicking outside the selection acts on that one recipe (and drops
    // the selection), the way file managers have always behaved.
    const inSelection = effectiveRailSelection.has(recipeId);
    if (!inSelection) clearRailSelection();
    const ids = inSelection ? orderedRailSelection() : [recipeId];
    setTileMenu({
      x: event.clientX,
      y: event.clientY,
      ids,
      label: ids.length > 1 ? `Move ${ids.length} recipes to` : `Move ${label} to`,
    });
  }

  // Keep the menu on screen: it opens at the pointer, so near the right or
  // bottom edge it has to come back inside once its real size is known.
  useLayoutEffect(() => {
    const node = tileMenuRef.current;
    if (!node || !tileMenu) return;
    const rect = node.getBoundingClientRect();
    node.style.left = `${Math.max(8, Math.min(tileMenu.x, window.innerWidth - rect.width - 8))}px`;
    node.style.top = `${Math.max(8, Math.min(tileMenu.y, window.innerHeight - rect.height - 8))}px`;
  }, [tileMenu]);

  useEffect(() => {
    if (!tileMenu) return;
    const close = () => setTileMenu(null);
    const onPointerDown = (event: PointerEvent) => {
      if (!tileMenuRef.current?.contains(event.target as Node)) close();
    };
    // Capture Escape before the page's own handler, so closing the menu doesn't
    // also clear the selection the menu was about to act on.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    // Anything scrolling underneath moves the tile the menu points at — except
    // the menu's own scroll when it holds more sections than fit.
    const onScroll = (event: Event) => {
      if (tileMenuRef.current?.contains(event.target as Node)) return;
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    document.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [tileMenu]);

  const tileMenuSections = tileMenu
    ? sections.filter((section) => {
        const ids = itemIdsForSection(section.id);
        // A section every moved recipe is already in has nowhere to move them.
        return !tileMenu.ids.every((id) => ids.includes(id));
      })
    : [];

  /**
   * The page number a thumbnail stands for.
   *
   * Not its position in the rail. Those are different numbers and they drift
   * apart in both directions: the rail counts the cover and the contents,
   * which print no folio, so it runs ahead — and a facing full-page photo has
   * no tile of its own, so it runs behind.
   *
   * Front matter says nothing rather than borrowing a position and calling it
   * a page.
   */
  const railPageLabel = (navItem: NavItem): string => {
    const page = sheets[navItem.sheetIndex]?.pageNumber;
    return page === undefined ? "" : String(page);
  };

  return (
        <nav
          ref={railScrollRef}
          className={`recipe-page-rail recipe-page-rail--${previewCardSize} no-print ${
            railDrag.draggingId ? "recipe-page-rail--dragging" : ""
          }`}
          aria-label="Pages"
        >
          {/* What is in this project, and the two things you do to it as a
              WHOLE — add to it, and rearrange it. They were at the very bottom
              of the rail, below every thumbnail, which put "Add recipes" an
              entire book's worth of scrolling away from the top of the list it
              adds to. Sticky rather than moved outside the scroller: this
              `<nav>` IS the scroll container (`railScrollRef`, which the deck's
              scroll-sync reads), and lifting the header out of it would mean
              restructuring that relationship for a visual result sticky already
              gives. */}
          {!organizeMode && (
            <div className="recipe-page-rail__head">
              {/* Adding a recipe gets the rail's full width. It had been
                  squeezed onto one line beside a recipe count, which cost the
                  primary action of this panel most of its size to state a
                  number you can also just see in the list underneath. */}
              <div className="recipe-page-rail__head-actions">
            <div className="recipe-page-rail__add-row" ref={addMenuRef}>
              <button
                type="button"
                /* `btn-compact` like every other button in the chrome; it was
                   the only one without it and sat a size larger than Save and
                   Print for no visible reason. */
                className={`btn btn-secondary btn-compact recipe-page-rail__add-main ${
                  projectMeta.meta.cookbookMode ? "recipe-page-rail__add-main--paired" : ""
                }`}
                onClick={() => {
                  setAddMenuOpen(false);
                  openAddRecipeBelow();
                }}
              >
                {/* `md`, the size Save and Buy & Print use for theirs. The type
                    already matched them; the icon was a step down, which made the
                    whole button read as smaller than the ones in the header. */}
                <PlusIcon size={ICON_SIZE.md} />
                Add recipes
              </button>
              {/* In a cookbook the section action folds into a split-button
                  overflow, so the primary control reads plainly as "Add recipes". */}
              {projectMeta.meta.cookbookMode && organizeMode && (
                <button
                  type="button"
                  className="btn btn-secondary recipe-page-rail__add-section"
                  data-rail-new-section
                  onClick={() => {
                    if (effectiveRailSelection.size > 0) makeSectionFromSelection();
                    else addSectionDivider();
                  }}
                >
                  <PlusIcon size={ICON_SIZE.md} />
                  Add section
                </button>
              )}
              {projectMeta.meta.cookbookMode && !organizeMode && (
                <>
                  <button
                    type="button"
                    className="recipe-page-rail__add-menu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={addMenuOpen}
                    aria-label="More add options"
                    onClick={() => setAddMenuOpen((open) => !open)}
                  >
                    <ChevronDownIcon size={ICON_SIZE.sm} />
                  </button>
                  {addMenuOpen && (
                    <div className="recipe-page-rail__add-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAddMenuOpen(false);
                          addSectionDivider();
                        }}
                      >
                        <PlusIcon size={ICON_SIZE.sm} />
                        Add section
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            </div>
            {projectMeta.meta.cookbookMode && (
              <button
                type="button"
                className="recipe-page-rail__organize"
                onClick={enterOrganizeMode}
              >
                <span>Organize recipes</span>
                <ChevronRightIcon size={ICON_SIZE.sm} />
              </button>
            )}
            </div>
          )}

          {organizeMode && (
            <div className="recipe-organize-bar">
              <div className="recipe-organize-bar__heading">
                <span className="recipe-organize-bar__title">Organize recipes</span>
              </div>
              <div className="recipe-organize-bar__actions">
                {/* Sort: the cook's own arrangement, or A–Z inside every
                    section. It reorders the book itself, so switching back to
                    "Custom order" restores the order A–Z replaced. The menu
                    says out loud that this works within sections — the fear it
                    answers is "will this shuffle my chapters?". */}
                <div className="recipe-organize-bar__sort" ref={sortMenuRef}>
                  <IconButton
                    aria-label="Sort recipes"
                    title="Sort recipes"
                    aria-haspopup="menu"
                    aria-expanded={sortMenuOpen}
                    selected={sortMenuOpen || railSortMode !== "custom"}
                    onClick={() => setSortMenuOpen((open) => !open)}
                  >
                    <SortIcon size={ICON_SIZE.md} />
                  </IconButton>
                  {sortMenuOpen && (
                    <div className="recipe-organize-bar__sort-menu" role="menu">
                      <p className="recipe-organize-bar__sort-heading">Sort recipes</p>
                      {RAIL_SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={railSortMode === option.value}
                          className={railSortMode === option.value ? "is-active" : ""}
                          onClick={() => {
                            applyRailSort(option.value);
                            setSortMenuOpen(false);
                          }}
                        >
                          <span className="recipe-organize-bar__sort-check">
                            {railSortMode === option.value && <CheckIcon size={ICON_SIZE.sm} />}
                          </span>
                          {option.label}
                        </button>
                      ))}
                      <p className="recipe-organize-bar__sort-note">
                        Sorts the recipes inside each section. Your sections stay in the order you
                        put them.
                      </p>
                    </div>
                  )}
                </div>
                {/* Auto-organize belongs to the organizer, not the rail. Out
                    there it sat next to "Organize recipes" — a second, similar
                    label competing with the thing that opens this — and offered
                    to rearrange a book the cook could not see being rearranged.
                    In here the result is right in front of them, and so is the
                    Undo. */}
                <button
                  type="button"
                  className="recipe-organize-bar__auto"
                  onClick={canUndoOrganization ? undoCookbookOrganization : suggestCookbookLayout}
                >
                  <RefreshIcon size={ICON_SIZE.sm} />
                  <span>{canUndoOrganization ? "Undo organizing" : "Organize it for me"}</span>
                </button>
                {/* Icon-only, so it wears the icon button rather than a
                    button-shaped exception beside Sort and Organize. */}
                <IconButton
                  className="recipe-organize-bar__collapse"
                  onClick={exitOrganizeMode}
                  aria-label="Collapse organizer"
                  title="Collapse organizer"
                >
                  <ChevronLeftIcon size={ICON_SIZE.md} />
                </IconButton>
              </div>
            </div>
          )}
          {projectMeta.meta.cookbookMode && !projectMeta.meta.cover && (
            <button
              type="button"
              className="recipe-page-rail__add-cover"
              onClick={() => {
                setAddMenuOpen(false);
                addCover();
              }}
            >
              <PlusIcon size={ICON_SIZE.sm} />
              Add cover
            </button>
          )}
          {cookbookView
            ? (() => {
                const navFor = (sheetIndex: number | null) =>
                  sheetIndex != null && navIndexForSheet.has(sheetIndex)
                    ? navItems[navIndexForSheet.get(sheetIndex)!]
                    : null;
                const namedSectionIdFor = (nav: NavItem | null) => {
                  // An opener page (divider) belongs to the section it titles, so
                  // it groups WITH that section's recipes — the whole block then
                  // drags as one unit and carries a single `data-rail-section`.
                  if (nav?.kind === "divider") {
                    const section = sections.find((entry) => entry.id === nav.recipeId);
                    return section && (organizeMode || section.title?.trim()) ? section.id : null;
                  }
                  const found = nav?.kind === "recipe" ? sectionForNavItem(nav) : null;
                  return found && (organizeMode || sections[found.index]?.title?.trim()) ? found.id : null;
                };
                // One rail entry per LOGICAL unit: an image-spread (a recipe's
                // full-page photo + the recipe) is ONE unit shown as a mini
                // two-page thumbnail; a spread of two independent pages
                // (dedication + contents, or two different recipes) splits into
                // one single-page thumbnail each.
                type RailUnit = {
                  /** The page this tile starts at. A tile can hold two pages —
                      a photo and its recipe, an opener and its facing photo —
                      and it is labelled with the first of them, so the numbers
                      down the rail read 8, 10, 12 rather than 8–9, 10–11. The
                      second page of a pair has no separate tile to sit on, so
                      naming it would be labelling something you cannot go to. */
                  num: string;
                  index: number;
                  focusSheet: number | null;
                  nav: NavItem | null;
                  thumbSheets: number[];
                  label: string;
                  soleUnit: boolean;
                  sectionId: string | null;
                };
                /** The first page a tile stands for, or nothing when it stands
                    for front matter that carries no folio. */
                const startPageLabel = (thumbSheets: number[]): string => {
                  const pages = thumbSheets
                    .map((sheetIndex) => sheets[sheetIndex]?.pageNumber)
                    .filter((page): page is number => page !== undefined);
                  return pages.length === 0 ? "" : String(Math.min(...pages));
                };
                const rawUnits: RailUnit[] = [];
                const addUnit = (unit: Omit<RailUnit, "num">) =>
                  rawUnits.push({ ...unit, num: startPageLabel(unit.thumbSheets) });
                spreads.forEach((spread, index) => {
                  const leftNav = navFor(spread.left);
                  const rightNav = navFor(spread.right);
                  const leftIsImage = spread.left != null && sheets[spread.left]?.layoutKind === "image";
                  const rightIsImage = spread.right != null && sheets[spread.right]?.layoutKind === "image";
                  // A chapter opener paired with its real facing full-page/grid
                  // photo — like an image spread, shown as one rail unit (opener +
                  // photo thumbs) that focuses the opener.
                  const isSectionSpread =
                    leftNav?.kind === "divider" &&
                    spread.right != null &&
                    sheets[spread.right]?.layoutKind === "section-photo";
                  if (leftIsImage || rightIsImage) {
                    const recipeSheet = leftIsImage ? spread.right : spread.left;
                    const recipeNav = [rightNav, leftNav].find((item) => item?.kind === "recipe") ?? null;
                    addUnit({
                      index,
                      focusSheet: recipeSheet,
                      nav: recipeNav,
                      thumbSheets: [spread.left, spread.right].filter((s): s is number => s != null),
                      label: recipeNav?.label ?? "Recipe",
                      soleUnit: true,
                      sectionId: namedSectionIdFor(recipeNav),
                    });
                  } else if (isSectionSpread && spread.left != null) {
                    addUnit({
                      index,
                      focusSheet: spread.left,
                      nav: leftNav,
                      thumbSheets: [spread.left, spread.right].filter((s): s is number => s != null),
                      label: leftNav?.label ?? "Section",
                      soleUnit: true,
                      sectionId: namedSectionIdFor(leftNav),
                    });
                  } else if (spread.single) {
                    const nav = rightNav ?? leftNav;
                    const sheet = spread.right ?? spread.left;
                    addUnit({
                      index,
                      focusSheet: sheet,
                      nav,
                      thumbSheets: sheet != null ? [sheet] : [],
                      label: nav?.label ?? "Page",
                      soleUnit: true,
                      sectionId: namedSectionIdFor(nav),
                    });
                  } else {
                    const sides = [
                      { sheet: spread.left, nav: leftNav },
                      { sheet: spread.right, nav: rightNav },
                    ].filter((side) => side.sheet != null && side.nav);
                    sides.forEach(({ sheet, nav }) =>
                      addUnit({
                        index,
                        focusSheet: sheet,
                        nav,
                        thumbSheets: [sheet as number],
                        label: nav!.label ?? "Page",
                        soleUnit: sides.length === 1,
                        sectionId: namedSectionIdFor(nav),
                      }),
                    );
                  }
                });
                // In the organizer a recipe is ONE draggable thing, so it gets
                // one tile: a recipe that runs onto a second page shows as a
                // mini-spread of its two faces rather than two tiles that can't
                // be dragged apart (both carry the same recipe id, so dragging
                // either always moved the whole recipe anyway). The page rail
                // proper keeps a row per face — there each face is its own
                // page to navigate to.
                const units: RailUnit[] = [];
                rawUnits.forEach((unit) => {
                  const previous = units[units.length - 1];
                  const recipeId = unit.nav?.kind === "recipe" ? unit.nav.recipeId : null;
                  const previousRecipeId =
                    previous?.nav?.kind === "recipe" ? previous.nav.recipeId : null;
                  if (organizeMode && recipeId && recipeId === previousRecipeId) {
                    // Two faces already fill the thumb (see --spread); a third
                    // would overflow it, and adds nothing to a stand-in.
                    previous.thumbSheets = [...previous.thumbSheets, ...unit.thumbSheets].slice(0, 2);
                    // The merged tile now owns its whole spread position.
                    // The merged tile now starts where its first face does.
                    previous.num = startPageLabel(previous.thumbSheets);
                    previous.soleUnit = true;
                    return;
                  }
                  units.push({ ...unit });
                });
                const groups: Array<{ key: string; sectionId: string | null; units: RailUnit[] }> = [];
                units.forEach((unit) => {
                  const previous = groups[groups.length - 1];
                  if (previous && unit.sectionId && previous.sectionId === unit.sectionId) {
                    previous.units.push(unit);
                  } else {
                    groups.push({
                      key: unit.sectionId ? `${unit.sectionId}-${unit.index}` : `unit-${unit.index}`,
                      sectionId: unit.sectionId,
                      units: [unit],
                    });
                  }
                });
                return groups.map((group) => (
                  <div
                    key={group.key}
                    data-rail-section={group.sectionId ?? undefined}
                    className={`recipe-page-rail__section-group ${
                      group.sectionId ? "recipe-page-rail__section-group--nested" : ""
                    } ${organizeMode && group.sectionId && !sections.find((entry) => entry.id === group.sectionId)?.title?.trim()
                      ? "recipe-page-rail__section-group--ungrouped"
                      : ""} ${railDrag.draggingKind === "section" && railDrag.draggingId === group.sectionId ? "is-dragging" : ""}`}
                  >
                  {group.units.map((unit, unitIdx) => {
                const recipeNav = unit.nav?.kind === "recipe" ? unit.nav : null;
                const dividerNav = unit.nav?.kind === "divider" ? unit.nav : null;
                const dividerSection = dividerNav ? sectionForNavItem(dividerNav) : null;
                const section = unit.sectionId
                  ? sections.find((entry) => entry.id === unit.sectionId)
                  : undefined;
                const isFirstInSection =
                  Boolean(unit.sectionId) &&
                  (unitIdx === 0 || group.units[unitIdx - 1]?.sectionId !== unit.sectionId);
                // The opener page sits at the section's head (its title), so it
                // is NOT nested under the section's indent line — only recipes
                // are. The line then starts at the first recipe below it.
                const nested = Boolean(unit.sectionId) && unit.nav?.kind !== "divider";
                const previous = group.units[unitIdx - 1];
                const prevNested = Boolean(previous?.sectionId) && previous?.nav?.kind !== "divider";
                const isFirstNested = nested && !prevNested;
                // In organize mode, show the editable section heading above its
                // recipes. In normal mode the opener page itself is the heading.
                const showSectionHeader =
                  Boolean(section?.title?.trim()) &&
                  isFirstInSection &&
                  organizeMode;
                const isActive =
                  unit.index === activeNavIndex && (unit.soleUnit || focusedSheet === unit.focusSheet);
                const isSpreadThumb = unit.thumbSheets.length === 2;
                return (
                  <div
                    key={`rail-unit-${unit.num}`}
                    data-rail-kind={unit.nav?.kind ?? "page"}
                    className={`recipe-page-rail__row ${
                      nested ? "recipe-page-rail__row--section-child" : ""
                    } ${isFirstNested ? "recipe-page-rail__row--section-first" : ""}`}
                  >
                    {showSectionHeader && section && (
                      <div className="recipe-page-rail__section-header">
                        <button
                          type="button"
                          className="recipe-page-rail__grip recipe-page-rail__grip--section"
                          aria-label={`Drag to reorder the ${section.title} section`}
                          onPointerDown={(event) => railDrag.start(event, "section", section.id)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <GripIcon size={ICON_SIZE.sm} />
                        </button>
                        {organizeMode ? (
                          <input
                            className="recipe-page-rail__section-title-input"
                            value={section.title ?? ""}
                            placeholder="Section name"
                            aria-label="Section name"
                            onChange={(event) => renameSectionEverywhere(section.id, event.target.value)}
                            onPointerDown={(event) => event.stopPropagation()}
                          />
                        ) : (
                          <span>{section.title}</span>
                        )}
                        <IconButton
                          tone="danger"
                          className="recipe-page-rail__section-delete"
                          aria-label={`Delete ${section.title || "section"}`}
                          title="Delete section"
                          onClick={(event) => {
                            event.stopPropagation();
                            requestDeleteSection(section.id);
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                        >
                          <TrashIcon size={ICON_SIZE.sm} />
                        </IconButton>
                      </div>
                    )}
                    <div
                      data-rail-recipe={recipeNav?.recipeId ?? undefined}
                      data-organize-flip={recipeNav?.recipeId ?? undefined}
                    className={`recipe-page-rail__item ${isActive ? "is-active" : ""} ${
                        isDragSource(recipeNav?.recipeId) ? "is-dragging" : ""
                      } ${(recipeNav || dividerSection) ? "recipe-page-rail__item--draggable" : ""} ${
                        recipeNav && railShake?.recipeId === recipeNav.recipeId ? "is-shaking" : ""
                      } ${recipeNav && effectiveRailSelection.has(recipeNav.recipeId) ? "is-selected" : ""}`}
                      /* Right-click moves a recipe to a section in the page
                         rail as well as in the organizer. It was gated on
                         organize mode, so the same gesture on the same tile
                         did something in one view and nothing in the other —
                         and the rail is where you spend your time, so it was
                         missing from the place people would try it first. */
                      onContextMenu={
                        recipeNav
                          ? (event) => openTileMenu(event, recipeNav.recipeId, `“${unit.label}”`)
                          : undefined
                      }
                  >
                      <button
                        type="button"
                        className="recipe-page-rail__item-main"
                        aria-current={isActive}
                        aria-pressed={recipeNav ? effectiveRailSelection.has(recipeNav.recipeId) : undefined}
                        onPointerDown={(event) => {
                          // Grab a recipe to reorder it; grab an opener page to
                          // reorder its whole section (carrying its recipes).
                          if (recipeNav) railDrag.start(event, "recipe", recipeNav.recipeId);
                          else if (dividerSection) railDrag.start(event, "section", dividerSection.id);
                        }}
                        onClick={(event) => {
                          // A completed drag isn't a click — don't also navigate.
                          if (railDrag.didDrag()) {
                            event.preventDefault();
                            return;
                          }
                          // Shift-click range-selects; Cmd/Ctrl-click toggles one;
                          // a plain click clears any selection and navigates.
                          if (recipeNav && event.shiftKey) {
                            event.preventDefault();
                            event.stopPropagation();
                            selectRailRange(recipeNav.recipeId);
                            return;
                          }
                          if (recipeNav && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleRailSelection(recipeNav.recipeId);
                            return;
                          }
                          if (selectedRailIds.size) clearRailSelection();
                          setRailAnchorId(recipeNav?.recipeId ?? null);
                          focusSheetInSpread(unit.index, unit.focusSheet);
                        }}
                      >
                        <span className="recipe-page-rail__num">{unit.num}</span>
                        <LazyRailThumb
                          scrollRef={railScrollRef}
                          className={`recipe-page-rail__thumb ${
                            isSpreadThumb ? "recipe-page-rail__thumb--spread" : ""
                          }`}
                          // One empty scaler box per real page keeps the (single
                          // or side-by-side spread) footprint until it scrolls in.
                          placeholder={unit.thumbSheets.map((sheetIndex, thumbIdx) =>
                            sheets[sheetIndex] ? (
                              <div key={thumbIdx} className="recipe-page-scaler" aria-hidden />
                            ) : null,
                          )}
                        >
                          {unit.thumbSheets.map((sheetIndex, thumbIdx) =>
                            sheets[sheetIndex] ? (
                              <ScaledPage
                                key={thumbIdx}
                                sheet={sheets[sheetIndex]}
                                isLastSheet={sheetIndex === sheets.length - 1}
                                activeSlotIndex={0}
                                activeSide="front"
                                // Same zoom as a single thumb — a mini-spread just
                                // crops each page into a half-width window (see the
                                // --spread scaler rule) so both fit side by side.
                                scale={RAIL_SCALE[cardSize]}
                                size={previewCardSize}
                                template={previewTemplate}
                                doubleSided={continueOnBack}
                                showSourceUrl={previewSourceUrlOn}
                                showCutLines={false}
                                // See the single-thumb note: flat stand-in only.
                                showDecoration={false}
                                cookbookMode
                              />
                            ) : null,
                          )}
                        </LazyRailThumb>
                        <span className="recipe-page-rail__label">
                          <span className="recipe-page-rail__title">{unit.label}</span>
                        </span>
                      </button>
                    </div>
                    {(recipeNav?.recipeId ?? dividerNav?.recipeId) === pendingAddAfterRecipeId && <PendingImportRows items={pendingImportItems} canRetry={queue.canRetry} onRetry={queue.retry} onRemove={queue.remove} />}
                  </div>
                );
                  })}
                  {organizeMode && group.sectionId && (
                    <button
                      type="button"
                      className="recipe-page-rail__section-add-card"
                      data-rail-section-add={group.sectionId}
                      onClick={() => {
                        setPendingAddSectionId(group.sectionId);
                        setPendingAddIndex(itemIdsForSection(group.sectionId!).length);
                        setPendingAddAfterRecipeId(itemIdsForSection(group.sectionId!).at(-1) ?? null);
                        setShowAddRecipeDialog(true);
                      }}
                      aria-label={`Add recipes to ${sectionTitleForId(group.sectionId)}`}
                    >
                      <PlusIcon size={ICON_SIZE.md} />
                      <span>Add recipes</span>
                    </button>
                  )}
                  </div>
                ));
              })()
            : railRows.map(({ header, navItem, index }) => {
            const headerSectionId =
              header && navItem.kind === "recipe" ? sectionAndIndexForItem(navItem.recipeId)?.sectionId : null;
            const currentSection = sectionForNavItem(navItem);
            const isSectionChild =
              Boolean(currentSection && sections[currentSection.index]?.title?.trim()) &&
              navItem.kind === "recipe" &&
              Boolean(currentSection && sectionTitleForId(currentSection.id) !== "section");
            return (
              <div
                key={`${sheets[navItem.sheetIndex]?.id}-${navItem.slotIndex}`}
                className={isSectionChild ? "recipe-page-rail__row recipe-page-rail__row--section-child" : "recipe-page-rail__row"}
              >
                {header && headerSectionId && (
                  <div className="recipe-page-rail__section-header">
                    <span>{header}</span>
                  </div>
                )}
                <div
                  data-rail-recipe={navItem.kind === "recipe" ? navItem.recipeId : undefined}
                  className={`recipe-page-rail__item ${
                    index === activeNavIndex ? "is-active" : ""
                  } ${railDrag.draggingId === navItem.recipeId ? "is-dragging" : ""} ${
                    navItem.kind === "recipe" ? "recipe-page-rail__item--draggable" : ""
                  } ${
                    navItem.kind === "recipe" && railShake?.recipeId === navItem.recipeId
                      ? "is-shaking"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    className="recipe-page-rail__item-main"
                    aria-current={index === activeNavIndex}
                    onPointerDown={(event) => {
                      if (navItem.kind === "recipe") railDrag.start(event, "recipe", navItem.recipeId);
                    }}
                    onClick={(event) => {
                      // A completed drag isn't a click — don't also navigate.
                      if (railDrag.didDrag()) {
                        event.preventDefault();
                        return;
                      }
                      goToSlide(index);
                    }}
                  >
                    <span className="recipe-page-rail__num">{railPageLabel(navItem)}</span>
                    <LazyRailThumb
                      scrollRef={railScrollRef}
                      className="recipe-page-rail__thumb"
                      placeholder={<div className="recipe-page-scaler" aria-hidden />}
                    >
                      <ScaledPage
                        sheet={sheets[navItem.sheetIndex]}
                        isLastSheet={navItem.sheetIndex === sheets.length - 1}
                        activeSlotIndex={navItem.slotIndex}
                        activeSide="front"
                        scale={RAIL_SCALE[cardSize]}
                        size={previewCardSize}
                        template={previewTemplate}
                        doubleSided={continueOnBack}
                        showSourceUrl={previewSourceUrlOn}
                        showCutLines={false}
                        // Rail thumbnails paint a flat CSS stand-in for the
                        // decorative layer (print.css); rendering the real one
                        // at ~1/11 scale is thousands of masked-out DOM nodes.
                        showDecoration={false}
                        cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
                      />
                    </LazyRailThumb>
                    <span className="recipe-page-rail__label">
                      <span className="recipe-page-rail__title">{navItem.label}</span>
                      <span className="recipe-page-rail__meta">{navItem.pageLabel}</span>
                    </span>
                  </button>
                </div>
                {navItem.recipeId === pendingAddAfterRecipeId && <PendingImportRows items={pendingImportItems} canRetry={queue.canRetry} onRetry={queue.retry} onRemove={queue.remove} />}
              </div>
            );
          })}

          {/* Keep pending imports visible without pretending a page or image
              exists yet. The real page appears only once parsing completes. */}
          {!pendingAddAfterRecipeId && <PendingImportRows items={pendingImportItems} canRetry={queue.canRetry} onRetry={queue.retry} onRemove={queue.remove} />}

          {tileMenu &&
            createPortal(
              <div
                ref={tileMenuRef}
                className="rail-tile-menu"
                role="menu"
                style={{ top: tileMenu.y, left: tileMenu.x }}
              >
                <p className="rail-tile-menu__heading">{tileMenu.label}</p>
                {tileMenuSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      moveRecipesToSection(tileMenu.ids, section.id);
                      setTileMenu(null);
                    }}
                  >
                    {section.title?.trim() || "Untitled section"}
                  </button>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="rail-tile-menu__new"
                  onClick={() => {
                    makeSectionFromSelection(new Set(tileMenu.ids));
                    setTileMenu(null);
                  }}
                >
                  <PlusIcon size={ICON_SIZE.sm} />
                  New section
                </button>
              </div>,
              document.body,
            )}
        </nav>
  );
}
