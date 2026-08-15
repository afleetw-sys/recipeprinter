"use client";

import type {
  ComponentProps,
  CSSProperties,
  Dispatch,
  ReactNode,
  SetStateAction,
} from "react";
import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/Logo";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  ICON_SIZE,
  PrintIcon,
  SettingsIcon,
  SpinnerIcon,
} from "@/components/icons";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { ScaledPage } from "@/components/print/ScaledPage";
import { PHOTO_STYLE_OPTIONS } from "@/components/print/photoStyle";
import { PAGE_DIMS } from "@/lib/printGeometry";
import { gutterSideForRole } from "@/lib/cookbookPresets";
import {
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

interface PrintDeckProps {
  // Layout / preview geometry
  singleRecipePrintView: boolean;
  cookbookView: boolean;
  previewMeasuring: boolean;
  previewDims: { w: number; h: number };
  spreadWidth: number;
  deckExportClass: string;
  deckExportStyle: CSSProperties | undefined;
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
  deckRef: ReturnType<typeof useDeckScroller>["deckRef"];
  slideRefs: ReturnType<typeof useDeckScroller>["slideRefs"];
  goToSlide: ReturnType<typeof useDeckScroller>["goToSlide"];
  // Inline editing
  projectMeta: ReturnType<typeof useProjectMeta>;
  pageEditMode: ReturnType<typeof useRecipeInlineEditor>["pageEditMode"];
  togglePageEditMode: ReturnType<typeof useRecipeInlineEditor>["togglePageEditMode"];
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
  editingCoverSide: CoverSide | null;
  setEditingCoverSide: Dispatch<SetStateAction<CoverSide | null>>;
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
  buildSectionPhotoEdit: (section: Section | undefined) => Partial<DividerEdit>;
  photoModeFor: (recipeId: string) => PhotoStyle;
  setRecipePhotoMode: (recipeId: string, mode: PhotoStyle) => void;
  // Mobile topbar
  sizeMenuOpen: boolean;
  setSizeMenuOpen: Dispatch<SetStateAction<boolean>>;
  settingsMenuOpen: boolean;
  setSettingsMenuOpen: Dispatch<SetStateAction<boolean>>;
  renderModeSwitch: () => ReactNode;
  hasPrintSettingsFields: boolean;
  renderPrintSettingsFields: () => ReactNode;
  handleMobilePrint: () => void;
  printBlocked: boolean;
  printSpinner: boolean;
  cookbookLocked: boolean;
  templateLocked: boolean;
}

// The center deck: the mobile topbar plus the scrolling page preview. Two render
// paths — the cookbook two-page spread view (focus-linked image/section spreads)
// and the flat single-page card view — with inline edit controls, per-page photo
// controls, and the front/back side switcher. Verbatim move out of the print
// god-file; `renderActiveControls` and `renderDeckPage` moved in as internals.
export function PrintDeck(props: PrintDeckProps) {
  const {
    singleRecipePrintView,
    cookbookView,
    previewMeasuring,
    previewDims,
    spreadWidth,
    deckExportClass,
    deckExportStyle,
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
    deckRef,
    slideRefs,
    goToSlide,
    projectMeta,
    pageEditMode,
    togglePageEditMode,
    activeInlineEdit,
    editingSectionId,
    setEditingSectionId,
    editingSectionTitle,
    setEditingSectionTitle,
    editSectionTitle,
    commitSectionEdit,
    startSectionEdit,
    editingCoverSide,
    setEditingCoverSide,
    editingToc,
    setEditingToc,
    coverSideFromNavItem,
    coverForSide,
    defaultCover,
    setCoverForSide,
    coverPhotoCandidates,
    renderPagePhotoControl,
    renderSectionPhotoControl,
    buildSectionPhotoEdit,
    photoModeFor,
    setRecipePhotoMode,
    sizeMenuOpen,
    setSizeMenuOpen,
    settingsMenuOpen,
    setSettingsMenuOpen,
    renderModeSwitch,
    hasPrintSettingsFields,
    renderPrintSettingsFields,
    handleMobilePrint,
    printBlocked,
    printSpinner,
    cookbookLocked,
    templateLocked,
  } = props;

  const renderActiveControls = (
    navItem: NavItem,
    previewW: number,
    horizontalOffset = 0,
  ) => (
    <div
      className="recipe-page-canvas__controls no-print"
      style={{
        "--preview-w": `${previewW}px`,
        "--preview-offset": `${horizontalOffset}px`,
      } as CSSProperties}
    >
      <div className="recipe-page-canvas__controls-center">
        {navItem.flip && (
          <div className="recipe-card-side-nav" aria-label="Sheet sides">
            <button
              type="button"
              className="recipe-card-side-nav__button"
              aria-label="Show front"
              disabled={canvasSide === "front"}
              onClick={(event) => {
                event.stopPropagation();
                setCanvasSide("front");
              }}
            >
              <ChevronLeftIcon size={ICON_SIZE.md} />
            </button>
            <span>{canvasSide === "front" ? "Front" : "Back"}</span>
            <button
              type="button"
              className="recipe-card-side-nav__button"
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
      </div>
      {navItem.kind !== "image" && navItem.kind !== "section-photo" && (
        <div className="recipe-page-canvas__controls-right">
          {/* The placement toggle appears next to Edit once you're editing the
              recipe — one click to move the photo between None, In card, and
              Full page — matching the "Edit first, then adjust" flow. */}
          {projectMeta.meta.cookbookMode &&
            navItem.kind === "recipe" &&
            pageEditMode &&
            renderPagePhotoControl(navItem.recipeId)}
          {projectMeta.meta.cookbookMode &&
            navItem.kind === "divider" &&
            editingSectionId === navItem.recipeId &&
            renderSectionPhotoControl(navItem.recipeId)}
          <button
            type="button"
            className={`recipe-page-edit-toggle ${
              (navItem.kind === "recipe" && pageEditMode) ||
              (navItem.kind === "divider" && editingSectionId === navItem.recipeId) ||
              (navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)) ||
              (navItem.kind === "toc" && editingToc)
                ? "is-active"
                : ""
            }`}
            aria-pressed={
              (navItem.kind === "recipe" && pageEditMode) ||
              (navItem.kind === "divider" && editingSectionId === navItem.recipeId) ||
              (navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)) ||
              (navItem.kind === "toc" && editingToc)
            }
            onClick={(event) => {
              event.stopPropagation();
              if (navItem.kind === "recipe") {
                togglePageEditMode();
              } else if (navItem.kind === "divider") {
                if (editingSectionId === navItem.recipeId) commitSectionEdit();
                else startSectionEdit(navItem.recipeId);
              } else if (navItem.kind === "toc") {
                setEditingToc((current) => !current);
              } else {
                const side = coverSideFromNavItem(navItem);
                setEditingCoverSide((current) => (current === side ? null : side));
              }
            }}
          >
            <EditIcon size={ICON_SIZE.xs} />
            {(navItem.kind === "recipe" && pageEditMode) ||
            (navItem.kind === "divider" && editingSectionId === navItem.recipeId) ||
            (navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)) ||
            (navItem.kind === "toc" && editingToc)
              ? "Done"
              : "Edit"}
          </button>
        </div>
      )}
    </div>
  );
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
      showSourceUrl={
        sourceUrlOn ||
        (showSourceUrl && pageEditMode && focused && activeRecipeItem?.id === navItem.recipeId)
      }
      showCutLines={showCutLines && cardSize === "card-6x4"}
      inlineEdit={
        pageEditMode && focused && activeRecipeItem?.id === navItem.recipeId && activeInlineEdit
          ? {
              ...activeInlineEdit,
              // The recipe's own photo only (plus upload), not other recipes'.
              recipeImages: activeRecipeItem?.recipe?.image ? [activeRecipeItem.recipe.image] : [],
              // Placement lives in the in-card Photo dialog too, so every mode's
              // "Photo" button opens the same None/In-card/Full-page + source UI.
              photoPlacement: photoModeFor(navItem.recipeId),
              photoPlacementOptions: PHOTO_STYLE_OPTIONS.map((option) => ({
                id: option.id,
                label: option.short,
                hint: option.hint,
              })),
              onPhotoPlacementChange: (mode) =>
                setRecipePhotoMode(navItem.recipeId, mode as PhotoStyle),
            }
          : undefined
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
              ...buildSectionPhotoEdit(sections.find((section) => section.id === navItem.recipeId)),
            }
          : undefined
      }
      coverEdit={
        focused && navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)
          ? {
              side: coverSideFromNavItem(navItem),
              cover: coverForSide(coverSideFromNavItem(navItem)) ?? defaultCover(),
              onChange: (cover) => setCoverForSide(coverSideFromNavItem(navItem), cover),
              recipeImages: coverPhotoCandidates,
            }
          : undefined
      }
      imageEdit={
        // Photo controls (drag-to-reposition + the "Photo" button) appear once
        // you're editing the recipe — the same "Edit first, then adjust" flow as
        // the placement toggle — and live right here on the image, not orphaned
        // inside the facing recipe card.
        focused && navItem.kind === "image" && pageEditMode
          ? {
              focusX: projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroFocusX ?? 50,
              focusY: projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroFocusY ?? 50,
              onChange: (focusX, focusY) =>
                projectMeta.setItemPlacement(navItem.recipeId, { heroFocusX: focusX, heroFocusY: focusY }),
              current:
                projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroImageUrl ??
                items?.find((item) => item.id === navItem.recipeId)?.recipe?.image,
              // Only this recipe's own photo (plus upload) — never a grid of
              // OTHER recipes' images, which isn't what "change this photo" means.
              images: (() => {
                const own = items?.find((item) => item.id === navItem.recipeId)?.recipe?.image;
                return own ? [own] : [];
              })(),
              // Pick a new full-page photo, or clear it to drop back to no photo.
              onImageChange: (url) =>
                url
                  ? projectMeta.setItemPhotoMode(navItem.recipeId, "full", url)
                  : setRecipePhotoMode(navItem.recipeId, "none"),
              // Placement lives in the same dialog: None / In-card / Full-page.
              placement: photoModeFor(navItem.recipeId),
              placementOptions: PHOTO_STYLE_OPTIONS.map((option) => ({
                id: option.id,
                label: option.short,
                hint: option.hint,
              })),
              onPlacementChange: (mode) =>
                setRecipePhotoMode(navItem.recipeId, mode as PhotoStyle),
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

  return (
        <section
          className="recipe-page-canvas"
          aria-label="Selected page"
          data-single-recipe={singleRecipePrintView ? "true" : "false"}
        >
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
              {renderModeSwitch()}
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
            className={`recipe-page-deck ${cookbookView ? "recipe-page-deck--book" : ""} ${deckExportClass}`}
            style={deckExportStyle}
            id="recipe-page-deck"
            ref={deckRef}
          >
            {previewMeasuring ? (
              <RecipeLoadingState className="recipe-page-deck__loading" />
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
                  const linkedSpread = isImageSpread || isSectionSpread;
                  const linkedFocusSheet = isImageSpread
                    ? imageSpreadFocusSheet
                    : isSectionSpread
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
                  const renderSide = (
                    sheetIndex: number | null,
                    role: "left" | "right" | "single",
                  ) => {
                    if (sheetIndex === null) return renderBlank();
                    const pageSheet = sheets[sheetIndex];
                    if (!pageSheet) return renderBlank();
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
                        onClick={(event) => {
                          event.stopPropagation();
                          // Focus the pair's editable page (the recipe for an image
                          // spread, the opener for a section spread) no matter which
                          // half was clicked, so its Edit controls are available.
                          focusSheetInSpread(
                            index,
                            linkedSpread ? linkedFocusSheet ?? sheetIndex : sheetIndex,
                          );
                        }}
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
                  onClick={() => {
                    if (isActive) return;
                    goToSlide(index);
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
                  {isActive && (
                    <div
                      className="recipe-page-canvas__controls no-print"
                      style={
                        {
                          "--preview-w": `${PAGE_DIMS[previewCardSize].w * deckScale}px`,
                        } as CSSProperties
                      }
                    >
                      <div className="recipe-page-canvas__controls-center">
                        {navItem.flip && (
                          <div className="recipe-card-side-nav" aria-label="Sheet sides">
                            <button
                              type="button"
                              className="recipe-card-side-nav__button"
                              aria-label="Show front"
                              disabled={canvasSide === "front"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setCanvasSide("front");
                              }}
                            >
                              ←
                            </button>
                            <span>{canvasSide === "front" ? "Front" : "Back"}</span>
                            <button
                              type="button"
                              className="recipe-card-side-nav__button"
                              aria-label="Show back"
                              disabled={canvasSide === "back"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setCanvasSide("back");
                              }}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </div>
                      {activeNavItem && activeNavItem.kind !== "image" && (
                        <div className="recipe-page-canvas__controls-right">
                          {projectMeta.meta.cookbookMode &&
                            activeNavItem.kind === "recipe" &&
                            pageEditMode &&
                            renderPagePhotoControl(activeNavItem.recipeId)}
                          {projectMeta.meta.cookbookMode &&
                            activeNavItem.kind === "divider" &&
                            editingSectionId === activeNavItem.recipeId &&
                            renderSectionPhotoControl(activeNavItem.recipeId)}
                          <button
                            type="button"
                            className={`recipe-page-edit-toggle ${
                              (activeNavItem.kind === "recipe" && pageEditMode) ||
                              (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                              (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem)) ||
                              (activeNavItem.kind === "toc" && editingToc)
                                ? "is-active"
                                : ""
                            }`}
                            aria-pressed={
                              (activeNavItem.kind === "recipe" && pageEditMode) ||
                              (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                              (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem)) ||
                              (activeNavItem.kind === "toc" && editingToc)
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (activeNavItem.kind === "recipe") {
                                togglePageEditMode();
                              } else if (activeNavItem.kind === "divider") {
                                if (editingSectionId === activeNavItem.recipeId) commitSectionEdit();
                                else startSectionEdit(activeNavItem.recipeId);
                              } else if (activeNavItem.kind === "toc") {
                                setEditingToc((current) => !current);
                              } else {
                                const side = coverSideFromNavItem(activeNavItem);
                                setEditingCoverSide((current) => (current === side ? null : side));
                              }
                            }}
                          >
                            <EditIcon size={ICON_SIZE.xs} />
                            {(activeNavItem.kind === "recipe" && pageEditMode) ||
                            (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                            (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem)) ||
                            (activeNavItem.kind === "toc" && editingToc)
                              ? "Done"
                              : "Edit"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
                    // While actively editing with the checkbox on, keep the link
                    // field visible even if deleting it just made this the only
                    // recipe without one (which flips the cross-recipe
                    // `sourceUrlOn` gate off) — otherwise clearing it mid-edit
                    // hides the very field that would let the user type it back
                    // in. Gated on the checkbox itself so Edit never shows a
                    // link field the user has turned off.
                    showSourceUrl={
                      sourceUrlOn ||
                      (showSourceUrl && pageEditMode && isActive && activeRecipeItem?.id === navItem.recipeId)
                    }
                    showCutLines={showCutLines && cardSize === "card-6x4"}
                    inlineEdit={
                      pageEditMode && isActive && activeRecipeItem?.id === navItem.recipeId && activeInlineEdit
                        ? {
              ...activeInlineEdit,
              // The recipe's own photo only (plus upload), not other recipes'.
              recipeImages: activeRecipeItem?.recipe?.image ? [activeRecipeItem.recipe.image] : [],
            }
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
                            ...buildSectionPhotoEdit(
                              sections.find((section) => section.id === navItem.recipeId),
                            ),
                          }
                        : undefined
                    }
                    coverEdit={
                      isActive && navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)
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
                </div>
              );
            })}
          </div>
        </section>
  );
}
