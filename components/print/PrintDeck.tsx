"use client";

import { Fragment, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import type {
  CSSProperties,
  Dispatch,
  MouseEvent as ReactMouseEvent,
  ReactNode,
  SetStateAction,
} from "react";
import Link from "next/link";
import { AccountControl } from "@/components/AccountControl";
import { LogoMark } from "@/components/Logo";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ICON_SIZE,
  InfoIcon,
  LinkIcon,
  MoveToSectionIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/icons";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { MoveToSectionMenu } from "@/components/print/MoveToSectionMenu";
import { ZoomControl } from "@/components/print/ZoomControl";
import { ScaledPage } from "@/components/print/ScaledPage";
import { formatRecipeTime } from "@/lib/time";
import { recipeLinkOn } from "@/lib/recipeLink";
import { gutterSideForRole } from "@/lib/cookbookPresets";
import { chapterIntroFromRecipes, chapterRecipeTitles } from "@/lib/chapterIntro";
import { composeNote } from "@/lib/recipeNote";
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
import { isPhotoOpenClick, type PhotoPress } from "@/lib/photoOpenGesture";
import { LineSelectionToolbar } from "@/components/print/LineSelectionToolbar";
import { TextFieldToolbar } from "@/components/print/TextFieldToolbar";
import type { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import { FailedImportCard } from "@/components/print/FailedImportCard";
import { importLoadingLabel } from "@/lib/importProgress";
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
  /** Save state / button, pre-rendered by the page (`renderSaveControl`) so
      the mobile topbar reports the exact same thing the desktop header does
      — see that function's doc comment in app/print/page.tsx. */
  saveControl: ReactNode;
  /** The Pro upsell button, pre-rendered by the page
      (`renderProUpgradeButton`) — `null` once Pro is active, so this and
      the desktop header can never disagree about whether it's owed. */
  proUpgradeButton: ReactNode;
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
 * Puts the cursor in the page's link field, once it exists.
 *
 * The field is only drawn while the page's reveal is on, and pressing the link
 * button is what turns that on, so it is not in the DOM yet when this is called.
 * It looks again for a few frames instead of holding a flag in state for a
 * focus that happens once. Only the focused page has real inputs (every other
 * page draws its link as text), so the first match is the right one.
 */
function focusSourceLinkField() {
  let tries = 0;
  const attempt = () => {
    const field = document.querySelector<HTMLInputElement>(
      '.recipe-page-canvas input[aria-label="Source link"]',
    );
    if (field) {
      field.focus();
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
  const {
    saveControl,
    proUpgradeButton,
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
    setShowSourceUrl,
    showDescription,
    singleRecipeOnly,
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
     * Does this page have a field nobody can see yet?
     *
     * The reveal button shows the slots a page has not filled in. On a page where
     * everything IS filled in it reveals nothing, so offering it is offering a
     * button that does nothing — and the reveal is the button's whole job now
     * that the text is editable by clicking it.
     *
     * Asked of every page that has text. It used to skip chapter openers and
     * the contents page because those had a real edit mode behind this button,
     * which was a different question from whether anything was missing; now
     * that they edit by being clicked, it is the same question.
     */
    /**
     * The names of the fields this page has not filled in, in the order they
     * appear on it. The button says them out loud ("Add link, time, servings"),
     * because a generic "More fields" gave nobody a reason to press it, and it
     * is also the answer to whether there is anything to offer: no names, no
     * button. The same on every kind of page, so the toolbar never has to be
     * learnt page by page.
     */
    const missingFieldNames = (): string[] => {
      if (navItem.kind === "recipe") {
        const recipe = items?.find((item) => item.id === navItem.recipeId)?.recipe;
        if (!recipe) return [];
        const cookbook = Boolean(projectMeta.meta.cookbookMode);
        const missing: string[] = [];
        // A cookbook recipe can be given a link by hand whatever the book-wide
        // setting says (it gets its own override on commit), so a missing link is
        // always a hidden field there. Elsewhere the field only exists while the
        // setting is on, so a missing link is only a hidden FIELD when that field
        // would show.
        if ((cookbook || showSourceUrl) && !recipe.sourceUrl) missing.push("link");
        if (!formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime)) missing.push("time");
        if (!(recipe.servings ?? recipe.yield)) missing.push("servings");
        // Ask what the note WOULD print, not whether the website blurb
        // exists. The card shows `composeNote(description, note,
        // showDescription)`, so a recipe that arrived with a blurb and no
        // note of its own prints nothing once the website-description
        // checkbox is off — an empty line with no way to reach it, because
        // this test read the stored blurb and concluded the field was
        // filled. Reading the composed line also stops the opposite: a cook's
        // own note with no blurb behind it printed fine and still offered to
        // reveal a field that was never missing.
        if (cookbook && !composeNote(recipe.description, recipe.note, showDescription).trim()) {
          missing.push("note");
        }
        if (recipe.ingredients.length === 0) missing.push("ingredients");
        if (recipe.instructions.length === 0) missing.push("steps");
        return missing;
      }
      if (navItem.kind === "cover") {
        const side = coverSideFromNavItem(navItem);
        const cover = coverForSide(side);
        // A photo behind the opening page's words (see CoverFace) doesn't
        // make them optional — it's a background choice, not a replacement.
        if (side === "dedication") {
          return [!cover?.title && "heading", !cover?.blurb && "message", !cover?.author && "signature"].filter(
            (name): name is string => Boolean(name),
          );
        }
        if (side === "back") {
          return [!cover?.blurb && "closing line", !cover?.author && "credit"].filter(
            (name): name is string => Boolean(name),
          );
        }
        return [
          !cover?.title && "title",
          !cover?.subtitle && "subtitle",
          !cover?.author && "author",
          !cover?.edition && "edition",
        ].filter((name): name is string => Boolean(name));
      }
      if (navItem.kind === "divider") {
        const section = sections.find((candidate) => candidate.id === navItem.recipeId);
        // Title first, matching where it sits on the page. It's missing when
        // the cook has hidden it (`titleOverride`), not when it's merely
        // untouched — the section's real name is the default, always there
        // unless deliberately cleared. The description prints the chapter's
        // recipe names until the cook writes their own or removes it, so it
        // is only a hidden field once it has been removed (`""`); left alone
        // it is not missing, it is being drawn for them.
        return [
          section && !sectionDisplayTitle(section).trim() && "title",
          !section?.subtitle?.trim() && "subtitle",
          section?.intro === "" && "description",
        ].filter((name): name is string => Boolean(name));
      }
      // Nothing on the contents page can be missing: both of its lines print a
      // default ("Contents", "What's inside") when nobody types one, and the
      // entries are generated.
      return [];
    };
    const missingNames = missingFieldNames();
    const pageHasHiddenFields = (): boolean => missingNames.length > 0;
    // Four names is what fits a phone's pill on two lines; any more collapse
    // into a count. A blank recipe would otherwise list six.
    const fieldsLabel =
      missingNames.length === 0
        ? "Add fields"
        : `Add ${missingNames.slice(0, 4).join(", ")}${
            missingNames.length > 4 ? ` +${missingNames.length - 4}` : ""
          }`;

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
          ? renderCardPhotoControl(navItem.recipeId)
          : navItem.kind === "cover"
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
    // The recipe-link toggle, next to the photo control.
    //
    // Where the book can't hold more than this one recipe (`singleRecipeOnly`)
    // it flips the setting, which IS that recipe's link. In a cookbook the
    // setting is book-wide, so the button writes THIS recipe's own override
    // instead (the link's counterpart to the photo picker's per-recipe "None"),
    // and choosing what the book already does drops the override so the recipe
    // follows the book again. Multi-recipe recipe cards have no per-recipe
    // placement, so there the panel's "Every recipe" section stays the one place
    // to reach it.
    const linkCookbook = Boolean(projectMeta.meta.cookbookMode);
    const recipeForLink =
      (singleRecipeOnly || linkCookbook) && navItem.kind === "recipe"
        ? items?.find((item) => item.id === navItem.recipeId)?.recipe
        : null;
    const linkShown =
      navItem.kind === "recipe"
        ? recipeLinkOn(showSourceUrl, linkCookbook, projectMeta.meta.itemPlacements?.[navItem.recipeId])
        : showSourceUrl;
    // Always on a recipe page, like the photo control beside it. It used to
    // appear only once a recipe had a link, so on the very recipe that lacked
    // one there was no sign that a link icon existed: a control that comes and
    // goes with the data teaches nobody what it is for.
    const hasLink = Boolean(recipeForLink?.sourceUrl);
    const linkLabel = !hasLink
      ? "Add recipe link"
      : linkShown
        ? "Hide recipe link"
        : "Show recipe link";
    const linkControl = recipeForLink ? (
      <button
        type="button"
        className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--icon ${
          hasLink && linkShown ? "is-active" : ""
        }`}
        aria-pressed={hasLink ? linkShown : undefined}
        aria-label={linkLabel}
        title={linkLabel}
        onClick={(event) => {
          event.stopPropagation();
          if (!hasLink) {
            // Nothing to show or hide yet, so this is the way to add one: reveal
            // the empty link field and put the cursor in it. A recipe card has
            // no per-recipe switch, so there the field only exists while the
            // book's "Recipe link" setting is on, and adding one means wanting it.
            if (!linkCookbook && !showSourceUrl) setShowSourceUrl(true);
            if (!showEmptyFields) toggleShowEmptyFields();
            focusSourceLinkField();
            return;
          }
          if (linkCookbook && navItem.kind === "recipe") {
            projectMeta.setItemPlacement(navItem.recipeId, {
              showSourceUrl: !linkShown === showSourceUrl ? undefined : !linkShown,
            });
            return;
          }
          setShowSourceUrl((value) => !value);
        }}
      >
        <LinkIcon size={ICON_SIZE.md} />
      </button>
    ) : null;
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
      dividerSection && !dividerHasFacing ? (
        <div className="recipe-page-toolbar__group">
          <button
            type="button"
            className="recipe-page-toolbar__btn"
            onClick={(event) => {
              event.stopPropagation();
              const seedPhoto = sectionRecipeImages(dividerSection)[0];
              projectMeta.setArtPhoto(navItem.recipeId, "photo", {
                photoUrl: dividerSection.artPhotoUrl ?? seedPhoto,
              });
            }}
          >
            Add image page
          </button>
        </div>
      ) : null;

    // The art pages have no text and no reveal, but they DO have a photo — and
    // the toolbar is the only place their photo can be changed from now.
    if (!navItem.flip && !editable && !photoControl && !linkControl && !addImagePageButton) {
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
              <span>Edit a chapter or recipe to change what&apos;s listed here.</span>
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
          {showFieldsButton && (
            <div className="recipe-page-toolbar__group recipe-page-toolbar__group--fields">
              <button
                type="button"
                className={`recipe-page-toolbar__btn recipe-page-toolbar__btn--fields ${editing ? "is-active" : ""}`}
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
                {editing ? "Done" : fieldsLabel}
              </button>
            </div>
          )}
          {/* After Edit, with Move and Delete: this is an icon among icons, and
              it led the bar only because that is where the placement toggle it
              replaced used to sit. */}
          {photoControl && <div className="recipe-page-toolbar__group">{photoControl}</div>}
          {linkControl && <div className="recipe-page-toolbar__group">{linkControl}</div>}
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
              of them is not undoable.
              A divider's Delete removes the whole chapter (routes through
              `requestDeleteNavItem`'s "divider" branch, which confirms first).
              A facing page's Delete just clears that page's art/caption and
              brings back the card's "Add image page" button — no confirm,
              same as clearing any other optional photo. */}
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
          {addImagePageButton}
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
      doubleSided={continueOnBack}
      gutterSide={gutterSideForRole(role)}
      cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
      showEmptyFields={showEmptyFields}
      showDescription={showDescription}
      // The recipe's own link decision travels on its slot. What is left for
      // the deck to say is the reveal: the button shows the empty slot a link
      // would be typed into, which in a cookbook needs no setting on first.
      revealSourceUrl={
        showEmptyFields &&
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
    parsingImports.length > 0 ? (
      <>
        {parsingImports.map((pendingItem, index) => (
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
            data-pending-page={index === 0 ? "" : undefined}
          >
            <div
              className="recipe-page-pending__sheet"
              style={{
                width: previewDims.w * deckScale,
                aspectRatio: `${previewDims.w} / ${previewDims.h}`,
              }}
            >
              <RecipeLoadingState label={importLoadingLabel(pendingItem)} />
            </div>
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
            <div
              className="recipe-page-failed__sheet"
              style={{
                width: previewDims.w * deckScale,
                aspectRatio: `${previewDims.w} / ${previewDims.h}`,
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
   * and there is something to undo. `undefined` until then, which keeps the bar
   * off a field that is still following the recipes.
   */
  const activeIntroReset = (() => {
    if (activeNavItem?.kind !== "divider") return undefined;
    const section = sections.find((candidate) => candidate.id === activeNavItem.recipeId);
    if (!section || section.intro === undefined) return undefined;
    return {
      derived: chapterIntroFromRecipes(chapterRecipeTitles(section.items)),
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
          {/* Body/heading and bold/italic, floating over the line being typed
              rather than joining the page's bar. It anchors itself to whatever
              field has focus, so it is mounted once for the whole deck. */}
          <TextFieldToolbar inlineEdit={activeInlineEdit} zoom={deckZoom} introReset={activeIntroReset} />
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
          <div
            className={`recipe-page-deck ${cookbookView ? "recipe-page-deck--book" : ""}`}
            id="recipe-page-deck"
            ref={deckRef}
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
                 beside them, captioned "No pages yet" next to a spinner reading
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
                  const renderBlank = (trailing = false, reason?: string) => (
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
                      {reason ? (
                        <div className="recipe-spread__blank-note no-print">
                          <p className="recipe-spread__blank-note-title">Blank page</p>
                          <p className="recipe-spread__blank-note-reason">{reason}</p>
                        </div>
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
                    if (!pageNav) {
                      // A blank leaf the book prints on purpose: say why, on
                      // screen only, so it isn't mistaken for a missing page.
                      const isBlankLeaf = pageSheet.slots.some((slot) => slot?.kind === "blank");
                      return renderBlank(false, isBlankLeaf ? blankPageReason(sheets, sheetIndex) : undefined);
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
                        } ${
                          isActive &&
                          isSectionSpread &&
                          (focusedSheet === spread.left || focusedSheet === spread.right)
                            ? "recipe-spread--section-focused"
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
                    doubleSided={continueOnBack}
                    cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
                    showEmptyFields={showEmptyFields}
                    // While revealing empty fields, keep the link field visible
                    // even if deleting the link just took away the last one in
                    // the book — otherwise clearing it mid-edit hides the very
                    // field that would let the user type it back in. Outside a
                    // cookbook it is gated on the setting itself so the reveal
                    // never shows a link field the user has turned off.
                    showDescription={showDescription}
                    revealSourceUrl={
                      showEmptyFields &&
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
          {pendingAnchorIndex === null && (
            <>
              {failedPages}
              {pendingPages}
            </>
          )}
          </div>
        </section>
  );
}
