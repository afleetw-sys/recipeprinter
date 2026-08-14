"use client";

import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from "react";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GripIcon,
  ICON_SIZE,
  PlusIcon,
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
  addMenuOpen: boolean;
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
    addMenuOpen,
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
  } = railSelection;

  return (
        <nav
          ref={railScrollRef}
          className={`recipe-page-rail recipe-page-rail--${previewCardSize} no-print ${
            railDrag.draggingId ? "recipe-page-rail--dragging" : ""
          }`}
          aria-label="Pages"
        >
          {organizeMode && (
            <div className="recipe-organize-bar">
              <div className="recipe-organize-bar__heading">
                <span className="recipe-organize-bar__title">Organize recipes</span>
              </div>
              <div className="recipe-organize-bar__actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-compact recipe-organize-bar__collapse"
                  onClick={exitOrganizeMode}
                  aria-label="Collapse organizer"
                  title="Collapse organizer"
                >
                  <ChevronLeftIcon size={ICON_SIZE.md} />
                </button>
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
                  num: number;
                  index: number;
                  focusSheet: number | null;
                  nav: NavItem | null;
                  thumbSheets: number[];
                  label: string;
                  soleUnit: boolean;
                  sectionId: string | null;
                };
                const units: RailUnit[] = [];
                const addUnit = (unit: Omit<RailUnit, "num">) =>
                  units.push({ ...unit, num: units.length + 1 });
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
                const groups: Array<{ key: string; sectionId: string | null; units: RailUnit[] }> = [];
                units.forEach((unit) => {
                  const previous = groups[groups.length - 1];
                  if (previous && unit.sectionId && previous.sectionId === unit.sectionId) {
                    previous.units.push(unit);
                  } else {
                    groups.push({
                      key: unit.sectionId ? `${unit.sectionId}-${unit.num}` : `unit-${unit.num}`,
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
                        (railDrag.draggingKind === "recipe" && railDrag.draggingId === recipeNav?.recipeId)
                          ? "is-dragging"
                          : ""
                      } ${(recipeNav || dividerSection) ? "recipe-page-rail__item--draggable" : ""} ${
                        recipeNav && railShake?.recipeId === recipeNav.recipeId ? "is-shaking" : ""
                      } ${recipeNav && effectiveRailSelection.has(recipeNav.recipeId) ? "is-selected" : ""}`}
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
                      aria-label={`Add recipe to ${sectionTitleForId(group.sectionId)}`}
                    >
                      <PlusIcon size={ICON_SIZE.md} />
                      <span>Add recipe</span>
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
                    <span className="recipe-page-rail__num">{index + 1}</span>
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

          <div className="recipe-page-rail__footer">
            <div className="recipe-page-rail__add-row" ref={addMenuRef}>
              <button
                type="button"
                className={`btn btn-secondary recipe-page-rail__add-main ${
                  projectMeta.meta.cookbookMode ? "recipe-page-rail__add-main--paired" : ""
                }`}
                onClick={() => {
                  setAddMenuOpen(false);
                  openAddRecipeBelow();
                }}
              >
                <PlusIcon size={ICON_SIZE.md} />
                {projectMeta.meta.cookbookMode ? "Add recipe" : "Recipe"}
              </button>
              {/* In a cookbook the section action folds into a split-button
                  overflow, so the primary control reads plainly as "Add recipe". */}
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
        </nav>
  );
}
