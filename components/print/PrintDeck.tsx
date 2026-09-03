"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import type {
  ComponentProps,
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SetStateAction,
} from "react";
import Link from "next/link";
import { AccountControl } from "@/components/AccountControl";
import { LogoMark, Wordmark } from "@/components/Logo";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ICON_SIZE,
  InfoIcon,
  PrintIcon,
  SettingsIcon,
  SpinnerIcon,
  MoveToSectionIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { MoveToSectionMenu } from "@/components/print/MoveToSectionMenu";
import { ZoomControl } from "@/components/print/ZoomControl";
import { ScaledPage } from "@/components/print/ScaledPage";
import { PHOTO_STYLE_OPTIONS } from "@/components/print/photoStyle";
import { formatRecipeTime } from "@/lib/time";
import { gutterSideForRole } from "@/lib/cookbookPresets";
import { chapterIntroFromRecipes, chapterRecipeTitles } from "@/lib/chapterIntro";
import {
  BodyTextGlyph,
  HeadingGlyph,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import type { NavItem, PageSheet, SheetSlot, usePrintSheets } from "@/lib/usePrintSheets";
import type { PhotoStyle, useProjectMeta } from "@/lib/project";
import type { useDeckScroller } from "@/lib/useDeckScroller";
import { isPhotoOpenClick, type PhotoPress } from "@/lib/photoOpenGesture";
import { applyRichTextToField, focusedInlineField } from "@/lib/richTextField";
import type { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import type { CoverConfig, QueueItem, Section } from "@/types/recipe";

type DividerEdit = NonNullable<ComponentProps<typeof ScaledPage>["dividerEdit"]>;
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
const TEXT_DRAG_SLOP = 6;

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
].join(", ");

export const DECK_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/** The recipe's two text columns — the only places a drag means "edit this". */
const TEXT_COLUMNS = ".recipe-card__ingredients, .recipe-card__method";

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
 * Exported because the print page needs the same answer: it parks the deck on
 * the placeholder while the import runs, and to do that without a second jump
 * when the recipe lands it has to know which slot the recipe is about to take.
 * Two implementations of that answer would be two places for it to drift.
 */
export function pendingAnchorIndexIn(
  navItems: NavItem[],
  pendingAddAfterRecipeId: string | null,
): number | null {
  if (!pendingAddAfterRecipeId) return null;
  return navItems.reduce<number | null>(
    (last, navItem, index) => (navItem.recipeId === pendingAddAfterRecipeId ? index : last),
    null,
  );
}

/**
 * The nav index the arriving recipe will occupy — the slot the placeholder is
 * standing in. Last when the import has no anchor, which is where an
 * unanchored import lands.
 */
export function pendingSlotIndexIn(
  navItems: NavItem[],
  pendingAddAfterRecipeId: string | null,
): number {
  const anchor = pendingAnchorIndexIn(navItems, pendingAddAfterRecipeId);
  return anchor === null ? navItems.length : anchor + 1;
}

interface PrintDeckProps {
  // Layout / preview geometry
  singleRecipePrintView: boolean;
  cookbookView: boolean;
  previewMeasuring: boolean;
  previewDims: { w: number; h: number };
  spreadWidth: number;
  previewCardSize: PrintCardSize;
  previewTemplate: RecipePrintTemplate;
  continueOnBack: boolean;
  cardSize: PrintCardSize;
  showCutLines: boolean;
  showSourceUrl: boolean;
  sourceUrlOn: boolean;
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
  activeInlineEdit: ReturnType<typeof useRecipeInlineEditor>["activeInlineEdit"];
  editingSectionId: string | null;
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
  renderSectionPhotoControl: (sectionId: string) => ReactNode;
  renderCoverPhotoControl: (side: "front" | "back" | "dedication") => ReactNode;
  renderImagePagePhotoControl: (recipeId: string) => ReactNode;
  openAddRecipeBelow: (navItem?: NavItem | null) => void;
  /** Imports still parsing. Each gets a page-shaped placeholder at the end of
      the deck — see the render. Errors are NOT here; they surface as a toast. */
  parsingImportCount: number;
  /** The recipe an import was added BELOW, if any — the deck places its
      placeholder page right after that recipe, the way the rail does. */
  pendingAddAfterRecipeId: string | null;
  photoModeFor: (recipeId: string) => PhotoStyle;
  setRecipePhotoMode: (recipeId: string, mode: PhotoStyle) => void;
  // Mobile topbar
  sizeMenuOpen: boolean;
  setSizeMenuOpen: Dispatch<SetStateAction<boolean>>;
  settingsMenuOpen: boolean;
  setSettingsMenuOpen: Dispatch<SetStateAction<boolean>>;
  hasPrintSettingsFields: boolean;
  renderPrintSettingsFields: () => ReactNode;
  handleMobilePrint: () => void;
  printBlocked: boolean;
  printSpinner: boolean;
  cookbookLocked: boolean;
  templateLocked: boolean;
  /** Draw every page regardless of the window — set while printing, when the
      deck IS the output and a placeholder would print blank. */
  renderAllPages: boolean;
}

// The center deck: the mobile topbar plus the scrolling page preview. Two render
// paths — the cookbook two-page spread view (focus-linked image/section spreads)
// and the flat single-page card view — with inline edit controls, per-page photo
// controls, and the front/back side switcher. Verbatim move out of the print
// god-file; `renderActiveControls` and `renderDeckPage` moved in as internals.
export function PrintDeck(props: PrintDeckProps) {
  // Where the shared move menu should open, or null when it is closed. The
  // menu closes itself on an outside press, Escape, a scroll or a resize.
  const [moveMenuAt, setMoveMenuAt] = useState<{ x: number; y: number } | null>(null);
  const {
    singleRecipePrintView,
    cookbookView,
    previewMeasuring,
    previewDims,
    spreadWidth,
    previewCardSize,
    previewTemplate,
    continueOnBack,
    cardSize,
    showCutLines,
    showSourceUrl,
    sourceUrlOn,
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
    activeInlineEdit,
    editingSectionId,
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
    renderSectionPhotoControl,
    renderCoverPhotoControl,
    renderImagePagePhotoControl,
    openAddRecipeBelow,
    parsingImportCount,
    pendingAddAfterRecipeId,
    photoModeFor,
    setRecipePhotoMode,
    sizeMenuOpen,
    setSizeMenuOpen,
    settingsMenuOpen,
    setSettingsMenuOpen,
    hasPrintSettingsFields,
    renderPrintSettingsFields,
    handleMobilePrint,
    printBlocked,
    printSpinner,
    cookbookLocked,
    templateLocked,
    renderAllPages,
  } = props;


  // Whether this page's reveal is on. Chapter openers and the contents page
  // used to answer this with a mode of their own — an Edit button that made
  // their text editable at all — while a recipe and a cover answered it with
  // the reveal. Every page kind now edits by clicking its text, so there is one
  // state left to be in, and one question to ask about it.
  const isEditingNavItem = (navItem: NavItem) =>
    navItem.kind !== "image" && navItem.kind !== "section-photo" && showEmptyFields;

  /**
   * Body ↔ heading for the line being edited, as a group in the toolbar.
   *
   * It used to float directly above the field (`.recipe-card__line-kind`),
   * which meant it jumped to a new spot on every click, had to stay 20×15 to
   * fit in the gap between two rows of a measured column, and still sat on top
   * of the line above. In the bar it holds still, at the size of every other
   * control, and the card underneath is just the card.
   *
   * `onMouseDown` with `preventDefault`, not `onClick`: the button would
   * otherwise pull focus off the textarea, and blur commits the edit — so the
   * line would be written back before the kind change ever reached it.
   */
  const renderLineKindControl = (navItem: NavItem) => {
    // Mirrors the gate on ScaledPage's `inlineEdit` below: the switch belongs
    // to the recipe actually being edited, not to whatever page has focus.
    if (navItem.kind !== "recipe") return null;
    if (!activeInlineEdit || activeRecipeItem?.id !== navItem.recipeId) return null;
    const target = activeInlineEdit.editingTarget;
    if (!target) return null;
    // Only a line has a kind to change. The title, description, times and the
    // link are themselves and can't become headings.
    if (
      target.kind !== "ingredient" &&
      target.kind !== "step" &&
      target.kind !== "ingredientSection" &&
      target.kind !== "instructionSection"
    ) {
      return null;
    }
    const isHeading =
      target.kind === "ingredientSection" || target.kind === "instructionSection";
    return (
      <div className="recipe-page-toolbar__group" role="group" aria-label="Line type">
        {/* Heading first: it is the one being reached for. Body is where the
            line already is. */}
        <button
          type="button"
          className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
            isHeading ? "is-active" : ""
          }`}
          aria-label="Heading"
          aria-pressed={isHeading}
          title="Heading"
          onMouseDown={(event) => {
            event.preventDefault();
            if (!isHeading) activeInlineEdit.onSetLineKind(target, "heading");
          }}
        >
          <HeadingGlyph />
        </button>
        <button
          type="button"
          className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
            isHeading ? "" : "is-active"
          }`}
          aria-label="Body text"
          aria-pressed={!isHeading}
          title="Body text"
          onMouseDown={(event) => {
            event.preventDefault();
            if (isHeading) activeInlineEdit.onSetLineKind(target, "body");
          }}
        >
          <BodyTextGlyph />
        </button>
      </div>
    );
  };

  /**
   * Bold and italic for the text being edited, as a group in the toolbar.
   *
   * `onMouseDown` with `preventDefault`, exactly like the line-kind switch
   * above and for the same reason: a button that took focus would blur the
   * field, and blur commits — so the styling would land on a field already
   * written back and closed. Keeping focus is also what lets this read the live
   * selection straight off the focused element, instead of mirroring a
   * selection into React state on every keystroke.
   */
  const renderTextStyleControl = (navItem: NavItem) => {
    if (navItem.kind !== "recipe") return null;
    if (!activeInlineEdit || activeRecipeItem?.id !== navItem.recipeId) return null;
    if (!activeInlineEdit.editingTarget) return null;

    const apply = (style: "bold" | "italic") => (event: ReactMouseEvent) => {
      event.preventDefault();
      const field = focusedInlineField();
      if (!field) return;
      applyRichTextToField(field, style, activeInlineEdit.onValueChange);
    };

    return (
      <div className="recipe-page-toolbar__group" role="group" aria-label="Text style">
        <button
          type="button"
          className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon"
          aria-label="Bold"
          title="Bold (⌘B)"
          onMouseDown={apply("bold")}
        >
          <span className="recipe-page-toolbar__style-glyph recipe-page-toolbar__style-glyph--bold">
            B
          </span>
        </button>
        <button
          type="button"
          className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon"
          aria-label="Italic"
          title="Italic (⌘I)"
          onMouseDown={apply("italic")}
        >
          <span className="recipe-page-toolbar__style-glyph recipe-page-toolbar__style-glyph--italic">
            I
          </span>
        </button>
      </div>
    );
  };

  /**
   * One bar holding everything that acts on the page you're looking at.
   *
   * Front/Back used to sit centred over the page while Edit sat off at its
   * right edge — two floating islands doing the same job for the same page,
   * reading as unrelated chrome. As one bar with hairline dividers they read
   * as a set of tools, and there is somewhere for a group to APPEAR: the
   * line-kind switch joins the bar while a line is being edited instead of
   * opening a third island over the artwork.
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
     * Does this page have a field nobody can see yet?
     *
     * "More fields" reveals the slots a page has not filled in. On a page where
     * everything IS filled in it reveals nothing, so offering it is offering a
     * button that does nothing — and the reveal is the button's whole job now
     * that the text is editable by clicking it.
     *
     * Asked of every page that has text. It used to skip chapter openers and
     * the contents page because those had a real edit mode behind this button,
     * which was a different question from whether anything was missing; now
     * that they edit by being clicked, it is the same question.
     */
    const pageHasHiddenFields = (): boolean => {
      if (navItem.kind === "recipe") {
        const recipe = items?.find((item) => item.id === navItem.recipeId)?.recipe;
        if (!recipe) return false;
        const cookbook = Boolean(projectMeta.meta.cookbookMode);
        return (
          recipe.ingredients.length === 0 ||
          recipe.instructions.length === 0 ||
          !formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime) ||
          !(recipe.servings ?? recipe.yield) ||
          (cookbook && !recipe.description) ||
          // The link field only exists while the source-link setting is on, so
          // a missing link is only a hidden FIELD when that field would show.
          (showSourceUrl && !recipe.sourceUrl)
        );
      }
      if (navItem.kind === "cover") {
        const side = coverSideFromNavItem(navItem);
        const cover = coverForSide(side);
        if (!cover) return true;
        // The opening page's heading prints as "Dedication" when nobody types
        // one, so it is never an empty slot — it always has something to click.
        if (side === "dedication") return !cover.blurb || !cover.author;
        if (side === "back") return !cover.blurb || !cover.author;
        return !cover.subtitle || !cover.title || !cover.author || !cover.edition;
      }
      if (navItem.kind === "divider") {
        // The title always prints, and the intro prints the chapter's recipe
        // names when nobody has written one — so the subtitle is the opener's
        // only line that can be invisible for want of being written.
        const section = sections.find((candidate) => candidate.id === navItem.recipeId);
        return !section?.subtitle?.trim();
      }
      // Nothing on the contents page can be missing: both of its lines print a
      // default ("Contents", "What's inside") when nobody types one, and the
      // entries are generated.
      if (navItem.kind === "toc") return false;
      return true;
    };

    // Whether this KIND of page has an edit/reveal button at all.
    const editable =
      navItem.kind !== "image" && navItem.kind !== "section-photo" && !navItem.continued;
    // Whether to actually offer it. Separate from `editable` on purpose: the
    // first decides whether the page has text to work on, the second whether
    // there is anything left for the button to reveal.
    //
    // Already-on stays on, so pressing it to reveal a field and then filling
    // that field in doesn't pull "Done" out from under the cursor.
    const showFieldsButton = editable && (showEmptyFields || pageHasHiddenFields());
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
          ? renderSectionPhotoControl(navItem.recipeId)
          : navItem.kind === "cover"
            ? renderCoverPhotoControl(coverSideFromNavItem(navItem))
            : // The art pages: a full-page recipe photo, and a chapter's facing
              // art. These used to carry their own button ON the picture, which
              // is the last place the dialog was reachable from anywhere but
              // here.
              navItem.kind === "image"
              ? renderImagePagePhotoControl(navItem.recipeId)
              : navItem.kind === "section-photo"
                ? renderSectionPhotoControl(navItem.recipeId)
                : null;
    const lineKind = editable ? renderLineKindControl(navItem) : null;
    const textStyle = editable ? renderTextStyleControl(navItem) : null;

    /**
     * The way back to the derived chapter intro.
     *
     * An opener left alone names the recipes filed under it, and re-words itself
     * whenever they move. Typing an intro of your own replaces that line for
     * good — nothing overwrites what a cook wrote — which leaves no way back
     * except guessing that emptying the field restores it. So the offer is made
     * out loud, while that chapter is being edited and only once there is
     * something to undo, and it says the line it would restore.
     *
     * Under the reveal, with the rest of "show me everything about this page" —
     * an opener has no edit mode of its own left to hang it on, and a button
     * standing there permanently would be shouting an offer nobody asked for.
     *
     * In the toolbar rather than beside the field it resets: the card is drawn
     * at print scale, where 9px of app chrome lands at about a third of a
     * legible size.
     */
    const introReset = (() => {
      if (navItem.kind !== "divider" || !showEmptyFields) return null;
      const section = sections.find((candidate) => candidate.id === navItem.recipeId);
      if (!section?.intro?.trim()) return null;
      return {
        sectionId: section.id,
        derived: chapterIntroFromRecipes(chapterRecipeTitles(section.items)),
      };
    })();

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
     * one. "New chapter" is always the last item.
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

    // The art pages have no text and no reveal, but they DO have a photo — and
    // the toolbar is the only place their photo can be changed from now.
    if (!navItem.flip && !editable && !photoControl) return null;
    return (
      <div
        className="recipe-page-canvas__controls no-print"
        style={{
          "--preview-w": `${previewW}px`,
          "--preview-offset": `${horizontalOffset}px`,
        } as CSSProperties}
      >
        <div className="recipe-page-toolbar">
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
          {navItem.kind === "toc" && !navItem.continued && (
            <div className="recipe-page-toolbar__group recipe-page-toolbar__hint">
              <InfoIcon size={ICON_SIZE.sm} aria-hidden />
              <span>Edit a chapter or recipe to change these entries.</span>
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
          {lineKind}
          {textStyle}
          {showFieldsButton && (
            <div className="recipe-page-toolbar__group">
              <button
                type="button"
                className={`recipe-page-toolbar__btn ${editing ? "is-active" : ""}`}
                aria-pressed={editing}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleShowEmptyFields();
                }}
              >
                {/* This no longer opens an editor on any page -- the text is
                    editable by clicking it. What is left for it to do is show
                    the fields the page does NOT have filled in, which cannot be
                    clicked into existence because they take up no room. So it
                    says what appears rather than "Edit", which would promise a
                    mode that is not there any more. */}
                {editing ? "Done" : "More fields"}
              </button>
            </div>
          )}
          {introReset && (
            <div className="recipe-page-toolbar__group">
              <button
                type="button"
                className="recipe-page-toolbar__btn"
                title={introReset.derived}
                onClick={(event) => {
                  event.stopPropagation();
                  projectMeta.setSectionIntro(introReset.sectionId, undefined);
                }}
              >
                Use recipe names
              </button>
            </div>
          )}
          {/* After Edit, with Move and Delete: this is an icon among icons, and
              it led the bar only because that is where the placement toggle it
              replaced used to sit. */}
          {photoControl && <div className="recipe-page-toolbar__group">{photoControl}</div>}
          {/* Move this recipe into another chapter.
              
              Until now the only way was the Organize panel: leave the page you
              are looking at, find the recipe again in a different
              representation, and drag it. But "this belongs in Desserts" is a
              thought you have while looking AT the recipe, which is where this
              bar already is.
              
              Recipes only. A divider, the cover and the contents page have no
              chapter to be moved between. */}
          {moveSections && (
            <div className="recipe-page-toolbar__group">
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
            </div>
          )}
          {/* Delete, last and on its own: the Delete key already did this, and
              a key is not a control anyone finds. Its own group so it is not
              adjacent to Edit — the two are one pixel apart otherwise, and one
              of them is not undoable. */}
          <div className="recipe-page-toolbar__group">
            <button
              type="button"
              className="recipe-page-toolbar__btn recipe-page-toolbar__btn--icon recipe-page-toolbar__btn--danger"
              aria-label={`Delete ${navItem.label ?? "this page"}`}
              title="Delete"
              onClick={(event) => {
                event.stopPropagation();
                onRequestDelete(navItem);
              }}
            >
              <TrashIcon size={ICON_SIZE.md} />
            </button>
          </div>
        </div>
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
        projectMeta.updateSection(sectionId, { subtitle: value || undefined }),
      intro: section?.intro,
      onIntroChange: (value: string) => projectMeta.setSectionIntro(sectionId, value || undefined),
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
      doubleSided={continueOnBack}
      gutterSide={gutterSideForRole(role)}
      cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
      showEmptyFields={showEmptyFields}
      showSourceUrl={
        sourceUrlOn ||
        (showSourceUrl && showEmptyFields && focused && activeRecipeItem?.id === navItem.recipeId)
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
    const key =
      navItem.kind === "cover" ? `cover:${coverSideFromNavItem(navItem)}` : navItem.recipeId;
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
  const pendingPages =
    parsingImportCount > 0 ? (
      <>
        {Array.from({ length: parsingImportCount }).map((_, index) => (
          <div
            className="recipe-page-slide recipe-page-pending"
            key={`parsing-page-${index}`}
            // The deck scrolls itself here while the import parses. Found by
            // attribute rather than a ref because the placeholder is outside
            // the sheets pipeline and has no slot in `slideRefs` to hold one.
            data-pending-page={index === 0 ? "" : undefined}
          >
            <div
              className="recipe-page-pending__sheet"
              style={{
                width: previewDims.w * deckScale,
                aspectRatio: `${previewDims.w} / ${previewDims.h}`,
              }}
            >
              <RecipeLoadingState />
            </div>
          </div>
        ))}
      </>
    ) : null;


  return (
        <section
          className="recipe-page-canvas"
          aria-label="Selected page"
          data-single-recipe={singleRecipePrintView ? "true" : "false"}
        >
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

          {(sizeMenuOpen || settingsMenuOpen) && (
            <button
              type="button"
              className="recipe-mobile-size-menu-backdrop no-print"
              aria-label="Close menu"
              onClick={() => {
                setSizeMenuOpen(false);
                setSettingsMenuOpen(false);
              }}
            />
          )}
          <div className="recipe-mobile-topbar no-print">
            <Link href="/" className="recipe-mobile-topbar__logo" aria-label="RecipePrinter home">
              <LogoMark size={26} rounded={0} />
              <Wordmark className="text-[length:var(--cp-fs-wordmark-compact)] text-ink" />
            </Link>
            <div className="recipe-mobile-topbar__actions">
              {hasPrintSettingsFields && (
                <div className="recipe-mobile-toolbar__btn-wrap">
                  <button
                    type="button"
                    className={`recipe-mobile-topbar__icon-btn ${settingsMenuOpen ? "is-active" : ""}`}
                    aria-haspopup="true"
                    aria-expanded={settingsMenuOpen}
                    aria-label="Print settings"
                    onClick={() => {
                      setSizeMenuOpen(false);
                      setSettingsMenuOpen((open) => !open);
                    }}
                  >
                    <SettingsIcon size={ICON_SIZE.lg} />
                  </button>
                  {settingsMenuOpen && (
                    <div className="recipe-mobile-settings-menu" role="menu" aria-label="Print settings">
                      {renderPrintSettingsFields()}
                    </div>
                  )}
                </div>
              )}
              {/* Print is NOT here any more. It moved to the bottom bar, where the
                  thumb is and where the tools it finishes already live. */}
              {/* The same account control the desktop header carries. The two
                  bars cannot be identical — the desktop one centres the kind
                  tabs and still has room for Save, which 375px does not — but
                  "where is my account" should not have a different answer on a
                  phone, and it had none at all here. */}
              <AccountControl compact />
            </div>
          </div>
          <div
            className={`recipe-page-deck ${cookbookView ? "recipe-page-deck--book" : ""}`}
            id="recipe-page-deck"
            ref={deckRef}
          >
            {previewMeasuring ? (
              <RecipeLoadingState className="recipe-page-deck__loading" />
            ) : navItems.length === 0 ? (
              /* Deleting the last recipe leaves you standing in the workspace
                 you just emptied, not in an error. So the room stays: same
                 rail, same canvas, same settings panel — and where the pages
                 were, one page-shaped outline saying what would go there. */
              /* No wrapper around it. The sheet IS the deck's child, so the
                 deck's own centring and padding place it exactly where a real
                 page would be — anything in between only adds an offset a real
                 page does not have. */
              <div
                  className={`recipe-page-empty__sheet ${
                    previewCardSize === "card-6x4" ? "recipe-page-empty__sheet--card" : ""
                  }`}
                  /* The outline stands in for a page you have not made yet, so
                     it is the size that page WOULD be: `previewDims`, the
                     same box a real page is laid out at, not a fixed width
                     that happened to look about right. It follows the size
                     control and the zoom for the same reason. */
                  style={{
                    width: previewDims.w * deckScale,
                    aspectRatio: `${previewDims.w} / ${previewDims.h}`,
                  }}
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
                    <p className="recipe-page-empty__title">No pages yet</p>
                    <p className="recipe-page-empty__body">
                      Add a recipe and it will show up here, laid out and ready to print.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() => openAddRecipeBelow(null)}
                    >
                      <PlusIcon size={ICON_SIZE.md} />
                      Add recipes
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
                  // A chapter opener paired with its facing full-page/grid photo
                  // (a real `section-photo` sheet) is one logical unit — focus and
                  // outline them together like an image spread, and clicking either
                  // page focuses the opener, which owns the section's edit controls.
                  const isSectionSpread =
                    leftSlot?.kind === "divider" && rightSlot?.kind === "section-photo";
                  // Both an image spread and a section spread act as one editable
                  // unit; `linkedFocusSheet` is the page whose controls the pair
                  // shares — the recipe for an image spread, the opener for a
                  // section spread.
                  // Two contents pages facing each other are one opening, so
                  // they outline and select together and the first page owns
                  // the editing — the heading you can change lives there.
                  const isTocSpread =
                    leftSlot?.kind === "toc" && rightSlot?.kind === "toc";
                  const linkedSpread = isImageSpread || isSectionSpread || isTocSpread;
                  const linkedFocusSheet = isImageSpread
                    ? imageSpreadFocusSheet
                    : isSectionSpread || isTocSpread
                      ? spread.left
                      : null;
                  const designedBlank = leftSlot?.kind === "toc";
                  const renderBlank = (trailing = false) => (
                    <div
                      className={`recipe-spread__blank recipe-template--${previewTemplate} ${
                        designedBlank ? "recipe-spread__blank--designed" : ""
                      } ${trailing ? "recipe-spread__blank--trailing" : ""}`}
                      aria-label={
                        leftSlot?.kind === "toc"
                          ? `${RECIPE_PRINT_TEMPLATE_OPTIONS.find((option) => option.id === previewTemplate)?.label ?? "Template"} decorative page`
                          : undefined
                      }
                      aria-hidden={designedBlank ? undefined : true}
                      style={{
                        width: `${previewDims.w * deckScale}px`,
                        height: `${previewDims.h * deckScale}px`,
                      }}
                    >
                      {leftSlot?.kind === "toc" ? (
                        <div className="recipe-spread__blank-decoration" aria-hidden />
                      ) : null}
                    </div>
                  );
                  // Far from the reader, and not printing: hold the page's box
                  // and draw nothing in it. See DECK_WINDOW.
                  const drawn = renderAllPages || Math.abs(index - activeNavIndex) <= DECK_WINDOW;
                  const renderSide = (
                    sheetIndex: number | null,
                    role: "left" | "right" | "single",
                  ) => {
                    if (sheetIndex === null) return renderBlank();
                    const pageSheet = sheets[sheetIndex];
                    if (!pageSheet) return renderBlank();
                    if (!drawn) {
                      return (
                        <PagePlaceholder
                          width={previewDims.w}
                          height={previewDims.h}
                          scale={deckScale}
                        />
                      );
                    }
                    const ni = navIndexForSheet.get(sheetIndex);
                    const pageNav = ni != null ? navItems[ni] : null;
                    if (!pageNav) return renderBlank();
                    // A linked spread (image or section) outlines both pages when
                    // either is focused; a normal spread only the specific page.
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
                          // Focus the pair's editable page (the recipe for an image
                          // spread, the opener for a section spread) no matter which
                          // half was clicked, so its Edit controls are available.
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
                    <div
                      key={`spread-${index}`}
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
                    >
                      {isActive &&
                        activeNavItem &&
                        renderActiveControls(
                          activeNavItem,
                          // A linked spread is one page as far as the reader is
                          // concerned, so its toolbar spans both sheets and sits
                          // centred over the pair.
                          linkedSpread
                            ? spreadWidth * deckScale
                            : previewDims.w * deckScale,
                          linkedSpread || spread.single
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
                        }`}
                      >
                        {spread.single
                          ? renderSide(spread.right ?? spread.left, "single")
                          : (
                            <>
                              {renderSide(spread.left, "left")}
                              {spread.right === null && index === spreads.length - 1
                                ? renderBlank(!designedBlank)
                                : renderSide(spread.right, "right")}
                            </>
                          )}
                      </div>
                    </div>
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
                  onKeyDown={(event) => {
                    if (
                      event.target instanceof HTMLInputElement ||
                      event.target instanceof HTMLTextAreaElement ||
                      event.target instanceof HTMLButtonElement
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
                    doubleSided={continueOnBack}
                    cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
                    showEmptyFields={showEmptyFields}
                    // While actively editing with the checkbox on, keep the link
                    // field visible even if deleting it just made this the only
                    // recipe without one (which flips the cross-recipe
                    // `sourceUrlOn` gate off) — otherwise clearing it mid-edit
                    // hides the very field that would let the user type it back
                    // in. Gated on the checkbox itself so Edit never shows a
                    // link field the user has turned off.
                    showSourceUrl={
                      sourceUrlOn ||
                      (showSourceUrl && showEmptyFields && isActive && activeRecipeItem?.id === navItem.recipeId)
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
                  {index === pendingAnchorIndex && pendingPages}
                </Fragment>
              );
            })}
          {pendingAnchorIndex === null && pendingPages}
          </div>
        </section>
  );
}
