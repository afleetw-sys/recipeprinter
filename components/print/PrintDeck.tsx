"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type { FontScale } from "@/lib/fontScale";
import type { PhotoScale } from "@/lib/photoScale";
import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SetStateAction,
} from "react";
import Link from "next/link";
import { AccountControl } from "@/components/AccountControl";
import { emptyOutlineIsCompact } from "@/lib/emptyPageOutline";
import { LogoMark } from "@/components/Logo";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ICON_SIZE,
  ImageIcon,
  InfoIcon,
  AlertIcon,
  MoveToSectionIcon,
  PagePlusIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { MoveToSectionMenu } from "@/components/print/MoveToSectionMenu";
import { AddLineMenu } from "@/components/print/AddLineMenu";
import { PhotoHoverHint } from "@/components/print/PhotoHoverHint";
import { ZoomControl } from "@/components/print/ZoomControl";
import { DeckPageCount } from "@/components/print/DeckPageCount";
import { ScaledPage } from "@/components/print/ScaledPage";
import { TwoUpPrintPages } from "@/components/print/TwoUpPrintPages";
import { recipeLinkOn } from "@/lib/recipeLink";
import { gutterSideForRole } from "@/lib/cookbookPresets";
import { recipeNamesIntro } from "@/lib/chapterIntro";
import { emptyRecipeFields } from "@/lib/recipeMissingFields";
import { removedHeadingsName } from "@/lib/recipeHeadings";
import type { AddableRecipeLine } from "@/types/recipe";
import {
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { blankPageReason } from "@/lib/usePrintSheets";
import type { NavItem, PageSheet, SheetSlot, usePrintSheets } from "@/lib/usePrintSheets";
import {
  sectionHasArtPage,
  sectionDisplayTitle,
  type PhotoStyle,
  type useProjectMeta,
} from "@/lib/project";
import type { useDeckScroller } from "@/lib/useDeckScroller";
import { isPhotoOpenClick, photoDialogKey, type PhotoPress } from "@/lib/photoOpenGesture";
import { LineSelectionToolbar } from "@/components/print/LineSelectionToolbar";
import { TextFieldToolbar } from "@/components/print/TextFieldToolbar";
import { SAMPLE_LINES, lineShown } from "@/lib/bookPageSamples";
import { usePageOverflow } from "@/lib/pageOverflow";
import { pageAddressForSlot } from "@/lib/pageLooks";
import type { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import { PageToolbar, PageToolbarItem } from "@/components/print/PageToolbar";
import { FailedImportCard } from "@/components/print/FailedImportCard";
import { importLoadingLabel } from "@/lib/importProgress";
import { importPreview } from "@/lib/importPreviews";
import { BACK_COVER_NAV_ID } from "@/lib/railPending";
import { hostedPendingPage } from "@/lib/pendingDeckSlot";
import type { CoverConfig, QueueItem, Section } from "@/types/recipe";

type CoverSide = "front" | "back" | "dedication";

/**
 * How many slides either side of the active one draw their real pages.
 *
 * The deck used to render every page of the book at full fidelity, always: a
 * 60-recipe cookbook mounted 65 `ScaledPage`s and 5,214 DOM nodes on load, and
 * every one of them was reconciled again on each page crossing. That cost is
 * O(book) in the one place a large book actually gets edited.
 *
 * Two is enough to cover the neighbours a scroll or an arrow key can reach
 * before the next render lands, so nothing is ever seen filling in.
 */
const DECK_WINDOW = 2;

/**
 * How far the pointer has to travel before a press counts as a drag across
 * text rather than a click that wobbled. Matches the slop browsers themselves
 * allow before they start extending a selection.
 */

/** What the zoom menu offers. 1 is fit-to-window, which is where the deck sits
    with no zoom applied. */
/* Every surface that renders a photo: a recipe card's header thumbnail, a
   chapter opener's band, a cover's artwork (single or collage), and the two
   full-page art surfaces. Double-clicking any of them opens that page's photo
   dialog. */
/** A pointer that moved further than this was dragging, not clicking. */
const PHOTO_CLICK_SLOP = 4;

const PHOTO_SURFACES = [
  // A recipe card's header thumbnail.
  ".recipe-card__photo",
  // A chapter opener's photo band — but only when the opener is the thing
  // showing the photo. In "Full page" and "None" the band keeps its SPACE so
  // chapter titles sit at the same height through the book, and paints nothing
  // in it. Unqualified, that empty half of the page was a click target with a
  // hover outline: a box over a picture that is on the facing page, or that
  // does not exist.
  ".recipe-card--chapter-with-photo .recipe-card__chapter-photo",
  // A cover's artwork — the single-photo and collage variants share this class.
  ".recipe-card__cover-photo",
  // Both full-page art surfaces: a recipe's facing photo and a chapter's.
  // There is no `.recipe-image-spread` wrapper, only this element.
  ".recipe-image-spread__photo",
  // A photo still waiting to be added: the place the photo goes.
  ".photo-placeholder",
].join(", ");

export const DECK_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** The recipe's two text columns — the only places a drag means "edit this". */

/**
 * The exact box a real page occupies, with nothing in it.
 *
 * `.recipe-page-scaler` takes its size purely from these three custom
 * properties (see print.css), so this holds the identical footprint — which is
 * what keeps scroll height, scroll-snap points, and the deck scroller's cached
 * slide centres unchanged whether a slide is drawn or not. Same trick the rail
 * already uses for its thumbnails.
 */
function PagePlaceholder({ width, height, scale }: { width: number; height: number; scale: number }) {
  return (
    <div
      className="recipe-page-scaler"
      aria-hidden
      style={
        {
          "--page-scale": scale,
          "--page-w": `${width}px`,
          "--page-h": `${height}px`,
        } as CSSProperties
      }
    />
  );
}

/**
 * The nav item the loading placeholder follows, or null for "goes last".
 *
 * "Last" means last in the BODY of the book. A recipe added with no anchor
 * lands at the end of the last section, and sections print before the back
 * cover, so its placeholder follows whatever comes just before the back cover:
 * the contents page, in a book with no recipes yet. It used to follow the back
 * cover itself, and the page then appeared somewhere else once it arrived.
 *
 * Exported because the print page needs the same answer: it parks the deck on
 * the placeholder while the import runs, and to do that without a second jump
 * when the recipe lands it has to know which slot the recipe is about to take.
 * Two implementations of that answer would be two places for it to drift.
 */
export function pendingAnchorIndexIn(
  navItems: NavItem[],
  pendingAddAfterRecipeId: string | null,
): number | null {
  if (!pendingAddAfterRecipeId) {
    const backCover = navItems.findIndex((navItem) => navItem.recipeId === BACK_COVER_NAV_ID);
    return backCover > 0 ? backCover - 1 : null;
  }
  return navItems.reduce<number | null>(
    (last, navItem, index) => (navItem.recipeId === pendingAddAfterRecipeId ? index : last),
    null,
  );
}

/**
 * The nav index the arriving recipe will occupy — the slot the placeholder is
 * standing in. With no anchor that is the end of the book's body, just ahead
 * of the back cover, which is where an unanchored import lands.
 */
export function pendingSlotIndexIn(
  navItems: NavItem[],
  pendingAddAfterRecipeId: string | null,
): number {
  const anchor = pendingAnchorIndexIn(navItems, pendingAddAfterRecipeId);
  return anchor === null ? navItems.length : anchor + 1;
}

interface PrintDeckProps {
  /** Save state / button, pre-rendered by the page (`renderSaveControl`) so
      the mobile topbar reports the exact same thing the desktop header does
      — see that function's doc comment in app/print/page.tsx. */
  saveControl: ReactNode;
  /** Undo and redo, pre-rendered by the page (lib/editHistory). Up here
      rather than in the bottom bar, which has no room to spare. */
  historyControls: ReactNode;
  /** The Pro upsell button, pre-rendered by the page
      (`renderProUpgradeButton`) — `null` once Pro is active, so this and
      the desktop header can never disagree about whether it's owed. */
  proUpgradeButton: ReactNode;
  /** Crown every text size but Normal in the text bar's Size: recipe cards
      on a free account, like the book-wide Text size. */
  textSizeProMarked: boolean;
  // Layout / preview geometry
  singleRecipePrintView: boolean;
  cookbookView: boolean;
  previewMeasuring: boolean;
  previewDims: { w: number; h: number };
  /** On screen: one page wide when `stackSpreads`, otherwise two. */
  spreadWidth: number;
  /** A phone's book: each spread's pages one above the other (print.css). */
  stackSpreads: boolean;
  previewCardSize: PrintCardSize;
  previewTemplate: RecipePrintTemplate;
  /** The text size the displayed sheets were measured at (`previewConfig`). */
  previewFontScale: FontScale;
  previewPhotoScale: PhotoScale;
  continueOnBack: boolean;
  cardSize: PrintCardSize;
  showCutLines: boolean;
  /** Print the 4x6 cards two to a Letter sheet (see TwoUpPrintPages). The
      deck on screen is unchanged; only what prints is. */
  twoUpPrint: boolean;
  showSourceUrl: boolean;
  setShowSourceUrl: Dispatch<SetStateAction<boolean>>;
  showDescription: boolean;
  /** No multi-recipe entitlement and not a cookbook — the one recipe a Free
      cook can hold. Only then is the page toolbar's link toggle unambiguous:
      it reads as "this recipe's link" and IS this recipe's link, because
      there's nothing else it could be acting on. With more than one recipe
      possible the toggle is still the single book-wide `showSourceUrl`
      flag underneath — putting it on a per-page toolbar there would read as
      a per-recipe control while quietly changing every recipe's link, which
      is worse than not offering it; the panel's "Every recipe" section
      stays the one place for that instead. */
  singleRecipeOnly: boolean;
  // Sheets / nav / spreads
  sheets: ReturnType<typeof usePrintSheets>["sheets"];
  navItems: ReturnType<typeof usePrintSheets>["navItems"];
  spreads: ReturnType<typeof usePrintSheets>["spreads"];
  sections: Section[];
  items: QueueItem[] | null;
  navIndexForSheet: Map<number, number>;
  firstNavIndexBySheet: Map<number, number>;
  activeNavIndex: number;
  activeNavItem: NavItem | null;
  activeRecipeItem: QueueItem | null | undefined;
  focusedSheet: number | null;
  focusSheetInSpread: (spreadIndex: number, sheetIndex: number | null) => void;
  // Deck scroller
  canvasSide: ReturnType<typeof useDeckScroller>["canvasSide"];
  setCanvasSide: ReturnType<typeof useDeckScroller>["setCanvasSide"];
  deckScale: ReturnType<typeof useDeckScroller>["deckScale"];
  /** The cook's zoom on the deck, and the controls that move it. 1 is fit. */
  deckZoom: number;
  /** Delete whatever page the toolbar belongs to — opens the same confirm the
      Delete key does. */
  onRequestDelete: (navItem: NavItem) => void;
  /** Puts the dedication back. Set only while the book has none, so a blank
      page 1 (the book opens on a photo spread) can offer it right there. */
  onAddDedication?: () => void;
  /** Move one recipe into another chapter. Cookbook only — a deck of loose
      cards has no sections to move between. `undefined` there rather than a
      no-op, so the control is absent rather than present and inert. */
  onMoveRecipeToSection?: (recipeId: string, sectionId: string) => void;
  /** Make a new chapter and move this recipe into it, from the same menu. */
  onMoveRecipeToNewSection?: (recipeId: string) => void;
  /** Set when a placement was chosen for a recipe with no photo; opens that
      recipe's picker. See `setRecipePhotoMode`. */
  openPhotoDialog: (key: string) => void;
  onZoomStep: (direction: 1 | -1) => void;
  onZoomSet: (zoom: number) => void;
  deckRef: ReturnType<typeof useDeckScroller>["deckRef"];
  slideRefs: ReturnType<typeof useDeckScroller>["slideRefs"];
  goToSlide: ReturnType<typeof useDeckScroller>["goToSlide"];
  // Inline editing
  projectMeta: ReturnType<typeof useProjectMeta>;
  showEmptyFields: ReturnType<typeof useRecipeInlineEditor>["showEmptyFields"];
  toggleShowEmptyFields: ReturnType<typeof useRecipeInlineEditor>["toggleShowEmptyFields"];
  restoreHeadings: ReturnType<typeof useRecipeInlineEditor>["restoreHeadings"];
  addField: ReturnType<typeof useRecipeInlineEditor>["addField"];
  activeInlineEdit: ReturnType<typeof useRecipeInlineEditor>["activeInlineEdit"];
  editingSectionId: string | null;
  /** A chapter just made, whose name opens selected (see the page). */
  newSectionTitleId: string | null;
  setEditingSectionId: Dispatch<SetStateAction<string | null>>;
  editingSectionTitle: string;
  setEditingSectionTitle: Dispatch<SetStateAction<string>>;
  /** Updates the in-progress chapter title. Owns both halves: the local field
      value (instant) and the throttled write into project meta. */
  editSectionTitle: (sectionId: string, value: string) => void;
  commitSectionEdit: () => void;
  startSectionEdit: (sectionId: string) => void;
  coverSideFromNavItem: (navItem: NavItem) => CoverSide;
  coverForSide: (side: CoverSide) => CoverConfig | undefined;
  defaultCover: () => CoverConfig;
  setCoverForSide: (side: CoverSide, cover: CoverConfig | undefined) => void;
  coverPhotoCandidates: string[];
  // Photo controls / helpers (defined in the page)
  renderPagePhotoControl: (recipeId: string) => ReactNode;
  /** Whether a recipe's photo is drawn, so the "+" menu offers one if not. */
  recipeHasPhoto: (recipeId: string) => boolean;
  /** The opener/title page's OWN photo slot — independent of the facing art
      page's, see `renderArtPhotoControl`. */
  renderCardPhotoControl: (sectionId: string) => ReactNode;
  /** The facing page's own photo/collage/caption slot — independent of the
      opener card's, see `renderCardPhotoControl`. */
  renderArtPhotoControl: (sectionId: string) => ReactNode;
  /** This chapter's own recipe photos, capped — what the spread-level None /
      Card / Full page control seeds a slot with, the same source the
      per-page pickers scope their candidates to. */
  sectionRecipeImages: (section: Section) => string[];
  /** The book-wide Photos default — an opener with no explicit choice of its
      own follows it (see `resolveCardPhotoMode` / `resolveArtPhotoMode`), so
      the spread toolbar's active state needs it too, or a chapter that's
      only ever followed the book reads as "None" there while the page
      itself is showing a photo. */
  photoStyle: PhotoStyle;
  renderCoverPhotoControl: (side: "front" | "back" | "dedication") => ReactNode;
  renderImagePagePhotoControl: (recipeId: string) => ReactNode;
  openAddRecipeBelow: (navItem?: NavItem | null) => void;
  /** Imports still parsing. Each gets a page-shaped placeholder at the end of
      the deck — see the render. Errors are NOT here; they surface as a toast. */
  /** Imports still parsing, in queue order. Items rather than a count so each
      placeholder page is keyed by the import it stands in for. */
  parsingImports: QueueItem[];
  /** Imports that failed, which hold their slot rather than vanishing into a
      toast. Rendered by the same anchor rule as the parsing ones. */
  failedImports: QueueItem[];
  /** The import card the rail has selected, if any. Brings it out of the
      deck's dimmed state the way `is-active` does for a page. */
  activeImportId?: string | null;
  /** Selecting one from the deck itself, the way clicking a page does. */
  onSelectImport?: (item: QueueItem) => void;
  /** Recipes that just finished parsing, for the beat they settle in. */
  settlingIds?: ReadonlySet<string>;
  onTryAnotherImportWay: (id: string) => void;
  onRemoveImport: (id: string) => void;
  /** Opens the Pro upgrade from a photo import that hit the free hourly
      limit. Omitted for an account that already has Pro. */
  onUpgradeForImageImports?: () => void;
  /** The recipe an import was added BELOW, if any — the deck places its
      placeholder page right after that recipe, the way the rail does. */
  pendingAddAfterRecipeId: string | null;
  /** Draw every page regardless of the window — set while printing, when the
      deck IS the output and a placeholder would print blank. */
  renderAllPages: boolean;
}

// The center deck: the mobile topbar plus the scrolling page preview. Two render
// paths — the cookbook two-page spread view (focus-linked image/section spreads)
// and the flat single-page card view — with inline edit controls, per-page photo
// controls, and the front/back side switcher. Verbatim move out of the print
// god-file; `renderActiveControls` and `renderDeckPage` moved in as internals.
/**
 * Opens a book-page line the "+" menu just put back: its prompt appears a
 * render later, so this looks for a few frames, marks it as added (left
 * empty, it goes back under the "+"; see `takeAdded` in RecipeCardPrint) and
 * presses it. A chapter opener's lines open on the press, a cover's on the
 * click, so it sends both.
 */
function openAddedLine(name: string) {
  let tries = 0;
  const attempt = () => {
    // The line itself, back on the page with its sample words (a title's
    // prompt, for the one kind of line that still has one).
    const prompt = document.querySelector<HTMLElement>(
      `.recipe-page-slide.is-active .recipe-card [data-field-line="${name}"], .recipe-page-slide.is-active .recipe-card [data-field-prompt="${name}"]`,
    );
    if (prompt) {
      prompt.dataset.added = "true";
      prompt.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
      if (prompt.dataset.added) prompt.click();
      // Opened with its words selected, so typing replaces the sample.
      window.requestAnimationFrame(() => {
        const field = document.activeElement;
        if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) field.select();
      });
      return;
    }
    if (++tries < 12) window.requestAnimationFrame(attempt);
  };
  window.requestAnimationFrame(attempt);
}

/** What the "+" menu calls each line a recipe can take off. */
const RECIPE_LINE_NAMES: Record<AddableRecipeLine, string> = {
  link: "Link",
  time: "Cook time",
  servings: "Servings",
  note: "Note",
  ingredients: "Ingredients",
  steps: "Steps",
};

/**
 * Puts the cursor in the first empty field the page's reveal has just shown,
 * in reading order. The fields only exist once
 * the reveal is on, so it looks for a few frames. Text fields take the focus;
 * a prompt that opens its field on a press (the note, a book page's line) is
 * pressed.
 */
function focusFirstMissingField() {
  let tries = 0;
  const attempt = () => {
    const first = document.querySelector<HTMLElement>(
      [
        ".recipe-page-slide.is-active .recipe-card input:placeholder-shown",
        ".recipe-page-slide.is-active .recipe-card textarea:placeholder-shown",
        ".recipe-page-slide.is-active .recipe-card .recipe-card__headnote--empty",
        ".recipe-page-slide.is-active .recipe-card .recipe-card__cover-field--empty",
        ".recipe-page-slide.is-active .recipe-card .recipe-card__opener-field--empty",
      ].join(", "),
    );
    if (first) {
      if (first instanceof HTMLInputElement || first instanceof HTMLTextAreaElement) {
        first.focus();
      } else {
        first.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        first.click();
      }
      return;
    }
    if (++tries < 12) window.requestAnimationFrame(attempt);
  };
  window.requestAnimationFrame(attempt);
}

export function PrintDeck(props: PrintDeckProps) {
  // Where the shared move menu should open, or null when it is closed. The
  // menu closes itself on an outside press, Escape, a scroll or a resize.
  const [moveMenuAt, setMoveMenuAt] = useState<{ x: number; y: number } | null>(null);
  const [addMenuAt, setAddMenuAt] = useState<{ x: number; y: number } | null>(null);
  const addMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const {
    saveControl,
    historyControls,
    proUpgradeButton,
    textSizeProMarked,
    singleRecipePrintView,
    cookbookView,
    previewMeasuring,
    previewDims,
    spreadWidth,
    stackSpreads,
    previewCardSize,
    previewTemplate,
    previewFontScale,
    previewPhotoScale,
    continueOnBack,
    cardSize,
    showCutLines,
    twoUpPrint,
    showSourceUrl,
    setShowSourceUrl,
    showDescription,
    sheets,
    navItems,
    spreads,
    sections,
    items,
    navIndexForSheet,
    firstNavIndexBySheet,
    activeNavIndex,
    activeNavItem,
    activeRecipeItem,
    focusedSheet,
    focusSheetInSpread,
    canvasSide,
    setCanvasSide,
    deckScale,
    deckZoom,
    onRequestDelete,
    onAddDedication,
    onMoveRecipeToSection,
    onMoveRecipeToNewSection,
    openPhotoDialog,
    onZoomStep,
    onZoomSet,
    deckRef,
    slideRefs,
    goToSlide,
    projectMeta,
    showEmptyFields,
    toggleShowEmptyFields,
    restoreHeadings,
    addField,
    activeInlineEdit,
    editingSectionId,
    newSectionTitleId,
    setEditingSectionId,
    editingSectionTitle,
    setEditingSectionTitle,
    editSectionTitle,
    commitSectionEdit,
    startSectionEdit,
    coverSideFromNavItem,
    coverForSide,
    defaultCover,
    setCoverForSide,
    coverPhotoCandidates,
    renderPagePhotoControl,
    recipeHasPhoto,
    renderCardPhotoControl,
    renderArtPhotoControl,
    sectionRecipeImages,
    photoStyle,
    renderCoverPhotoControl,
    renderImagePagePhotoControl,
    openAddRecipeBelow,
    parsingImports,
    failedImports,
    activeImportId,
    onSelectImport,
    settlingIds,
    onTryAnotherImportWay,
    onRemoveImport,
    onUpgradeForImageImports,
    pendingAddAfterRecipeId,
    renderAllPages,
  } = props;

  // What doesn't fit on the page being looked at (lib/pageOverflow.ts). Only
  // a book's own pages: a recipe page fits itself, moving and shrinking its
  // lines, so its words never run off.
  const activeSheet = activeNavItem ? sheets[activeNavItem.sheetIndex] : undefined;
  const activeSlot = activeSheet && activeNavItem ? (activeSheet.slots[activeNavItem.slotIndex] ?? activeSheet.slots.find(Boolean)) : undefined;
  const overflowAddress = activeSlot && activeSlot.kind !== "recipe" ? pageAddressForSlot(activeSlot) : undefined;
  const overflowing = usePageOverflow(overflowAddress, ".recipe-page-canvas");


  // The deck element itself, for the page counter: the deck can be replaced
  // while the counter stays mounted, so it is handed the live one.
  const [deckEl, setDeckEl] = useState<HTMLDivElement | null>(null);
  // Where the page count goes: the middle of the phone's top bar.
  const [pageCountSlot, setPageCountSlot] = useState<HTMLElement | null>(null);
  const attachDeck = useCallback(
    (node: HTMLDivElement | null) => {
      deckRef(node);
      setDeckEl(node);
    },
    [deckRef],
  );

  // A phone shows a spread's pages as separate screens with no ring to say
  // which one the toolbar acts on, so it acts on the one you can see.
  const [sheetInView, setSheetInView] = useState<number | null>(null);
  const focusSheetInSpreadRef = useRef(focusSheetInSpread);
  focusSheetInSpreadRef.current = focusSheetInSpread;
  useEffect(() => {
    if (!stackSpreads || sheetInView === null || sheetInView === focusedSheet) return;
    const spread = spreads[activeNavIndex];
    if (!spread || (spread.left !== sheetInView && spread.right !== sheetInView)) return;
    // A frame later: moving onto a new spread resets its page focus in the
    // same commit, after this runs, and would undo it.
    const frame = requestAnimationFrame(() =>
      focusSheetInSpreadRef.current(activeNavIndex, sheetInView),
    );
    return () => cancelAnimationFrame(frame);
  }, [stackSpreads, sheetInView, focusedSheet, activeNavIndex, spreads]);

  // The empty-state outline is the page at the deck's scale, unless that is
  // too small to hold its words (see `emptyOutlineIsCompact`).
  const emptySheetCompact = emptyOutlineIsCompact(
    previewDims.w * deckScale,
    previewDims.h * deckScale,
    previewCardSize,
  );

  // Whether a chapter's facing/art page can exist AT ALL right now — mirrors
  // `cookbookLayouts` in lib/usePrintSheets.tsx exactly (cookbook mode AND
  // letter size; the 4×6 card format has no facing pages, ever, regardless
  // of what's stored on the section). Read this before trusting
  // `resolveCardPhotoMode`/`resolveArtPhotoMode` for anything that has to
  // agree with what actually got printed — passing `photoStyle` to either
  // when this is false claims a book-wide default that the sheet builder
  // itself never applies outside letter size, and for the art side
  // specifically, a stored `artPhotoMode` idles: no section-photo sheet is
  // ever built for it while this is false, whatever the mode says.
  const cookbookLayouts = Boolean(projectMeta.meta.cookbookMode) && cardSize === "letter";

  // Whether this page's reveal is on. Chapter openers and the contents page
  // used to answer this with a mode of their own — an Edit button that made
  // their text editable at all — while a recipe and a cover answered it with
  // the reveal. Every page kind now edits by clicking its text, so there is one
  // state left to be in, and one question to ask about it.
  const isEditingNavItem = (navItem: NavItem) =>
    navItem.kind !== "image" && navItem.kind !== "section-photo" && showEmptyFields;

  /**
   * One bar holding everything that acts on the page you're looking at.
   *
   * Front/Back used to sit centred over the page while Edit sat off at its
   * right edge — two floating islands doing the same job for the same page,
   * reading as unrelated chrome. As one bar with hairline dividers they read
   * as a set of tools.
   *
   * Everything in it acts on the PAGE, and it does not change with the
   * selection. Body/heading and bold/italic used to appear in here while a
   * field was open, which meant clicking into a line reshaped the bar and slid
   * Move and Delete out from under the cursor — the page's own controls looked
   * like they had been swapped for a line's. Those two groups are their own
   * bar now, anchored to the field they act on (`TextFieldToolbar`).
   *
   * Returns null when there would be nothing to hold. An empty bar used to be
   * harmless (the wrapper had no background of its own); now it would be a
   * visible empty box floating over an art page.
   */
  const renderActiveControls = (
    navItem: NavItem,
    previewW: number,
    horizontalOffset = 0,
  ) => {
    // Art pages and continuation sheets have no edit surface of their own.
    /**
     * What the page toolbar's "+" menu offers, in the order it appears on the
     * page, each with how to add it. On a recipe page, every line the recipe
     * has nothing in: a recipe page draws no empty line, because it is laid
     * out as it prints (see RecipeFace). On a book page (a cover, an opening
     * page, a chapter opener), every optional line that isn't on the page:
     * there are no prompts on the page itself (lib/bookPageSamples.ts). No
     * lines, no button.
     *
     * A cleared cover or chapter title has no prompt of its own, so it comes
     * back through the reveal instead.
     */
    const viaReveal = () => {
      if (!showEmptyFields) toggleShowEmptyFields();
      focusFirstMissingField();
    };
    const addableLines = (): { name: string; restore: () => void }[] => {
      if (navItem.kind === "recipe") {
        const recipeId = navItem.recipeId;
        const recipe = items?.find((item) => item.id === recipeId)?.recipe;
        if (!recipe) return [];
        const cookbook = Boolean(projectMeta.meta.cookbookMode);
        // The link is this menu's too, now the toolbar has no link button
        // (Amelia, 2026-11-04): a link that isn't wanted is deleted on the
        // page, and one that is missing is added here. A missing link is
        // always offered, and adding it on recipe cards turns the cards'
        // links on, as the button did.
        const lines = emptyRecipeFields(recipe, {
          cookbook,
          showSourceUrl: true,
          showDescription,
        }).map((field) => ({
            name: RECIPE_LINE_NAMES[field],
            restore: () => {
              if (field === "link" && !cookbook && !showSourceUrl) setShowSourceUrl(true);
              addField(recipeId, field);
            },
          }));
        // A link that is there but hidden (a book saved with the old "Recipe
        // link" switch off, or a recipe whose link was hidden by the toolbar
        // button that used to be here) comes back the same way. In a cookbook
        // only this recipe's: an override when the book's are off.
        if (
          recipe.sourceUrl &&
          !recipeLinkOn(showSourceUrl, cookbook, projectMeta.meta.itemPlacements?.[recipeId])
        ) {
          lines.unshift({
            name: RECIPE_LINE_NAMES.link,
            restore: () =>
              cookbook
                ? projectMeta.setItemPlacement(recipeId, { showSourceUrl: showSourceUrl ? undefined : true })
                : setShowSourceUrl(true),
          });
        }
        // A recipe drawn without a photo: opens its photo picker, the toolbar
        // Photo button's own dialog.
        if (!recipeHasPhoto(recipeId)) {
          lines.unshift({ name: "Photo", restore: () => openPhotoDialog(recipeId) });
        }
        // A removed "Ingredients" / "Steps" heading comes back as the default.
        const headings = removedHeadingsName(recipe);
        if (headings) {
          lines.push({
            name: headings === "heading" ? "Heading" : "Headings",
            restore: () => {
              restoreHeadings(recipeId);
            },
          });
        }
        return lines;
      }
      if (navItem.kind === "cover") {
        const side = coverSideFromNavItem(navItem);
        const cover = coverForSide(side);
        if (!cover) return [];
        // The prompt's name on the page (CoverFace's `coverField`) for each
        // stored line, so the "+" menu can open the one it puts back.
        const prefix = side === "front" ? "cover" : side;
        const lineNames: Record<"subtitle" | "author" | "edition" | "blurb", string> = {
          subtitle: `${prefix}-kicker`,
          author: side === "front" ? "cover-byline" : side === "back" ? "back-credit" : "dedication-signature",
          edition: `${prefix}-edition`,
          blurb: side === "back" ? "back-blurb" : "dedication-text",
        };
        // Off the page: deleted, or (in a book from before sample lines)
        // never written. Put back with its sample words, open and selected.
        const back = (key: "subtitle" | "author" | "edition" | "blurb", name: string) =>
          !lineShown(cover[key], projectMeta.meta.sampleLines)
            ? [
                {
                  name,
                  restore: () => {
                    setCoverForSide(side, { ...cover, [key]: SAMPLE_LINES[lineNames[key]] ?? "" });
                    openAddedLine(lineNames[key]);
                  },
                },
              ]
            : [];
        // A photo behind the opening page's words (see CoverFace) doesn't
        // make them optional — it's a background choice, not a replacement.
        if (side === "dedication") {
          // An opening page's heading comes back as the word it started with.
          const heading = projectMeta.meta.frontMatter?.kind === "introduction" ? "Introduction" : "Dedication";
          return [
            ...(!cover.title
              ? [{ name: "Heading", restore: () => setCoverForSide(side, { ...cover, title: heading }) }]
              : []),
            ...back("blurb", "Message"),
            ...back("author", "Signature"),
          ];
        }
        if (side === "back") {
          return [...back("blurb", "Closing line"), ...back("author", "Credit")];
        }
        return [
          ...(!cover.title ? [{ name: "Title", restore: viaReveal }] : []),
          ...back("subtitle", "Subtitle"),
          ...back("author", "Author"),
          ...back("edition", "Edition"),
        ];
      }
      if (navItem.kind === "divider") {
        const section = sections.find((candidate) => candidate.id === navItem.recipeId);
        if (!section) return [];
        // Title first, matching where it sits on the page. It's missing when
        // the cook has hidden it (`titleOverride`), not when it's merely
        // untouched — the section's real name is the default, always there
        // unless deliberately cleared. The description prints the chapter's
        // recipe names until the cook writes their own or removes it, so it
        // is only missing once it has been removed (`""`).
        return [
          ...(!sectionDisplayTitle(section).trim() ? [{ name: "Title", restore: viaReveal }] : []),
          ...(!lineShown(section.subtitle, projectMeta.meta.sampleLines)
            ? [
                {
                  name: "Subtitle",
                  restore: () => {
                    projectMeta.updateSection(section.id, { subtitle: SAMPLE_LINES.subtitle });
                    openAddedLine("subtitle");
                  },
                },
              ]
            : []),
          ...(section.intro === ""
            ? [{ name: "Description", restore: () => projectMeta.setSectionIntro(section.id, undefined) }]
            : []),
        ];
      }
      // Nothing on the contents page can be missing: both of its lines print a
      // default ("Contents", "What's inside") when nobody types one, and the
      // entries are generated.
      return [];
    };
    const missingLines = addableLines();

    // Whether this KIND of page has an edit/reveal button at all.
    // A cover made into the cook's own image or a blank has no words or theme
    // photo on it to reveal or change; its image is chosen in the Page tab.
    const ownCoverPage =
      navItem.kind === "cover" && Boolean(coverForSide(coverSideFromNavItem(navItem))?.pageType);
    const editable =
      navItem.kind !== "image" &&
      navItem.kind !== "section-photo" &&
      navItem.kind !== "blank" &&
      !ownCoverPage &&
      !navItem.continued;
    // Whether to actually offer it. Separate from `editable` on purpose: the
    // first decides whether the page has text to work on, the second whether
    // there is anything taken off to put back.
    const showFieldsButton = editable && missingLines.length > 0;
    const editing = isEditingNavItem(navItem);
    // Always present on the pages that have a photo to place, not only while
    // you happen to be editing them. Hiding it behind Edit meant the toolbar
    // changed shape depending on a mode you were not thinking about, and the
    // question "where does the photo go" had to be asked through a button that
    // says "Edit". The placements themselves live inside the picker's menu.
    // Recipe cards have photos too. This was cookbook-only because the control
    // it replaced was a placement switch, which is a cookbook idea — but the
    // dialog behind it also chooses WHICH photo, and that is how a plain card
    // gets one. Without it here, a recipe imported without a picture had no way
    // to be given one at all.
    const photoControl = !projectMeta.meta.cookbookMode
      ? navItem.kind === "recipe"
        ? renderPagePhotoControl(navItem.recipeId)
        : null
      : navItem.kind === "recipe"
        ? renderPagePhotoControl(navItem.recipeId)
        : navItem.kind === "divider"
          ? renderCardPhotoControl(navItem.recipeId)
          : navItem.kind === "cover" && !ownCoverPage
            ? // All three cover pages draw a photo now — front, back and the
              // opening page (whose photo replaces its words instead of
              // sitting behind them; see CoverFace).
              renderCoverPhotoControl(coverSideFromNavItem(navItem))
            : // The art pages: a full-page recipe photo, and a chapter's facing
              // art. These used to carry their own button ON the picture, which
              // is the last place the dialog was reachable from anywhere but
              // here.
              navItem.kind === "image"
              ? renderImagePagePhotoControl(navItem.recipeId)
              : navItem.kind === "section-photo"
                ? renderArtPhotoControl(navItem.recipeId)
                : null;
    /**
     * The chapters this recipe could move to, or null outside a cookbook and
     * on anything that isn't a recipe. An untitled section is the implicit
     * ungrouped pool, so it is offered under the name the rail gives it rather
     * than as a blank row.
     *
     * Present even with nowhere to move to. A book that has not been divided
     * yet is exactly when you want to divide it, and hiding the control until
     * chapters exist meant the one place you would look for "put this in a
     * chapter" was empty until you had already been somewhere else and made
     * one. "Add chapter" is always the last item.
     */
    const moveSections =
      onMoveRecipeToSection && projectMeta.meta.cookbookMode && navItem.kind === "recipe"
        ? {
            recipeId: navItem.recipeId,
            currentId: sections.find((section) =>
              section.items.some((item) => item.id === navItem.recipeId),
            )?.id,
            options: sections.map((section) => ({
              id: section.id,
              title: section.title?.trim() || "Ungrouped",
            })),
          }
        : null;

    // A chapter opener whose facing page has been removed (or never had one)
    // gets a plain "Add image page" button, rather than a shared page-count
    // control floating separately above the pair — that control used to move
    // between two different toolbar homes depending on whether a facing page
    // existed, and whichever page's focus it depended on could go stale the
    // moment the page it was watching disappeared. This button just always
    // lives here, on the card, and the facing page (once it exists) gets its
    // own ordinary Delete like every other page — see the Delete group below,
    // no longer excluded for a divider or its facing page. Deleting it from
    // there is what brings this button back.
    const dividerSection =
      navItem.kind === "divider"
        ? sections.find((candidate) => candidate.id === navItem.recipeId)
        : undefined;
    // Mirrors `hasFacing` in lib/usePrintSheets.tsx exactly — this has to
    // agree with whether a `section-photo` sheet actually exists, or the
    // button could show while a facing page is ALSO still there. Below
    // letter size (`!cookbookLayouts`) a facing page can never exist, full
    // stop — the sheet builder never even asks `artPhotoMode` in that case.
    const dividerHasFacing = dividerSection && cookbookLayouts
      ? sectionHasArtPage(dividerSection, sectionRecipeImages(dividerSection), photoStyle)
      : false;
    const addImagePageButton =
      dividerSection && !dividerHasFacing && !chapterFacesBlank(navItem.sheetIndex) ? (
        <PageToolbarItem
          menuLabel="Add image page"
          menuIcon={<PagePlusIcon size={ICON_SIZE.sm} />}
          priority={4}
        >
          <button
            type="button"
            className="recipe-page-toolbar__btn"
            onClick={(event) => {
              event.stopPropagation();
              addChapterImagePage(dividerSection.id);
            }}
          >
            Add image page
          </button>
        </PageToolbarItem>
      ) : null;

    // The book's optional pages are removed, not deleted: each comes back
    // from the rail's "Add …" button.
    const removesPage = navItem.kind === "cover" || navItem.kind === "toc";

    // The art pages have no text and no reveal, but they DO have a photo — and
    // the toolbar is the only place their photo can be changed from now.
    // A blank page, or a cover made the cook's own, has only its Delete, and
    // still needs a bar to hold it.
    if (
      navItem.kind !== "blank" &&
      !ownCoverPage &&
      !navItem.flip &&
      !editable &&
      !photoControl &&
      !addImagePageButton
    ) {
      return null;
    }
    return (
      <div
        className="recipe-page-canvas__controls no-print"
        style={{
          "--preview-w": `${previewW}px`,
          "--preview-offset": `${horizontalOffset}px`,
        } as CSSProperties}
      >
        <PageToolbar>
          {/* The contents page is generated, and anyone looking at it needs
              telling why the entries will not take a cursor — more so now that
              the two lines above them will. It used to say so from INSIDE the
              page, which made a note about the workspace take up space in the
              artwork — pushing the entries down, and counting toward the layout
              the pagination measures. It also used to wait for an edit mode
              that no longer exists, which is why it is simply present on the
              page it explains.
              It is a group in the toolbar rather than a banner of its own: the
              bar is already the floating thing that acts on this page, it
              already separates its groups with a hairline, and one object
              reads as chrome where two read as an interruption. */}
          {/* Words running past their box print cut off, and nothing else
              would say so. Stays while it's true, like the contents hint,
              and the words themselves are outlined on the page. */}
          {overflowing.length > 0 && (
            <div className="recipe-page-toolbar__group recipe-page-toolbar__hint recipe-page-toolbar__hint--warning" role="status">
              <AlertIcon size={ICON_SIZE.sm} aria-hidden />
              <span>Some text doesn&apos;t fit on this page. A smaller text size or fewer words will make it fit.</span>
            </div>
          )}
          {navItem.kind === "toc" && !navItem.continued && (
            <div className="recipe-page-toolbar__group recipe-page-toolbar__hint">
              <InfoIcon size={ICON_SIZE.sm} aria-hidden />
              <span>Updates as you edit chapters and recipes.</span>
            </div>
          )}
          {navItem.flip && (
            <div
              className="recipe-page-toolbar__group recipe-page-toolbar__group--view"
              role="group"
              aria-label="Sheet sides"
            >
              <button
                type="button"
                className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon"
                aria-label="Show front"
                disabled={canvasSide === "front"}
                onClick={(event) => {
                  event.stopPropagation();
                  setCanvasSide("front");
                }}
              >
                <ChevronLeftIcon size={ICON_SIZE.md} />
              </button>
              <span className="recipe-page-toolbar__label">
                {canvasSide === "front" ? "Front" : "Back"}
              </span>
              <button
                type="button"
                className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon"
                aria-label="Show back"
                disabled={canvasSide === "back"}
                onClick={(event) => {
                  event.stopPropagation();
                  setCanvasSide("back");
                }}
              >
                <ChevronRightIcon size={ICON_SIZE.md} />
              </button>
            </div>
          )}
          {/* "+": the lines this page has taken off, in a menu, one row each.
              It used to say them out loud ("Add servings"), which put a
              removed line's name back in front of the cook every time they
              looked at the page. Picking one puts just that line back, as its
              prompt, opened ready to type into. */}
          {showFieldsButton && !editing && (
            <div className="recipe-page-toolbar__group recipe-page-toolbar__group--fields">
              <button
                ref={addMenuTriggerRef}
                type="button"
                className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon recipe-page-toolbar__btn--fields"
                aria-label="Add a line"
                title="Add a line"
                aria-haspopup="menu"
                aria-expanded={addMenuAt ? true : undefined}
                onClick={(event) => {
                  event.stopPropagation();
                  if (addMenuAt) {
                    setAddMenuAt(null);
                    return;
                  }
                  const rect = event.currentTarget.getBoundingClientRect();
                  setAddMenuAt({ x: rect.left, y: rect.bottom + 6 });
                }}
              >
                <PlusIcon size={ICON_SIZE.md} />
              </button>
              {addMenuAt && (
                <AddLineMenu
                  anchor={addMenuAt}
                  triggerRef={addMenuTriggerRef}
                  heading={navItem.kind === "recipe" ? "Add to this recipe" : "Add to this page"}
                  lines={missingLines}
                  onClose={() => setAddMenuAt(null)}
                />
              )}
            </div>
          )}
          {/* After Edit, with Move and Delete: this is an icon among icons, and
              it led the bar only because that is where the placement toggle it
              replaced used to sit. */}
          {/* Photo, Move and Delete can go into the bar's More menu
              when the screen is too narrow for them (Delete first, the photo
              last). The reveal button and Front/Back always stay. */}
          {photoControl && (
            <PageToolbarItem menuLabel="Photo" menuIcon={<ImageIcon size={ICON_SIZE.sm} />} priority={3}>
              {photoControl}
            </PageToolbarItem>
          )}
          {/* Move this recipe into another chapter.
              
              Until now the only way was the Organize panel: leave the page you
              are looking at, find the recipe again in a different
              representation, and drag it. But "this belongs in Desserts" is a
              thought you have while looking AT the recipe, which is where this
              bar already is.
              
              Recipes only. A divider, the cover and the contents page have no
              chapter to be moved between. */}
          {moveSections && (
            <PageToolbarItem
              menuLabel="Move to another chapter"
              menuIcon={<MoveToSectionIcon size={ICON_SIZE.sm} />}
              priority={1}
            >
              <button
                type="button"
                className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
                  moveMenuAt ? "is-active" : ""
                }`}
                aria-haspopup="menu"
                aria-expanded={Boolean(moveMenuAt)}
                aria-label="Move to another chapter"
                title="Move to another chapter"
                onClick={(event) => {
                  event.stopPropagation();
                  if (moveMenuAt) {
                    setMoveMenuAt(null);
                    return;
                  }
                  // Under the button's bottom-left corner, which is where a
                  // menu opened from a control belongs. The menu clamps itself
                  // back inside the viewport from there.
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMoveMenuAt({ x: rect.left, y: rect.bottom + 6 });
                }}
              >
                <MoveToSectionIcon size={ICON_SIZE.md} />
              </button>
              {moveMenuAt && (
                <MoveToSectionMenu
                  anchor={moveMenuAt}
                  heading={`Move ${navItem.label ? `“${navItem.label}”` : "this recipe"} to`}
                  /* The chapter it is already in has nowhere to move it, so it
                     is not offered. The old dropdown listed it disabled, which
                     is a dead row where the rail's menu simply has none. */
                  sections={moveSections.options.filter(
                    (section) => section.id !== moveSections.currentId,
                  )}
                  onMove={(sectionId) =>
                    onMoveRecipeToSection?.(moveSections.recipeId, sectionId)
                  }
                  onNewSection={
                    onMoveRecipeToNewSection
                      ? () => onMoveRecipeToNewSection(moveSections.recipeId)
                      : undefined
                  }
                  onClose={() => setMoveMenuAt(null)}
                />
              )}
            </PageToolbarItem>
          )}
          {/* Delete, last and on its own: the Delete key already did this, and
              a key is not a control anyone finds. Its own group so it is not
              adjacent to Edit — the two are one pixel apart otherwise, and one
              of them is not undoable.
              A divider's Delete removes the whole chapter (routes through
              `requestDeleteNavItem`'s "divider" branch, which confirms first).
              A facing page's Delete just clears that page's art/caption and
              brings back the card's "Add image page" button — no confirm,
              same as clearing any other optional photo. */}
          <PageToolbarItem
            menuLabel={removesPage ? "Remove" : "Delete"}
            menuIcon={<TrashIcon size={ICON_SIZE.sm} />}
            priority={0}
            danger
          >
            <button
              type="button"
              className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon recipe-page-toolbar__btn--danger"
              aria-label={`${removesPage ? "Remove" : "Delete"} ${navItem.label ?? "this page"}`}
              title={removesPage ? "Remove" : "Delete"}
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete(navItem);
              }}
            >
              <TrashIcon size={ICON_SIZE.md} />
            </button>
          </PageToolbarItem>
          {addImagePageButton}
        </PageToolbar>
      </div>
    );
  };

  /**
   * A chapter opener's edit wiring, shared by the spread deck and the
   * single-page deck so the two cannot drift.
   *
   * Present on the focused opener whether or not anything is being typed: the
   * three lines are click-to-edit, exactly like a recipe's and a cover's, and
   * the card decides which of them is a field. Only the TITLE still has state
   * up here, because renaming a chapter re-packs the book — see
   * `DividerCardInlineEdit`.
   */
  const buildDividerEdit = (sectionId: string) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    return {
      sectionId,
      titleEditing: editingSectionId === sectionId,
      titleSelected: newSectionTitleId === sectionId,
      titleValue: editingSectionTitle,
      onTitleOpen: () => startSectionEdit(sectionId),
      onTitleChange: (value: string) => editSectionTitle(sectionId, value),
      onTitleCommit: commitSectionEdit,
      onTitleCancel: () => {
        setEditingSectionId(null);
        setEditingSectionTitle("");
      },
      subtitle: section?.subtitle,
      onSubtitleChange: (value: string) =>
        // Kept as typed, `""` included: emptying the line removes it, like
        // the intro below, rather than bringing its prompt back.
        projectMeta.updateSection(sectionId, { subtitle: value }),
      intro: section?.intro,
      // Kept as typed, `""` included: emptying the field removes the line. It no
      // longer hands the page back to the recipes' names, which is what made the
      // line impossible to get rid of.
      onIntroChange: (value: string) => projectMeta.setSectionIntro(sectionId, value),
    };
  };

  // One page's ScaledPage with all its edit wiring. `focused` = this is the page
  // the controls act on (drives the active side + which edit surface is live).
  const renderDeckPage = (
    navItem: NavItem,
    sheet: PageSheet,
    focused: boolean,
    role: "left" | "right" | "single" = "single",
  ) => (
    <ScaledPage
      preset={projectMeta.meta.cookbookPreset}
      sheet={sheet}
      isLastSheet={navItem.sheetIndex === sheets.length - 1}
      activeSlotIndex={navItem.slotIndex}
      activeSide={focused ? canvasSide : "front"}
      scale={deckScale}
      size={previewCardSize}
      template={previewTemplate}
      fontScale={previewFontScale}
      pageLooks={projectMeta.meta.pageLooks}
      sampleLines={projectMeta.meta.sampleLines}
      elementTargets={focused}
      photoScale={previewPhotoScale}
      doubleSided={continueOnBack}
      gutterSide={gutterSideForRole(role)}
      cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
      showEmptyFields={showEmptyFields}
      showDescription={showDescription}
      // The recipe's own link decision travels on its slot. What is left for
      // the deck to say is the prompt: a recipe with no link shows "+ Link"
      // while it is the one being edited, which in a cookbook needs no
      // setting on first.
      revealSourceUrl={
        !activeRecipeItem?.recipe?.sourceUrl &&
        focused &&
        activeRecipeItem?.id === navItem.recipeId &&
        (Boolean(projectMeta.meta.cookbookMode) || showSourceUrl)
      }
      showCutLines={showCutLines && cardSize === "card-6x4"}
      inlineEdit={
        focused && activeRecipeItem?.id === navItem.recipeId ? activeInlineEdit : undefined
      }
      dividerEdit={focused && navItem.kind === "divider" ? buildDividerEdit(navItem.recipeId) : undefined}
      coverEdit={
        focused && navItem.kind === "cover"
          ? {
              side: coverSideFromNavItem(navItem),
              cover: coverForSide(coverSideFromNavItem(navItem)) ?? defaultCover(),
              onChange: (cover) => setCoverForSide(coverSideFromNavItem(navItem), cover),
              recipeImages: coverPhotoCandidates,
            }
          : undefined
      }
      imageEdit={
        // Photo controls (drag-to-reposition + the "Photo" button) live right
        // here on the image, not orphaned inside the facing recipe card. An
        // image page has no text on it, so there is no click-to-edit for the
        // drag to compete with and no reason to make it wait behind a reveal.
        focused && navItem.kind === "image"
          ? {
              focusX: projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroFocusX ?? 50,
              focusY: projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroFocusY ?? 50,
              onChange: (focusX, focusY) =>
                projectMeta.setItemPlacement(navItem.recipeId, { heroFocusX: focusX, heroFocusY: focusY }),
              zoom: projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroZoom ?? 1,
              onZoomChange: (zoom) =>
                projectMeta.setItemPlacement(navItem.recipeId, { heroZoom: zoom > 1 ? zoom : undefined }),
            }
          : undefined
      }
      tocKicker={projectMeta.meta.tocKicker}
      tocTitle={projectMeta.meta.tocTitle}
      tocEdit={
        focused && navItem.kind === "toc"
          ? {
              kicker: projectMeta.meta.tocKicker ?? "Contents",
              title: projectMeta.meta.tocTitle ?? "What's inside",
              onKickerChange: projectMeta.setTocKicker,
              onTitleChange: projectMeta.setTocTitle,
            }
          : undefined
      }
    />
  );

  /**
   * A photo opens its dialog on a single click, the way a line of text opens
   * its field on a single click. Double-click was the wrong gesture here: it is
   * a thing you have to be told about, and nothing else on these pages asks for
   * it any more.
   *
   * Guarded against drags. A full-page photo can be dragged to reposition it,
   * and a drag ends in a `click` — so a pointer that travelled more than a few
   * pixels was aiming the picture, not asking to replace it.
   */
  const photoPointerStart = useRef<PhotoPress | null>(null);
  const notePhotoPointer = (event: ReactMouseEvent) => {
    const target = event.target as HTMLElement;
    photoPointerStart.current = {
      x: event.clientX,
      y: event.clientY,
      // WHICH photo was pressed, not just where. The deck scrolls natively, so
      // a page can travel under a stationary cursor — comparing coordinates
      // alone cannot tell that apart from a still click (see
      // `isPhotoOpenClick`).
      surface: target.closest(PHOTO_SURFACES),
    };
  };
  /** Gives a chapter its facing image page (seeded from the chapter's own
      photos when it has any), as the opener's old toolbar button did. */
  const addChapterImagePage = (sectionId: string) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) return;
    const seedPhoto = sectionRecipeImages(section)[0];
    projectMeta.setArtPhoto(sectionId, "photo", { photoUrl: section.artPhotoUrl ?? seedPhoto });
  };
  /** Whether this chapter opener sits on a left page with nothing facing it,
      where the empty page itself offers Add image page / Add recipe. */
  const chapterFacesBlank = (sheetIndex: number) => {
    if (!cookbookView) return false;
    const spread = spreads.find((candidate) => candidate.left === sheetIndex && !candidate.single);
    if (!spread) return false;
    if (spread.right === null) return spreads[spreads.length - 1] === spread;
    // A filler blank only: a blank page the cook added is theirs, not room.
    return Boolean(sheets[spread.right]?.slots.some((slot) => slot?.kind === "blank" && !slot.pageId));
  };
  const openPhotoOnClick = (navItem: NavItem, active: boolean) => (event: ReactMouseEvent) => {
    const press = photoPointerStart.current;
    // One press opens at most one photo. Left set, a stale press stays a
    // standing invitation for whatever click arrives next.
    photoPointerStart.current = null;
    if (!active) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea")) return;
    if (
      !isPhotoOpenClick({
        press,
        click: { x: event.clientX, y: event.clientY, surface: target.closest(PHOTO_SURFACES) },
        slop: PHOTO_CLICK_SLOP,
      })
    ) {
      return;
    }
    const key = photoDialogKey(navItem, () => coverSideFromNavItem(navItem));
    if (key) openPhotoDialog(key);
  };

  /**
   * A recipe on its way in gets a PAGE, in the deck, at the position it will
   * actually land — not appended to the end regardless. Added below a
   * particular recipe, it follows that recipe; added with no anchor, it goes
   * last, which is where an unanchored import lands. Same rule the rail uses
   * for its pending rows (`pendingAnchorRowIndex` in PageRail).
   *
   * Deliberately outside the sheets pipeline: this is a placeholder and
   * nothing about it should reach pagination or measurement.
   */
  const pendingAnchorIndex = pendingAnchorIndexIn(navItems, pendingAddAfterRecipeId);
  /** In a book the deck is spreads, not pages: the placeholder follows the
      spread holding the page it is anchored to. */
  const pendingAnchorSpreadIndex = (() => {
    if (!cookbookView || pendingAnchorIndex === null) return null;
    const sheet = navItems[pendingAnchorIndex]?.sheetIndex;
    const index = spreads.findIndex((spread) => spread.left === sheet || spread.right === sheet);
    return index === -1 ? null : index;
  })();
  /**
   * The empty page an arriving recipe will fill, which is where it loads
   * (`hostedPendingPage`): drawn as a new page below the spread instead, the
   * recipe then landed back up on the empty page, out of view.
   */
  // What the recipe follows. Unanchored with no back cover, "last" is the
  // book's last page, which `pendingAnchorIndexIn` leaves as null.
  const hostAnchorIndex =
    pendingAnchorIndex ?? (!pendingAddAfterRecipeId && navItems.length > 0 ? navItems.length - 1 : null);
  const hostTarget =
    cookbookView && hostAnchorIndex !== null
      ? hostedPendingPage({
          spreads,
          sheets,
          anchorSheet: navItems[hostAnchorIndex]?.sheetIndex ?? null,
          anchorId: navItems[hostAnchorIndex]?.recipeId ?? null,
          fullPagePhotos: photoStyle === "full",
        })
      : null;
  const blankHostedImport = hostTarget ? (parsingImports[0] ?? null) : null;
  /** The loading page itself: the photo being read, or what is being fetched. */
  const pendingSheet = (pendingItem: QueueItem) => (
    <div
      className="recipe-page-pending__sheet"
      style={{
        width: previewDims.w * deckScale,
        aspectRatio: `${previewDims.w} / ${previewDims.h}`,
      }}
    >
      {importPreview(pendingItem.id) ? (
        <>
          {/* The photo being read, not its file name. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="recipe-page-pending__photo"
            src={importPreview(pendingItem.id)}
            alt=""
            onError={(event) => {
              // A photo this browser cannot draw (HEIC outside Safari).
              event.currentTarget.hidden = true;
            }}
          />
          <RecipeLoadingState label="Reading your photo…" />
        </>
      ) : (
        <RecipeLoadingState label={importLoadingLabel(pendingItem)} />
      )}
    </div>
  );
  const listedImports = parsingImports.filter((item) => item !== blankHostedImport);
  const pendingPages =
    listedImports.length > 0 ? (
      <>
        {listedImports.map((pendingItem, index) => (
          <div
            className={`recipe-page-slide recipe-page-pending ${
              activeImportId === pendingItem.id ? "is-active" : ""
            }`}
            // A page slide is a button you click to move to it. These were
            // neither, so a card that is still loading or has failed behaved
            // unlike every other card in the deck. Only while it is NOT the
            // current one: once you are on it, the controls inside it are the
            // things you press.
            {...(activeImportId === pendingItem.id
              ? {}
              : {
                  role: "button" as const,
                  tabIndex: 0,
                  onClick: () => onSelectImport?.(pendingItem),
                  onKeyDown: (event: ReactKeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectImport?.(pendingItem);
                    }
                  },
                })}
            aria-current={activeImportId === pendingItem.id}
            aria-label={`Importing ${pendingItem.source}`}
            key={`parsing-page-${pendingItem.id}`}
            data-pending-import-id={pendingItem.id}
            // The deck scrolls itself here while the import parses. Found by
            // attribute rather than a ref because the placeholder is outside
            // the sheets pipeline and has no slot in `slideRefs` to hold one.
            data-pending-page={index === 0 && !blankHostedImport ? "" : undefined}
          >
            {pendingSheet(pendingItem)}
          </div>
        ))}
      </>
    ) : null;

  /* A failed import keeps the box its recipe would have had — same sheet, same
     aspect — so the placeholder BECOMES the failure rather than the deck
     silently closing the gap. Outside the sheets pipeline for the same reason
     the pending page is: nothing here should reach pagination, measurement or
     paper. */
  const failedPages =
    failedImports.length > 0 ? (
      <>
        {failedImports.map((failedItem) => (
          <div
            className={`recipe-page-slide recipe-page-failed ${
              activeImportId === failedItem.id ? "is-active" : ""
            }`}
            {...(activeImportId === failedItem.id
              ? {}
              : {
                  role: "button" as const,
                  tabIndex: 0,
                  onClick: () => onSelectImport?.(failedItem),
                  onKeyDown: (event: ReactKeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectImport?.(failedItem);
                    }
                  },
                })}
            aria-current={activeImportId === failedItem.id}
            aria-label={`Couldn't import ${failedItem.source}`}
            key={`failed-page-${failedItem.id}`}
            data-failed-import-id={failedItem.id}
          >
            {/* At LEAST the page's box, so a roomy deck still shows the
                failure where the page would have been, but never smaller than
                the words and buttons need. Pinned to the page exactly, a short
                deck (landscape phone, zoomed window) shrank it to ~120px wide
                and the answer scrolled out of sight inside it. */}
            <div
              className="recipe-page-failed__sheet"
              style={{
                width: `max(${previewDims.w * deckScale}px, min(20rem, 100%))`,
                minHeight: previewDims.h * deckScale,
              }}
            >
              <FailedImportCard
                item={failedItem}
                onTryAnotherWay={() => onTryAnotherImportWay(failedItem.id)}
                onRemove={() => onRemoveImport(failedItem.id)}
                onUpgrade={
                  failedItem.method === "image" && failedItem.errorCode === "rate_limited"
                    ? onUpgradeForImageImports
                    : undefined
                }
              />
            </div>
          </div>
        ))}
      </>
    ) : null;


  /**
   * The way back to the derived chapter description, for the field it belongs to.
   *
   * An opener left alone names the recipes filed under it, and re-words itself
   * whenever they move. Writing a description of your own, or removing it,
   * replaces that line for good — nothing overwrites what a cook wrote — so the
   * offer to go back is made where the words are: on the description field's own
   * bar, like bold and italic, and only while that field is the one being edited
   * and there is something to undo, and recipes to name. `undefined` until then, which keeps the bar
   * off a field that is still following the recipes.
   */
  const activeIntroReset = (() => {
    if (activeNavItem?.kind !== "divider") return undefined;
    const section = sections.find((candidate) => candidate.id === activeNavItem.recipeId);
    if (!section || section.intro === undefined) return undefined;
    const derived = recipeNamesIntro(section.items);
    if (derived === undefined) return undefined;
    return {
      derived,
      onReset: () => projectMeta.setSectionIntro(section.id, undefined),
    };
  })();

  return (
        <section
          className="recipe-page-canvas"
          aria-label="Selected page"
          // A one-card deck. Never a cookbook: a book with one recipe still
          // has a cover, contents and more pages to swipe between, and the
          // one-card styling snapped its slides by their start edge, which
          // parked the cover off-centre and hid the fact there was more.
          data-single-recipe={singleRecipePrintView && !cookbookView ? "true" : "false"}
        >
          <PhotoHoverHint surfaces={PHOTO_SURFACES} />
          {/* Body/heading and bold/italic, floating over the line being typed
              rather than joining the page's bar. It anchors itself to whatever
              field has focus, so it is mounted once for the whole deck. */}
          {overflowAddress && overflowing.length > 0 && (
            // Outlines the words that don't fit, wherever they are on the
            // page, without the page's faces knowing anything about it.
            <style>
              {`@media screen { ${overflowing
                .map(
                  (name) =>
                    `.recipe-page-canvas [data-element-page="${CSS.escape(overflowAddress)}"][data-element="${CSS.escape(name)}"]`,
                )
                .join(", ")} { outline: 1.5px dashed var(--cp-error); outline-offset: 2px; } }`}
            </style>
          )}
          <TextFieldToolbar
            inlineEdit={activeInlineEdit}
            zoom={deckZoom}
            introReset={activeIntroReset}
            elementSize={{
              styles: projectMeta.meta.pageLooks,
              onChange: (page, element, size) => projectMeta.setElementStyle(page, element, { textSize: size }),
              proMarked: textSizeProMarked,
            }}
          />
          {/* Its twin, for a drag that ran across several lines rather than a
              caret sitting in one. Mounted once for the whole deck, the same
              way and for the same reason. */}
          <LineSelectionToolbar inlineEdit={activeInlineEdit} zoom={deckZoom} />
          {/* Zoom, on the deck it zooms and nowhere else. Minus, the size, plus
              — and the percentage doubles as the way back to fit, since after
              a few steps "100%" is the number you are looking for anyway. */}
          <ZoomControl
            className="recipe-deck-zoom"
            value={deckZoom}
            min={DECK_ZOOM_STEPS[0]}
            max={DECK_ZOOM_STEPS[DECK_ZOOM_STEPS.length - 1]}
            presets={DECK_ZOOM_STEPS}
            presetNote={(step) => (step === 1 ? "Fit" : undefined)}
            onStep={onZoomStep}
            onSet={onZoomSet}
          />

          <div className="recipe-mobile-topbar no-print">
            {/* Mark only, matching the desktop header's own `wordmark={false}`
                (SiteHeader, called from app/print/page.tsx) — the name next
                to the mark repeats what the mark already is, and this bar is
                tight enough on a phone that a page-title bar right below it
                already says which app you're in. */}
            <Link href="/" className="recipe-mobile-topbar__logo" aria-label="RecipePrinter home">
              <LogoMark size={26} rounded={0} />
            </Link>
            <span className="recipe-mobile-topbar__count" ref={setPageCountSlot} />
            <div className="recipe-mobile-topbar__actions">
              {/* The gear icon that opened a separate "Print settings" sheet
                  is gone — cut lines / two-sided now live inline in the Size
                  sheet, right where Card gets picked, so there's nothing left
                  behind a second trigger. */}
              {/* Print is NOT here any more. It moved to the bottom bar, where the
                  thumb is and where the tools it finishes already live. */}
              {/* Same save control the desktop header carries (see
                  `renderSaveControl` in app/print/page.tsx) — right next to
                  the account control, the same order the desktop bar keeps. */}
              {historyControls}
              {saveControl}
              {/* Same order as the desktop header: Save, then the Pro
                  upsell — see `renderProUpgradeButton` in app/print/page.tsx
                  for why this is reachable on its own rather than only
                  showing up as a lock icon on some other control. */}
              {proUpgradeButton}
              {/* The same account control the desktop header carries.
                  "Where is my account" should not have a different answer on
                  a phone, and it had none at all here. */}
              <AccountControl compact />
            </div>
          </div>
          {/* Drawn with the rest of the deck (`renderAllPages`), so it is
              ready before a print and its photos load with the deck's. Before
              the deck, so print.css can switch the deck off with a sibling
              selector. */}
          {twoUpPrint && previewCardSize === "card-6x4" && renderAllPages && !previewMeasuring && (
            <TwoUpPrintPages
              sheets={sheets}
              template={previewTemplate}
              showDescription={showDescription}
              showCutLines={showCutLines}
              doubleSided={continueOnBack}
              fontScale={previewFontScale}
              pageLooks={projectMeta.meta.pageLooks}
              photoScale={previewPhotoScale}
            />
          )}
          <DeckPageCount deck={deckEl} countSlot={pageCountSlot} onSheetInView={setSheetInView} />
          <div
            className={`recipe-page-deck ${cookbookView ? "recipe-page-deck--book" : ""}`}
            id="recipe-page-deck"
            ref={attachDeck}
          >
            {previewMeasuring ? (
              /* The import cards stay up through the measure.
                 This used to swap the whole deck for one loading state, which
                 took the placeholder down with it: a recipe finished parsing,
                 its spinner card vanished, the deck showed a different spinner
                 while it paginated, and a page appeared afterwards. Three
                 states where there should be one, and the reason the handover
                 read as "that card disappeared and another was created"
                 instead of the card resolving.
                 These two are outside the sheets pipeline, so there is nothing
                 about them to measure and no reason for them to go. The
                 deck-wide spinner is only for when there is nothing else to
                 look at. */
              <>
                {pendingPages}
                {failedPages}
                {!pendingPages && !failedPages && (
                  <RecipeLoadingState className="recipe-page-deck__loading" />
                )}
              </>
            ) : navItems.length === 0 && parsingImports.length === 0 && failedImports.length === 0 ? (
              /* Deleting the last recipe leaves you standing in the workspace
                 you just emptied, not in an error. So the room stays: same
                 rail, same canvas, same settings panel — and where the pages
                 were, one page-shaped outline saying what would go there.

                 Not while an import is on its way, though, and not while one is
                 sitting there having failed. Both of those render their own
                 page-shaped sheet below, so the outline was a SECOND empty page
                 beside them, captioned "No recipes yet" next to a spinner reading
                 "Getting the recipe from smittenkitchen.com…". That pairing is
                 the first thing a visitor handed off from a landing page sees,
                 which is the worst possible place for the app to contradict
                 itself. */
              /* No wrapper around it. The sheet IS the deck's child, so the
                 deck's own centring and padding place it exactly where a real
                 page would be — anything in between only adds an offset a real
                 page does not have. */
              <div
                  className={`recipe-page-empty__sheet ${
                    previewCardSize === "card-6x4" ? "recipe-page-empty__sheet--card" : ""
                  } ${emptySheetCompact ? "recipe-page-empty__sheet--compact" : ""}`}
                  /* The outline stands in for a page you have not made yet, so
                     it is the size that page WOULD be: `previewDims`, the
                     same box a real page is laid out at, not a fixed width
                     that happened to look about right. It follows the size
                     control and the zoom for the same reason. Unless that page
                     is too small for the words, when --compact sizes it. */
                  style={
                    emptySheetCompact
                      ? undefined
                      : {
                          width: previewDims.w * deckScale,
                          aspectRatio: `${previewDims.w} / ${previewDims.h}`,
                        }
                  }
                >
                  {/* Enough of a card to be recognisable as one and no more: a
                      title bar, a rule, and — where there is room for them —
                      two short columns. Pale enough that it reads as the shape
                      of a page rather than a page with something on it. */}
                  <div className="recipe-page-empty__ghost" aria-hidden>
                    <span className="recipe-page-empty__bar recipe-page-empty__bar--title" />
                    <span className="recipe-page-empty__rule" />
                    {previewCardSize !== "card-6x4" && (
                      <span className="recipe-page-empty__cols">
                        <span className="recipe-page-empty__col">
                          <span className="recipe-page-empty__bar" />
                          <span className="recipe-page-empty__bar recipe-page-empty__bar--short" />
                          <span className="recipe-page-empty__bar" />
                        </span>
                        <span className="recipe-page-empty__col">
                          <span className="recipe-page-empty__bar" />
                          <span className="recipe-page-empty__bar recipe-page-empty__bar--short" />
                          <span className="recipe-page-empty__bar" />
                        </span>
                      </span>
                    )}
                  </div>
                  {/* Inside the outline, at both sizes. The words belong ON the
                      empty page, the way a page's content would — under it they
                      read as a caption about the page instead. */}
                  <div className="recipe-page-empty__copy">
                    <p className="recipe-page-empty__title">No recipes yet</p>
                    <p className="recipe-page-empty__body">
                      Add a recipe and it will show up here, laid out and ready to print.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() => openAddRecipeBelow(null)}
                    >
                      <PlusIcon size={ICON_SIZE.md} />
                      Add recipe
                    </button>
                  </div>
                </div>
            ) : cookbookView
              ? spreads.map((spread, index) => {
                  const isActive = index === activeNavIndex;
                  // A full-page-photo spread (image verso facing its recipe
                  // recto) is ONE logical page even though it's two physical
                  // pages: editing it edits the recipe, and its facing photo has
                  // no controls of its own. So focus/outline treat the pair as a
                  // unit — clicking either page focuses the recipe, and both get
                  // the focus ring together.
                  const leftSheet = spread.left != null ? sheets[spread.left] : null;
                  const rightSheet = spread.right != null ? sheets[spread.right] : null;
                  const isImageSpread =
                    leftSheet?.layoutKind === "image" || rightSheet?.layoutKind === "image";
                  const imageSpreadFocusSheet = isImageSpread
                    ? leftSheet?.layoutKind === "image"
                      ? spread.right
                      : spread.left
                    : null;
                  // `trailing` = a parity blank with no real page after it (the
                  // pad on the last spread when there's no back cover). It still
                  // holds the spread's layout on screen, but must NOT print — a
                  // printed empty last page is the stray-trailing-blank bug.
                  const leftSlot =
                    leftSheet?.slots.find((slot): slot is SheetSlot => slot !== null) ?? null;
                  const rightSlot =
                    rightSheet?.slots.find((slot): slot is SheetSlot => slot !== null) ?? null;
                  // A chapter opener still sits beside its facing full-page/grid
                  // photo (a `section-photo` sheet) as one spread on screen, but
                  // unlike an image spread it is not one shared editable unit:
                  // the opener card and the facing page each carry their own
                  // independent photo control (see `renderCardPhotoControl` /
                  // `renderArtPhotoControl`) and its own Delete. So a section
                  // spread stays OUT of `linkedSpread` below — each half keeps
                  // its OWN focus ring and its OWN toolbar, and clicking one
                  // never selects the other. It still outlines as a pair (see
                  // `recipe-spread--section-focused` below).
                  const isSectionSpread =
                    leftSlot?.kind === "divider" && rightSlot?.kind === "section-photo";
                  // Two contents pages facing each other are one opening, so
                  // they outline and select together and the first page owns
                  // the editing — the heading you can change lives there.
                  const isTocSpread =
                    leftSlot?.kind === "toc" && rightSlot?.kind === "toc";
                  const linkedSpread = isImageSpread || isTocSpread;
                  const linkedFocusSheet = isImageSpread
                    ? imageSpreadFocusSheet
                    : isTocSpread
                      ? spread.left
                      : null;
                  const designedBlank = leftSlot?.kind === "toc";
                  // A chapter opener with nothing facing it (an empty page the
                  // book prints, or the open end of the book): that page is
                  // where the chapter's own image page or its first recipe
                  // would go, so it offers both. The opener's toolbar drops its
                  // "Add image page" while this is showing (`chapterFacesBlank`).
                  const chapterBesideBlank =
                    cookbookView && leftSlot?.kind === "divider" ? leftSlot.id : null;
                  const chapterBlankActions = chapterBesideBlank ? (
                    <div className="recipe-spread__blank-note-actions">
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact recipe-spread__blank-note-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          addChapterImagePage(chapterBesideBlank);
                        }}
                      >
                        <PagePlusIcon size={ICON_SIZE.sm} />
                        Add image page
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact recipe-spread__blank-note-action"
                        onClick={(event) => {
                          event.stopPropagation();
                          openAddRecipeBelow(
                            navItems.find(
                              (nav) => nav.kind === "divider" && nav.recipeId === chapterBesideBlank,
                            ) ?? null,
                          );
                        }}
                      >
                        <PlusIcon size={ICON_SIZE.sm} />
                        Add recipe
                      </button>
                    </div>
                  ) : null;
                  // The import landing on the empty page beside a chapter
                  // or any other it will fill (`blankHostedImport`), loading in
                  // that page's place.
                  // This side of this spread is the empty page the arriving
                  // recipe will fill (`hostedPendingPage`).
                  const hostsImport = (role: "left" | "right" | "single") =>
                    Boolean(
                      blankHostedImport &&
                        hostTarget &&
                        hostTarget.spread === index &&
                        hostTarget.side === role,
                    );
                  const renderHostedImport = (pendingItem: QueueItem) => (
                    <div
                      className="recipe-page-pending recipe-page-pending--in-spread"
                      aria-label={`Importing ${pendingItem.source}`}
                      data-pending-import-id={pendingItem.id}
                      data-pending-page=""
                    >
                      {pendingSheet(pendingItem)}
                    </div>
                  );
                  // Blank pages are there so the printed book pairs up: a
                  // chapter starting on a right-hand page, a photo facing its
                  // recipe, a theme's ornament facing the contents. Stacked on
                  // a phone, nothing faces anything, so they were just empty
                  // screens to scroll past. The book still prints them. One
                  // that holds a button (Add dedication, a chapter's Add
                  // recipe) is not filler and stays.
                  const renderBlank = (
                    trailing = false,
                    reason?: string,
                    actions?: ReactNode,
                  ) => stackSpreads && !actions ? null : (
                    <div
                      className={`recipe-spread__blank recipe-template--${previewTemplate} ${
                        designedBlank ? "recipe-spread__blank--designed" : ""
                      } ${trailing ? "recipe-spread__blank--trailing" : ""}`}
                      aria-label={
                        leftSlot?.kind === "toc"
                          ? `${RECIPE_PRINT_TEMPLATE_OPTIONS.find((option) => option.id === previewTemplate)?.label ?? "Template"} decorative page`
                          : undefined
                      }
                      aria-hidden={designedBlank || reason ? undefined : true}
                      style={{
                        width: `${previewDims.w * deckScale}px`,
                        height: `${previewDims.h * deckScale}px`,
                      }}
                    >
                      {leftSlot?.kind === "toc" ? (
                        <div className="recipe-spread__blank-decoration" aria-hidden />
                      ) : null}
                      {reason || actions ? (
                        <div className="recipe-spread__blank-note no-print">
                          {reason ? (
                            <>
                              <p className="recipe-spread__blank-note-title">Blank page</p>
                              <p className="recipe-spread__blank-note-reason">{reason}</p>
                            </>
                          ) : null}
                          {actions}
                        </div>
                      ) : null}
                    </div>
                  );
                  // One page of a spread. On a phone it is a screen of its own
                  // that the deck snaps to (print.css), a stacked spread being
                  // two of them; elsewhere it adds no box (`display: contents`).
                  // `data-focus-sheet` is the page a tap on it would focus,
                  // which is what the phone's toolbar follows as you scroll.
                  // Also how a jump to a particular page finds its screen.
                  const cell = (sheetIndex: number | null, page: ReactNode) =>
                    page ? (
                      <div
                        className="recipe-spread__cell"
                        data-focus-sheet={
                          sheetIndex === null
                            ? undefined
                            : linkedSpread
                              ? linkedFocusSheet ?? sheetIndex
                              : // A blank page has nothing to edit: the
                                // toolbar stays on the page facing it.
                                navIndexForSheet.has(sheetIndex)
                                ? sheetIndex
                                : undefined
                        }
                      >
                        {page}
                      </div>
                    ) : null;
                  // Far from the reader, and not printing: hold the page's box
                  // and draw nothing in it. See DECK_WINDOW.
                  const drawn = renderAllPages || Math.abs(index - activeNavIndex) <= DECK_WINDOW;
                  const renderSide = (
                    sheetIndex: number | null,
                    role: "left" | "right" | "single",
                  ) => {
                    if (sheetIndex === null) {
                      return hostsImport(role) ? renderHostedImport(blankHostedImport!) : renderBlank();
                    }
                    const pageSheet = sheets[sheetIndex];
                    if (!pageSheet) return renderBlank();
                    const ni = navIndexForSheet.get(sheetIndex);
                    const pageNav = ni != null ? navItems[ni] : null;
                    // A blank leaf is drawn even far away: it costs nothing,
                    // and a phone leaves it out (`renderBlank`), where a
                    // full-size placeholder vanishing on arrival would jump
                    // the scroll.
                    if (!drawn && pageNav) {
                      return (
                        <PagePlaceholder
                          width={previewDims.w}
                          height={previewDims.h}
                          scale={deckScale}
                        />
                      );
                    }
                    if (!pageNav) {
                      // A blank leaf the book prints on purpose: say why, on
                      // screen only, so it isn't mistaken for a missing page.
                      const isBlankLeaf = pageSheet.slots.some((slot) => slot?.kind === "blank");
                      // Page 1 is where a dedication goes. When the book has
                      // none and opens on a pair that cannot start there, page 1
                      // prints blank, and the dedication is exactly what would
                      // fill it, so offer it on the page itself.
                      const isOpeningPage =
                        isBlankLeaf &&
                        sheets
                          .slice(0, sheetIndex)
                          .every((earlier) =>
                            earlier.slots.some((slot) => slot?.kind === "cover" && slot.side === "front"),
                          );
                      const besideChapter = role === "right" && chapterBlankActions !== null;
                      if (hostsImport(role)) return renderHostedImport(blankHostedImport!);
                      return renderBlank(
                        false,
                        isBlankLeaf
                          ? besideChapter
                            ? "Give this chapter an image page, or start it with a recipe."
                            : blankPageReason(sheets, sheetIndex)
                          : undefined,
                        isOpeningPage && onAddDedication ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact recipe-spread__blank-note-action"
                            onClick={(event) => {
                              event.stopPropagation();
                              onAddDedication();
                            }}
                          >
                            <PlusIcon size={ICON_SIZE.sm} />
                            Add dedication
                          </button>
                        ) : role === "right" ? (
                          chapterBlankActions
                        ) : undefined,
                      );
                    }
                    // A linked spread (image or TOC) outlines both pages when
                    // either is focused; a normal spread, and a section spread,
                    // only the specific page — a section spread gets its OWN
                    // outer ring instead (`recipe-spread--section-focused` below),
                    // which does not suppress this one, so both show at once.
                    const isFocused =
                      isActive &&
                      (linkedSpread
                        ? focusedSheet === spread.left || focusedSheet === spread.right
                        : focusedSheet === sheetIndex);
                    return (
                      <div
                        className={`recipe-spread__page ${isFocused ? "is-focused" : ""}`}
                        onMouseDown={notePhotoPointer}
                        onClick={(event) => {
                          event.stopPropagation();
                          openPhotoOnClick(pageNav, isFocused)(event);
                          // A linked spread's click focuses the pair's ONE editable
                          // page no matter which half was clicked (the recipe for
                          // an image spread). A section spread has no such override
                          // — `linkedFocusSheet` is null for it — so this focuses
                          // whichever half was actually clicked.
                          focusSheetInSpread(
                            index,
                            linkedSpread ? linkedFocusSheet ?? sheetIndex : sheetIndex,
                          );
                        }}
                        // Per HALF, not per spread: double-clicking the recipe
                        // opens its editor, and double-clicking the facing photo
                        // does nothing, which is right — there is no text there
                        // to have been aiming at.
                      >
                        {renderDeckPage(pageNav, pageSheet, isFocused, role)}
                      </div>
                    );
                  };
                  return (
                    <Fragment key={`spread-${index}`}>
                    <div
                      ref={(el) => {
                        slideRefs.current[index] = el;
                      }}
                      className={`recipe-page-slide recipe-page-slide--spread ${isActive ? "is-active" : ""} ${
                        spread.single ? "recipe-page-slide--single" : ""
                      }`}
                      data-first={index === 0 ? "true" : undefined}
                      onClick={() => {
                        if (!isActive) goToSlide(index);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-current={isActive}
                      aria-label={`Spread ${index + 1}`}
                      data-action-hint={`${isActive ? "View" : "Go to"} spread ${index + 1}`}
                    >
                      {isActive &&
                        activeNavItem &&
                        renderActiveControls(
                          activeNavItem,
                          // A linked spread is one page as far as the reader is
                          // concerned, so its toolbar spans both sheets and sits
                          // centred over the pair. Every other spread, a chapter
                          // opener's included, floats the toolbar over the half
                          // being edited.
                          linkedSpread
                            ? spreadWidth * deckScale
                            : previewDims.w * deckScale,
                          linkedSpread || spread.single || stackSpreads
                            ? 0
                            : focusedSheet === spread.left
                              ? -((previewDims.w * deckScale + 12) / 2)
                              : (previewDims.w * deckScale + 12) / 2,
                        )}
                      <div
                        className={`recipe-spread ${spread.single ? "recipe-spread--single" : ""} ${
                          isActive &&
                          linkedSpread &&
                          (focusedSheet === spread.left || focusedSheet === spread.right)
                            ? "recipe-spread--image-focused"
                            : ""
                        } ${
                          isActive &&
                          isSectionSpread &&
                          (focusedSheet === spread.left || focusedSheet === spread.right)
                            ? "recipe-spread--section-focused"
                            : ""
                        }`}
                      >
                        {spread.single
                          ? cell(spread.right ?? spread.left, renderSide(spread.right ?? spread.left, "single"))
                          : (
                            <>
                              {cell(spread.left, renderSide(spread.left, "left"))}
                              {cell(spread.right, spread.right === null && hostsImport("right")
                                ? renderHostedImport(blankHostedImport!)
                                : spread.right === null && index === spreads.length - 1
                                ? renderBlank(
                                    !designedBlank,
                                    chapterBlankActions
                                      ? "Give this chapter an image page, or start it with a recipe."
                                      : undefined,
                                    chapterBlankActions,
                                  )
                                : renderSide(spread.right, "right"))}
                            </>
                          )}
                      </div>
                    </div>
                    {index === pendingAnchorSpreadIndex && (
                      <>
                        {failedPages}
                        {pendingPages}
                      </>
                    )}
                    </Fragment>
                  );
                })
              : navItems.map((navItem, index) => {
              const sheet = sheets[navItem.sheetIndex];
              if (!sheet) return null;
              const isActive = index === activeNavIndex;
              // Only the first nav item for a given sheet renders the markup
              // that actually prints (the whole sheet, both slots). A second
              // recipe sharing that sheet gets its own on-screen-only slide
              // (`.no-print`) so scrolling can reach it like any other
              // recipe, without the sheet printing twice.
              const isFirstOnSheet = firstNavIndexBySheet.get(navItem.sheetIndex) === index;
              return (
                <Fragment key={`${sheet.id}-${navItem.slotIndex}`}>
                <div
                  ref={(el) => {
                    slideRefs.current[index] = el;
                  }}
                  className={`recipe-page-slide ${isActive ? "is-active" : ""} ${
                    navItem.recipeId && settlingIds?.has(navItem.recipeId) ? "is-settling" : ""
                  } ${
                    isFirstOnSheet ? "" : "no-print"
                  }`}
                  data-first={index === 0 ? "true" : undefined}
                  onMouseDown={notePhotoPointer}
                  onClick={(event) => {
                    if (!isActive) {
                      goToSlide(index);
                      return;
                    }
                    openPhotoOnClick(navItem, true)(event);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive}
                  aria-label={navItem.label}
                  data-action-hint={`${isActive ? "View" : "Go to"} ${navItem.label ?? "page"}`}
                  onKeyDown={(event) => {
                    if (
                      event.target instanceof HTMLInputElement ||
                      event.target instanceof HTMLTextAreaElement ||
                      event.target instanceof HTMLButtonElement ||
                      // The inline rich fields are contentEditable divs, not
                      // inputs. Without this the slide's own Space shortcut
                      // preventDefault()s every space typed into a recipe:
                      // "noodles, cooked" could not be typed at all.
                      (event.target instanceof HTMLElement && event.target.isContentEditable)
                    ) {
                      return;
                    }
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    if (isActive) return;
                    goToSlide(index);
                  }}
                >
                  {/* Same bar as the spread view, from the same function —
                      this copy had been hand-maintained alongside it and had
                      already drifted (text arrows instead of chevrons, and no
                      exclusion for a section's art page). */}
                  {isActive &&
                    activeNavItem &&
                    renderActiveControls(activeNavItem, previewDims.w * deckScale)}
                  {!(renderAllPages || Math.abs(index - activeNavIndex) <= DECK_WINDOW) ? (
                    <PagePlaceholder
                      // The SAME box the real page occupies. A cookbook page is
                      // the preset's sheet (see `presetCardDims`), not the
                      // fixed card, and the placeholder kept the card — so
                      // every page crossing DECK_WINDOW while you scrolled
                      // swapped one height for another, moved everything below
                      // it, and left mandatory snap to re-resolve mid-gesture.
                      // That is the scroll passing a page and being pulled
                      // back onto it.
                      // `previewDims`, so an undrawn page holds open exactly
                      // the box the drawn one occupies. Deriving it separately
                      // here is what let the two disagree in the first place.
                      width={previewDims.w}
                      height={previewDims.h}
                      scale={deckScale}
                    />
                  ) : (
                  <ScaledPage
                    preset={projectMeta.meta.cookbookPreset}
                    sheet={sheet}
                    isLastSheet={navItem.sheetIndex === sheets.length - 1}
                    activeSlotIndex={navItem.slotIndex}
                    activeSide={isActive ? canvasSide : "front"}
                    scale={deckScale}
                    size={previewCardSize}
                    template={previewTemplate}
                    fontScale={previewFontScale}
                    pageLooks={projectMeta.meta.pageLooks}
                    sampleLines={projectMeta.meta.sampleLines}
                    elementTargets={isActive}
                    photoScale={previewPhotoScale}
                    doubleSided={continueOnBack}
                    cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
                    showEmptyFields={showEmptyFields}
                    // A recipe with no link shows its "+ Link" prompt while it
                    // is the one being edited. Outside a cookbook it is gated on
                    // the setting itself, so it never offers a link line the
                    // cook has turned off.
                    showDescription={showDescription}
                    revealSourceUrl={
                      !activeRecipeItem?.recipe?.sourceUrl &&
                      isActive &&
                      activeRecipeItem?.id === navItem.recipeId &&
                      (Boolean(projectMeta.meta.cookbookMode) || showSourceUrl)
                    }
                    showCutLines={showCutLines && cardSize === "card-6x4"}
                    inlineEdit={
                      isActive && activeRecipeItem?.id === navItem.recipeId
                        ? activeInlineEdit
                        : undefined
                    }
                    dividerEdit={
                      isActive && navItem.kind === "divider"
                        ? buildDividerEdit(navItem.recipeId)
                        : undefined
                    }
                    coverEdit={
                      isActive && navItem.kind === "cover"
                        ? {
                            side: coverSideFromNavItem(navItem),
                            cover: coverForSide(coverSideFromNavItem(navItem)) ?? defaultCover(),
                            onChange: (cover) => setCoverForSide(coverSideFromNavItem(navItem), cover),
                            recipeImages: coverPhotoCandidates,
                          }
                        : undefined
                    }
                    tocKicker={projectMeta.meta.tocKicker}
                    tocTitle={projectMeta.meta.tocTitle}
                    tocEdit={
                      isActive && navItem.kind === "toc"
                        ? {
                            kicker: projectMeta.meta.tocKicker ?? "Contents",
                            title: projectMeta.meta.tocTitle ?? "What's inside",
                            onKickerChange: projectMeta.setTocKicker,
                            onTitleChange: projectMeta.setTocTitle,
                          }
                        : undefined
                    }
                  />
                  )}
          </div>
                  {index === pendingAnchorIndex && (
                    <>
                      {failedPages}
                      {pendingPages}
                    </>
                  )}
                </Fragment>
              );
            })}
          {(cookbookView ? pendingAnchorSpreadIndex === null : pendingAnchorIndex === null) && (
            <>
              {failedPages}
              {pendingPages}
            </>
          )}
          </div>
        </section>
  );
}
