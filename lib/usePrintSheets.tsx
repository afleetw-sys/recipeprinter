"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getRecipeFaces, recipeNeedsBackSide, type RecipeFace } from "@/lib/recipeCardLayout";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { RecipeFaceMeasurer } from "@/components/RecipeFaceMeasurer";
import type { CoverConfig, QueueItem, Recipe, Section } from "@/types/recipe";

// Every physical sheet holds exactly one recipe-card slot, for every card
// size: a letter card is the size of the page, and a 6x4 card gets its own
// precut sheet rather than sharing one with another card.
const SLOTS_PER_SHEET = 1;

// One card-sized slot on a physical sheet: a recipe's front (and, once it's
// paired up during the back pass below, its back/continuation). `null` means
// the slot is unused — the sheet ran out of recipes before filling every slot.
export interface RecipeSheetSlot {
  kind: "recipe";
  recipeId: string;
  recipe: Recipe;
  label: string;
  front: RecipeFace;
  back: RecipeFace | null;
  hasBack: boolean;
  isContinuation: boolean;
  queueIndex: number;
}

// Section dividers and covers are always alone on their own sheet.
export interface DividerSheetSlot {
  kind: "divider";
  id: string;
  title: string;
  recipeTitles: string[];
}

export interface CoverSheetSlot {
  kind: "cover";
  id: string;
  cover: CoverConfig;
  side: "front" | "back";
}

export type SheetSlot = RecipeSheetSlot | DividerSheetSlot | CoverSheetSlot;

// One physical sheet of paper that will actually come out of the printer.
// Every sheet has exactly one slot — the card is the page, for every size —
// kept as a single-element array rather than a bare field so the rest of
// this module (and its callers) can still iterate/index it uniformly.
// `backGroupNeeded` covers both cases where a back side must print: real
// back content in the slot, or (for duplex jobs) a fully blank back so a
// later sheet's front doesn't land on this sheet's back.
export interface PageSheet {
  id: string;
  slots: (SheetSlot | null)[];
  backGroupNeeded: boolean;
}

// The unit the on-screen navigator (rail + deck) browses by: one face at a
// time. Several `NavItem`s can point at the same sheet/slotIndex for a
// recipe's continuation pages — that's what lets a recipe's later faces still
// browse and flip independently on screen.
export interface NavItem {
  kind: "recipe" | "divider" | "cover";
  /** The underlying recipe/divider/cover id — named `recipeId` for recipes so
      existing lookups by id keep working unchanged. */
  recipeId: string;
  sheetIndex: number;
  slotIndex: number;
  label: string;
  pageLabel: string;
  flip: boolean;
}

interface UsePrintSheetsOptions {
  /** Preferred input: section-grouped items, in the order they should print.
      `items` is accepted for back-compat and is treated as a single
      untitled section — existing single/multi-recipe callers don't need to
      change to keep working exactly as before. */
  sections?: Section[];
  items?: QueueItem[] | null;
  cover?: CoverConfig;
  backCover?: CoverConfig;
  /** Whether a named section gets its own divider page. Off (or a project
      with no named sections) reproduces today's flat behavior exactly. */
  sectionDividers?: boolean;
  cardSize: PrintCardSize;
  doubleSided: boolean;
  photosOn: boolean;
  sourceUrlOn: boolean;
  template: RecipePrintTemplate;
}

/**
 * Packs an ordered set of sections into physical sheets/slots, and the flat
 * rail/deck navigation order derived from them. Also owns the measurement-
 * correction loop: `getRecipeFaces` is a text-length budget guess, not a
 * measurement of a recipe's actual rendered size, so `RecipeFaceMeasurer`
 * (rendered off-screen via the returned `measurers` element — drop it into
 * the tree once) corrects any face that actually overflows, and `sheets`
 * prefers that measured result over the raw guess once it's settled.
 *
 * Each section's recipes are packed independently (a section boundary always
 * starts a fresh sheet — recipes never share a physical sheet across a
 * section, which is also the right behavior for a book with chapters), then
 * concatenated with divider/cover sheets spliced in at the boundaries.
 */
export function usePrintSheets({
  sections: sectionsProp,
  items,
  cover,
  backCover,
  sectionDividers,
  cardSize,
  doubleSided,
  photosOn,
  sourceUrlOn,
  template,
}: UsePrintSheetsOptions) {
  const sections = useMemo<Section[]>(() => {
    if (sectionsProp) return sectionsProp;
    return [{ id: "__default", items: items ?? [] }];
  }, [sectionsProp, items]);

  const allItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  // `getRecipeFaces` below is a text-length budget guess, not a measurement of
  // the recipe's actual rendered size — occasionally it guesses a face fits
  // when it doesn't, and the fixed card height's `overflow: hidden` at print
  // time silently truncates the extra content. `RecipeFaceMeasurer` renders
  // each recipe's guessed faces off-screen at real size, corrects any that
  // actually overflow, and reports the fixed-up pages here; `sheets` below
  // prefers this measured result and only falls back to the raw guess for a
  // recipe whose measurement hasn't settled yet (e.g. the instant it's
  // added), so nothing ever waits on it to render.
  const [measuredFaces, setMeasuredFaces] = useState<
    Record<string, { recipe: Recipe; cardSize: PrintCardSize; template: RecipePrintTemplate; hasPhoto: boolean; sourceUrlOn: boolean; pages: RecipeFace[] }>
  >({});

  const measuredRecipeItems = useMemo(
    () =>
      allItems
        .filter((item): item is QueueItem & { recipe: Recipe } => Boolean(item.recipe))
        .map((item) => ({
          id: item.id,
          recipe: item.recipe,
          hasPhoto: photosOn && Boolean(item.recipe.image),
        })),
    [allItems, photosOn],
  );

  const measuredFacesFor = useCallback((id: string, recipe: Recipe, hasPhoto: boolean): RecipeFace[] | null => {
    const entry = measuredFaces[id];
    if (
      !entry ||
      entry.recipe !== recipe ||
      entry.cardSize !== cardSize ||
      entry.template !== template ||
      entry.hasPhoto !== hasPhoto ||
      entry.sourceUrlOn !== sourceUrlOn
    ) {
      return null;
    }
    return entry.pages;
  }, [cardSize, measuredFaces, sourceUrlOn, template]);

  // Whether any recipe actually spills past its front, which decides if a
  // recipe's overflow continues on the BACK of its own card or starts a whole
  // new card. Read from the measured faces, not `recipeNeedsBackSide`'s
  // character-budget guess: the two disagree on ~4% of layouts, and when the
  // guess said "fits on one page" while the measurement needed two, this stayed
  // false and the second face was pushed onto a separate card instead of the
  // back of the same one — front/back silently stopped working for exactly the
  // recipes near the boundary. Falls back to the guess only for a recipe whose
  // measurement hasn't landed yet, and the preview is held blank until it has.
  const hasRecipeBackSide = useMemo(
    () =>
      measuredRecipeItems.some(({ id, recipe, hasPhoto }) => {
        const measured = measuredFacesFor(id, recipe, hasPhoto);
        if (measured) return measured.length > 1;
        return recipeNeedsBackSide(recipe, cardSize, {
          hasPhoto,
          showSourceUrl: sourceUrlOn,
          template,
        });
      }),
    [measuredRecipeItems, measuredFacesFor, cardSize, sourceUrlOn, template],
  );
  const continueOnBack = hasRecipeBackSide && doubleSided;

  const printLayoutReady = useMemo(
    () =>
      measuredRecipeItems.length > 0 &&
      measuredRecipeItems.every(({ id, recipe, hasPhoto }) => measuredFacesFor(id, recipe, hasPhoto) !== null),
    [measuredRecipeItems, measuredFacesFor],
  );

  const sheets = useMemo<PageSheet[]>(() => {
    const slotCount = SLOTS_PER_SHEET;

    interface Column {
      recipeId: string;
      recipe: Recipe;
      label: string;
      faces: RecipeFace[];
      hasBack: boolean;
      idx: number;
      queueIndex: number;
    }

    // Exactly today's single-list packing algorithm, scoped to one section's
    // items — `queueIndexOffset` keeps the nav-grouping key monotonic across
    // sections so recipe ordering stays correct end-to-end.
    function buildSectionSheets(sectionItems: QueueItem[], queueIndexOffset: number, idPrefix: string): PageSheet[] {
      const queue: Column[] = [];
      for (const item of sectionItems) {
        if (!item.recipe) continue;
        const recipe = item.recipe;
        const hasPhoto = photosOn && Boolean(recipe.image);
        const faces =
          measuredFacesFor(item.id, recipe, hasPhoto) ??
          getRecipeFaces(recipe, cardSize, {
            hasPhoto,
            showSourceUrl: sourceUrlOn,
            template,
          }).pages;
        queue.push({
          recipeId: item.id,
          recipe,
          label: recipe.title || "Recipe",
          faces,
          hasBack: faces.length > 1,
          idx: 0,
          queueIndex: queueIndexOffset + queue.length,
        });
      }

      const columns: (Column | null)[] = new Array(slotCount).fill(null);

      function fillColumn(slotIndex: number): Column | null {
        let column = columns[slotIndex];
        if (!column || column.idx >= column.faces.length) {
          column = queue.shift() ?? null;
        }
        columns[slotIndex] = column;
        return column;
      }

      function takeFace(slotIndex: number) {
        const column = fillColumn(slotIndex);
        if (!column) return null;
        const faceIndex = column.idx;
        const face = column.faces[faceIndex];
        column.idx += 1;
        return { column, face, faceIndex };
      }

      const out: PageSheet[] = [];
      let sheetNum = 0;

      while (queue.length > 0 || columns.some((column) => column && column.idx < column.faces.length)) {
        const takes = Array.from({ length: slotCount }, (_, slotIndex) => takeFace(slotIndex));
        if (takes.every((take) => take === null)) break;
        sheetNum += 1;

        const slots: (SheetSlot | null)[] = takes.map((take) =>
          take
            ? {
                kind: "recipe",
                recipeId: take.column.recipeId,
                recipe: take.column.recipe,
                label: take.column.label,
                front: take.face,
                back: null,
                hasBack: take.column.hasBack,
                isContinuation: take.faceIndex > 0,
                queueIndex: take.column.queueIndex,
              }
            : null,
        );

        let anyBack = false;
        if (continueOnBack) {
          takes.forEach((take, slotIndex) => {
            if (!take) return;
            const column = take.column;
            if (column.idx < column.faces.length) {
              (slots[slotIndex] as RecipeSheetSlot).back = column.faces[column.idx];
              column.idx += 1;
              anyBack = true;
            }
          });
        }

        out.push({
          id: `sheet-${idPrefix}-${sheetNum}`,
          slots,
          backGroupNeeded: anyBack,
        });
      }

      return out;
    }

    const out: PageSheet[] = [];

    if (cover) {
      out.push({
        id: "sheet-cover-front",
        slots: [{ kind: "cover", id: "cover-front", cover, side: "front" }],
        backGroupNeeded: false,
      });
    }

    let queueIndexCursor = 0;
    sections.forEach((section) => {
      if (sectionDividers && section.title?.trim()) {
        out.push({
          id: `sheet-divider-${section.id}`,
          slots: [{
            kind: "divider",
            id: section.id,
            title: section.title,
            recipeTitles: section.items
              .map((item) => item.recipe?.title?.trim() || item.title?.trim())
              .filter((title): title is string => Boolean(title)),
          }],
          backGroupNeeded: false,
        });
      }
      out.push(...buildSectionSheets(section.items, queueIndexCursor, section.id));
      queueIndexCursor += section.items.filter((item) => item.recipe).length;
    });

    if (backCover) {
      out.push({
        id: "sheet-cover-back",
        slots: [{ kind: "cover", id: "cover-back", cover: backCover, side: "back" }],
        backGroupNeeded: false,
      });
    }

    // A duplex job needs every recipe sheet but the last to emit a back side —
    // even a fully blank one — so the physical page count stays in sync and a
    // later sheet's front doesn't land on the back of an earlier one. Cover
    // and divider sheets are always single-sided and sit outside this padding.
    if (continueOnBack) {
      const isRecipeSheet = (sheet: PageSheet) => sheet.slots.some((slot) => slot?.kind === "recipe");
      const lastRecipeSheetIndex = out.reduce(
        (lastIndex, sheet, index) => (isRecipeSheet(sheet) ? index : lastIndex),
        -1,
      );
      out.forEach((sheet, index) => {
        if (!isRecipeSheet(sheet)) return;
        sheet.backGroupNeeded = sheet.backGroupNeeded || index !== lastRecipeSheetIndex;
      });
    }

    return out;
  }, [sections, cover, backCover, sectionDividers, cardSize, continueOnBack, photosOn, sourceUrlOn, template, measuredFacesFor]);

  // What the rail and deck actually browse: one face per item, in physical
  // sheet order, except that a recipe's own faces (front + any continuations)
  // always stay grouped together at the position of that recipe's first
  // appearance — a `Map` naturally preserves that: each key's position is
  // fixed the first time it's seen, exactly what both recipe continuation-
  // grouping and a divider/cover's simple single-entry order need.
  const navItems = useMemo<NavItem[]>(() => {
    const groups = new Map<string, NavItem[]>();
    sheets.forEach((sheet, sheetIndex) => {
      sheet.slots.forEach((slot, slotIndex) => {
        if (!slot) return;
        if (slot.kind === "recipe") {
          const navItem: NavItem = {
            kind: "recipe",
            recipeId: slot.recipeId,
            sheetIndex,
            slotIndex,
            label: slot.label,
            pageLabel: !continueOnBack
              ? slot.isContinuation
                ? "Continued"
                : slot.hasBack
                  ? "Page 1"
                  : "One page"
              : slot.isContinuation
                ? "Continued"
                : slot.back
                  ? "Two-sided"
                  : "One-sided",
            flip: slot.back !== null,
          };
          const key = `recipe:${slot.queueIndex}`;
          const group = groups.get(key);
          if (group) group.push(navItem);
          else groups.set(key, [navItem]);
        } else if (slot.kind === "divider") {
          groups.set(`divider:${slot.id}`, [
            {
              kind: "divider",
              recipeId: slot.id,
              sheetIndex,
              slotIndex,
              label: slot.title,
              pageLabel: "Section",
              flip: false,
            },
          ]);
        } else {
          groups.set(`cover:${slot.id}`, [
            {
              kind: "cover",
              recipeId: slot.id,
              sheetIndex,
              slotIndex,
              label: slot.cover.title || (slot.side === "front" ? "Cover" : "Back cover"),
              pageLabel: slot.side === "front" ? "Cover" : "Back cover",
              flip: false,
            },
          ]);
        }
      });
    });
    return Array.from(groups.values()).flat();
  }, [sheets, continueOnBack]);

  // Off-screen measurement pass — drop this into the tree once; it never
  // renders anything visible itself.
  //
  // Only recipes still awaiting a result get a measurer. A settled one used to
  // stay mounted for the life of the session holding a full off-screen copy of
  // every one of its faces, purely as a monument to work already finished (on a
  // 60-recipe project: 18,240 DOM nodes that nothing would ever read again).
  //
  // `measuredFacesFor` is exactly the right predicate to mount on, because it
  // already *is* the definition of "needs measuring": it returns null both for
  // a recipe never measured and for one whose stored result no longer matches
  // the current recipe/size/template/photo/link, which is precisely when a
  // fresh pass is required. So a settled measurer unmounts, and any change that
  // invalidates its result mounts a new one — with clean state, which is what a
  // re-measure wants anyway.
  //
  // Note this can't loop: `onSettled` writes an entry built from the very same
  // values `measuredFacesFor` compares against, so the recipe it just settled
  // reads back as measured on the next render. RecipeFaceMeasurer's in-render
  // reset still earns its keep for the other case — an edit landing *while* a
  // measurer is mounted and mid-pass, where React reuses the instance because
  // recipe content isn't part of the key below.
  const measurers = (
    <>
      {measuredRecipeItems
        .filter(({ id, recipe, hasPhoto }) => measuredFacesFor(id, recipe, hasPhoto) === null)
        .map(({ id, recipe, hasPhoto }) => (
          <RecipeFaceMeasurer
            key={`${id}-${cardSize}-${template}-${hasPhoto}-${sourceUrlOn}`}
            recipe={recipe}
            size={cardSize}
            template={template}
            hasPhoto={hasPhoto}
            showSourceUrl={sourceUrlOn}
            onSettled={(pages) =>
              setMeasuredFaces((current) => ({
                ...current,
                [id]: { recipe, cardSize, template, hasPhoto, sourceUrlOn, pages },
              }))
            }
          />
        ))}
    </>
  );

  // ── Double-buffering ──────────────────────────────────────────────────────
  // The preview paints the last COMPLETE layout, never a half-finished one.
  //
  // `sheets` above falls back to `getRecipeFaces`' character-budget guess for
  // anything not yet measured, and that guess visibly disagrees with the
  // measured result — which is what used to make a card reflow in front of the
  // user. Blanking the preview while measuring hid the reflow but replaced it
  // with the whole preview vanishing on every settings change, which reads far
  // worse: toggling one checkbox emptied the screen for a beat.
  //
  // So keep the previous layout on screen and swap the whole thing in one go
  // once the new measurement lands, the way a drawing app keeps showing the
  // last frame while it renders the next. Nothing here touches how layout is
  // measured — it only decides which finished layout is on screen.
  //
  // The committed config travels WITH its sheets. Card size and template must
  // not update ahead of the faces they belong to, or the card would briefly
  // wear 6x4 chrome while still holding letter pagination — which is exactly
  // the clipping this all exists to prevent.
  const committedLayout = useMemo(
    () => ({ sheets, navItems, cardSize, template, photosOn, sourceUrlOn, doubleSided }),
    [sheets, navItems, cardSize, template, photosOn, sourceUrlOn, doubleSided],
  );
  type CommittedLayout = typeof committedLayout;
  // `null` until the very first measurement lands. On a cold load there is no
  // previous frame to hold, so the caller shows a placeholder — but only then.
  const [displayedLayout, setDisplayedLayout] = useState<CommittedLayout | null>(null);
  useEffect(() => {
    if (printLayoutReady || measuredRecipeItems.length === 0) {
      setDisplayedLayout(committedLayout);
    }
  }, [printLayoutReady, measuredRecipeItems.length, committedLayout]);

  return {
    hasRecipeBackSide,
    continueOnBack,
    measuredRecipeItems,
    printLayoutReady,
    /** Sheets for the layout currently ON SCREEN (may lag by one measurement). */
    sheets: displayedLayout?.sheets ?? [],
    navItems: displayedLayout?.navItems ?? [],
    /** The size/template/photo/link the displayed sheets were measured for. */
    previewConfig: displayedLayout,
    /** True only before the first layout has ever landed — nothing to show yet. */
    awaitingFirstLayout: displayedLayout === null && measuredRecipeItems.length > 0,
    measurers,
  };
}
