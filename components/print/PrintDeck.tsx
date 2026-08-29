"use client";

import { useEffect, useRef, useState } from "react";
import type {
  ComponentProps,
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SetStateAction,
} from "react";
import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/Logo";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ICON_SIZE,
  PrintIcon,
  SettingsIcon,
  SpinnerIcon,
  MinusIcon,
  MoveToSectionIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { ScaledPage } from "@/components/print/ScaledPage";
import { PHOTO_STYLE_OPTIONS } from "@/components/print/photoStyle";
import { formatRecipeTime } from "@/lib/time";
import { PAGE_DIMS } from "@/lib/printGeometry";
import { gutterSideForRole } from "@/lib/cookbookPresets";
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
  // A chapter opener's photo band.
  ".recipe-card__chapter-photo",
  // A cover's artwork — the single-photo and collage variants share this class.
  ".recipe-card__cover-photo",
  // Both full-page art surfaces: a recipe's facing photo and a chapter's.
  // There is no `.recipe-image-spread` wrapper, only this element.
  ".recipe-image-spread__photo",
].join(", ");

const DECK_ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

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
  editingToc: boolean;
  setEditingToc: Dispatch<SetStateAction<boolean>>;
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
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  // Click-away and Escape, the same contract the deck's other menus have.
  useEffect(() => {
    if (!zoomMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!zoomMenuRef.current?.contains(event.target as Node)) setZoomMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setZoomMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [zoomMenuOpen]);

  const [moveMenuOpen, setMoveMenuOpen] = useState(false);
  const moveMenuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!moveMenuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (!moveMenuRef.current?.contains(event.target as Node)) setMoveMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMoveMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moveMenuOpen]);

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
    editingToc,
    setEditingToc,
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

  // Whether this page's edit surface is live. The same four-way question was
  // spelled out at six call sites (class, aria-pressed and label, twice over
  // for the mobile copy of the bar) — which is exactly how the two copies
  // drifted apart. One predicate, asked everywhere.
  const isEditingNavItem = (navItem: NavItem) =>
    (navItem.kind === "recipe" && showEmptyFields) ||
    (navItem.kind === "divider" && editingSectionId === navItem.recipeId) ||
    (navItem.kind === "cover" && showEmptyFields) ||
    (navItem.kind === "toc" && editingToc);

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
     * Only asked of recipes and covers. The contents page and chapter openers
     * still have a real edit mode behind this button, which is a different
     * question from whether anything is missing.
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
          {showFieldsButton && (
            <div className="recipe-page-toolbar__group">
              <button
                type="button"
                className={`recipe-page-toolbar__btn ${editing ? "is-active" : ""}`}
                aria-pressed={editing}
                onClick={(event) => {
                  event.stopPropagation();
                  if (navItem.kind === "recipe") {
                    toggleShowEmptyFields();
                  } else if (navItem.kind === "divider") {
                    if (editingSectionId === navItem.recipeId) commitSectionEdit();
                    else startSectionEdit(navItem.recipeId);
                  } else if (navItem.kind === "toc") {
                    setEditingToc((current) => !current);
                  } else {
                    toggleShowEmptyFields();
                  }
                }}
              >
                {/* On a recipe or a cover this no longer opens an editor --
                    the text is already editable by clicking it. What is left
                    for it to do is show the fields the page does NOT have
                    filled in, which cannot be clicked into existence because
                    they take up no room. So it says what appears rather than
                    "Edit", which would promise a mode that is not there any
                    more. The contents page and chapter openers DO still have a
                    real edit mode, and still say Edit. */}
                {navItem.kind === "recipe" || navItem.kind === "cover"
                  ? editing
                    ? "Done"
                    : "More fields"
                  : editing
                    ? "Done"
                    : "Edit"}
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
              <div className="recipe-page-toolbar__picker" ref={moveMenuRef}>
                <button
                  type="button"
                  className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
                    moveMenuOpen ? "is-active" : ""
                  }`}
                  aria-haspopup="menu"
                  aria-expanded={moveMenuOpen}
                  aria-label="Move to another chapter"
                  title="Move to another chapter"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMoveMenuOpen((open) => !open);
                  }}
                >
                  <MoveToSectionIcon size={ICON_SIZE.md} />
                </button>
                {moveMenuOpen && (
                  <div className="recipe-page-toolbar__menu" role="menu" aria-label="Move to chapter">
                    {moveSections.options.map((section) => (
                      <button
                        key={section.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={section.id === moveSections.currentId}
                        disabled={section.id === moveSections.currentId}
                        className={`recipe-page-toolbar__option ${
                          section.id === moveSections.currentId ? "is-active" : ""
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setMoveMenuOpen(false);
                          if (section.id !== moveSections.currentId) {
                            onMoveRecipeToSection?.(moveSections.recipeId, section.id);
                          }
                        }}
                      >
                        {section.title}
                      </button>
                    ))}
                    {onMoveRecipeToNewSection && (
                      <button
                        type="button"
                        role="menuitem"
                        className="recipe-page-toolbar__option recipe-page-toolbar__option--new"
                        onClick={(event) => {
                          event.stopPropagation();
                          setMoveMenuOpen(false);
                          onMoveRecipeToNewSection(moveSections.recipeId);
                        }}
                      >
                        <PlusIcon size={ICON_SIZE.sm} />
                        New chapter
                      </button>
                    )}
                  </div>
                )}
              </div>
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
  // One page's ScaledPage with all its edit wiring. `focused` = this is the page
  // the controls act on (drives the active side + which edit surface is live).
  const renderDeckPage = (
    navItem: NavItem,
    sheet: PageSheet,
    focused: boolean,
    role: "left" | "right" | "single" = "single",
  ) => (
    <ScaledPage
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
      dividerEdit={
        focused && navItem.kind === "divider" && editingSectionId === navItem.recipeId
          ? {
              sectionId: navItem.recipeId,
              value: editingSectionTitle,
              // Saves the title live (like the subtitle/intro), so blurring the
              // field — to click the photo picker or another field — never loses
              // or dismisses the edit. The meta write behind it is throttled in
              // the page (see `editSectionTitle`) because each one re-packs the
              // whole book; the field stays instant either way.
              onChange: (value) => editSectionTitle(navItem.recipeId, value),
              onCommit: commitSectionEdit,
              onCancel: () => {
                setEditingSectionId(null);
                setEditingSectionTitle("");
              },
              subtitle: sections.find((section) => section.id === navItem.recipeId)?.subtitle,
              onSubtitleChange: (value) =>
                projectMeta.updateSection(navItem.recipeId, { subtitle: value || undefined }),
              intro: sections.find((section) => section.id === navItem.recipeId)?.intro,
              onIntroChange: (value) => projectMeta.setSectionIntro(navItem.recipeId, value || undefined),
            }
          : undefined
      }
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
        focused && navItem.kind === "toc" && editingToc
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
   * Double-clicking a recipe's text opens edit mode, exactly as the Edit button
   * does — because that is what people try first. The button is small, floats
   * above the page, and is easy not to notice; the text is the thing they are
   * looking at and want to change.
   *
   * Only ON, never off. Once editing, a double-click is how you select a word,
   * and having that close the editor mid-sentence would be maddening.
   *
   * Every kind that has an editor, not just recipes. Covers, chapter openers
   * and the contents each have their own idea of what "editing" means, which
   * is why this fans out by kind — but from the cook's side there is one rule
   * ("double-click the words to change them") rather than a rule that happens
   * to hold on recipe pages. Kinds with nothing to type into opt out below,
   * and they are exactly the kinds that show no Edit button either.
   */
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
  const photoPointerStart = useRef<{ x: number; y: number } | null>(null);
  const notePhotoPointer = (event: ReactMouseEvent) => {
    photoPointerStart.current = { x: event.clientX, y: event.clientY };
  };
  const openPhotoOnClick = (navItem: NavItem, active: boolean) => (event: ReactMouseEvent) => {
    if (!active) return;
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, textarea")) return;
    if (!target.closest(PHOTO_SURFACES)) return;
    const start = photoPointerStart.current;
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > PHOTO_CLICK_SLOP) {
      return;
    }
    const key =
      navItem.kind === "cover" ? `cover:${coverSideFromNavItem(navItem)}` : navItem.recipeId;
    if (key) openPhotoDialog(key);
  };

  const openEditOnDoubleClick = (navItem: NavItem) => (event: ReactMouseEvent) => {
    // Not on the floating controls that sit over the page.
    if ((event.target as HTMLElement).closest("button, a, input, textarea")) return;
    // A full-page photo and a chapter's facing art have no text; a continued
    // page is the runover of a recipe that is edited from its first page.
    if (navItem.kind === "image" || navItem.kind === "section-photo" || navItem.continued) return;
    // Recipes and covers are absent on purpose: their text is editable by
    // clicking it, so a double-click already lands a caret in the field under
    // the cursor. There is no mode left for this gesture to open.
    if (navItem.kind === "recipe" || navItem.kind === "cover") return;
    if (navItem.kind === "divider") {
      if (editingSectionId !== navItem.recipeId) startSectionEdit(navItem.recipeId);
      return;
    }
    if (navItem.kind === "toc") setEditingToc(true);
  };

  return (
        <section
          className="recipe-page-canvas"
          aria-label="Selected page"
          data-single-recipe={singleRecipePrintView ? "true" : "false"}
        >
          {/* Zoom, on the deck it zooms and nowhere else. Minus, the size, plus
              — and the percentage doubles as the way back to fit, since after
              a few steps "100%" is the number you are looking for anyway. */}
          <div className="recipe-deck-zoom no-print" role="group" aria-label="Zoom">
            <button
              type="button"
              className="recipe-deck-zoom__btn"
              aria-label="Zoom out"
              title="Zoom out"
              disabled={deckZoom <= 0.5}
              onClick={() => onZoomStep(-1)}
            >
              <MinusIcon size={ICON_SIZE.sm} />
            </button>
            <div className="recipe-deck-zoom__picker" ref={zoomMenuRef}>
              <button
                type="button"
                className="recipe-deck-zoom__value"
                aria-haspopup="menu"
                aria-expanded={zoomMenuOpen}
                aria-label={`Zoom, ${Math.round(deckZoom * 100)} percent`}
                onClick={() => setZoomMenuOpen((open) => !open)}
              >
                {Math.round(deckZoom * 100)}%
              </button>
              {zoomMenuOpen && (
                <div className="recipe-deck-zoom__menu" role="menu" aria-label="Zoom level">
                  {DECK_ZOOM_STEPS.map((step) => (
                    <button
                      key={step}
                      type="button"
                      role="menuitemradio"
                      aria-checked={Math.round(deckZoom * 100) === Math.round(step * 100)}
                      className={`recipe-deck-zoom__option ${
                        Math.round(deckZoom * 100) === Math.round(step * 100) ? "is-active" : ""
                      }`}
                      onClick={() => {
                        onZoomSet(step);
                        setZoomMenuOpen(false);
                      }}
                    >
                      {Math.round(step * 100)}%
                      {step === 1 && <span className="recipe-deck-zoom__option-note">Fit</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="recipe-deck-zoom__btn"
              aria-label="Zoom in"
              title="Zoom in"
              disabled={deckZoom >= 2}
              onClick={() => onZoomStep(1)}
            >
              <PlusIcon size={ICON_SIZE.sm} />
            </button>
          </div>

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
              <button
                type="button"
                className="btn btn-primary btn-compact recipe-mobile-topbar__print"
                onClick={handleMobilePrint}
                disabled={printBlocked}
              >
                {printSpinner ? (
                  <SpinnerIcon size={ICON_SIZE.md} />
                ) : (
                  <PrintIcon size={ICON_SIZE.md} />
                )}
                {cookbookLocked
                  ? "Purchase & Print"
                  : templateLocked
                    ? "Unlock & Print"
                    : "Print"}
              </button>
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
              <div className="recipe-page-empty">
                <div className="recipe-page-empty__sheet" aria-hidden />
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
                        onDoubleClick={openEditOnDoubleClick(pageNav)}
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
                          isImageSpread || isSectionSpread
                            ? spreadWidth * deckScale
                            : previewDims.w * deckScale,
                          isImageSpread || isSectionSpread || spread.single
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
                <div
                  key={`${sheet.id}-${navItem.slotIndex}`}
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
                  onDoubleClick={openEditOnDoubleClick(navItem)}
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
                    renderActiveControls(
                      activeNavItem,
                      PAGE_DIMS[previewCardSize].w * deckScale,
                    )}
                  {!(renderAllPages || Math.abs(index - activeNavIndex) <= DECK_WINDOW) ? (
                    <PagePlaceholder
                      width={PAGE_DIMS[previewCardSize].w}
                      height={PAGE_DIMS[previewCardSize].h}
                      scale={deckScale}
                    />
                  ) : (
                  <ScaledPage
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
                      isActive && navItem.kind === "divider" && editingSectionId === navItem.recipeId
                        ? {
                            sectionId: navItem.recipeId,
                            value: editingSectionTitle,
                            onChange: (value) => editSectionTitle(navItem.recipeId, value),
                            onCommit: commitSectionEdit,
                            onCancel: () => {
                              setEditingSectionId(null);
                              setEditingSectionTitle("");
                            },
                            subtitle: sections.find((section) => section.id === navItem.recipeId)?.subtitle,
                            onSubtitleChange: (value) =>
                              projectMeta.updateSection(navItem.recipeId, { subtitle: value || undefined }),
                            intro: sections.find((section) => section.id === navItem.recipeId)?.intro,
                            onIntroChange: (value) =>
                              projectMeta.setSectionIntro(navItem.recipeId, value || undefined),
                          }
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
                      isActive && navItem.kind === "toc" && editingToc
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
              );
            })}
          </div>
        </section>
  );
}
