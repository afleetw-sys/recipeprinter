"use client";

import { useCallback, useMemo, useState } from "react";
import { getRecipeFaces, recipeNeedsBackSide, type RecipeFace } from "@/lib/recipeCardLayout";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { RecipeFaceMeasurer } from "@/components/RecipeFaceMeasurer";
import type { QueueItem, Recipe } from "@/types/recipe";

// How many recipe-card slots share one physical page. Letter cards are the
// size of the page, so there's only ever one; 6x4 cards are small enough to
// fit two per sheet (stacked), which is also the most that should share a
// page even if more would technically fit. For 6x4 this is user-configurable
// (see `cardsPerSheet` state); this is just the default/max.
const SLOTS_PER_SHEET: Record<PrintCardSize, number> = {
  letter: 1,
  "card-6x4": 2,
};

// One card-sized slot on a physical sheet: a recipe's front (and, once it's
// paired up during the back pass below, its back/continuation). `null` means
// the slot is unused — the sheet ran out of recipes before filling every slot.
export interface SheetSlot {
  recipeId: string;
  recipe: Recipe;
  label: string;
  front: RecipeFace;
  back: RecipeFace | null;
  hasBack: boolean;
  isContinuation: boolean;
  queueIndex: number;
}

// One physical sheet of paper that will actually come out of the printer.
// Letter sheets have a single slot (the card is the page); 6x4 sheets have up
// to two slots side by side on the same page. `backGroupNeeded` covers both
// cases where a back side must print: real back content in any slot, or (for
// duplex jobs) a fully blank back so a later sheet's front doesn't land on
// this sheet's back.
export interface PageSheet {
  id: string;
  slots: (SheetSlot | null)[];
  backGroupNeeded: boolean;
}

// The unit the on-screen navigator (rail + deck) browses by: one recipe face
// at a time, exactly like before 6x4 pages started sharing sheets with a
// second recipe. Several `NavItem`s can point at the same sheet/slotIndex —
// that's what lets two recipes that will print on one physical page still
// browse and flip independently on screen.
export interface NavItem {
  recipeId: string;
  sheetIndex: number;
  slotIndex: number;
  label: string;
  pageLabel: string;
  flip: boolean;
}

interface UsePrintSheetsOptions {
  items: QueueItem[] | null | undefined;
  cardSize: PrintCardSize;
  cardsPerSheet: 1 | 2;
  doubleSided: boolean;
  photosOn: boolean;
  sourceUrlOn: boolean;
  template: RecipePrintTemplate;
}

/**
 * Packs the print queue into physical sheets/slots, and the flat rail/deck
 * navigation order derived from them. Also owns the measurement-correction
 * loop: `getRecipeFaces` is a text-length budget guess, not a measurement of
 * a recipe's actual rendered size, so `RecipeFaceMeasurer` (rendered
 * off-screen via the returned `measurers` element — drop it into the tree
 * once) corrects any face that actually overflows, and `sheets` prefers that
 * measured result over the raw guess once it's settled.
 */
export function usePrintSheets({
  items,
  cardSize,
  cardsPerSheet,
  doubleSided,
  photosOn,
  sourceUrlOn,
  template,
}: UsePrintSheetsOptions) {
  // The photo reserves vertical space, so the split must know whether one will
  // render — otherwise content overflows the page instead of flowing to the back.
  const hasRecipeBackSide = useMemo(
    () =>
      items?.some(
        (item) =>
          item.recipe &&
          recipeNeedsBackSide(item.recipe, cardSize, {
            hasPhoto: photosOn && Boolean(item.recipe.image),
            showSourceUrl: sourceUrlOn,
            template,
          }),
      ) ?? false,
    [items, cardSize, photosOn, sourceUrlOn, template],
  );
  const continueOnBack = hasRecipeBackSide && doubleSided;

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
      (items ?? [])
        .filter((item): item is QueueItem & { recipe: Recipe } => Boolean(item.recipe))
        .map((item) => ({
          id: item.id,
          recipe: item.recipe,
          hasPhoto: photosOn && Boolean(item.recipe.image),
        })),
    [items, photosOn],
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

  const printLayoutReady = useMemo(
    () =>
      measuredRecipeItems.length > 0 &&
      measuredRecipeItems.every(({ id, recipe, hasPhoto }) => measuredFacesFor(id, recipe, hasPhoto) !== null),
    [measuredRecipeItems, measuredFacesFor],
  );

  // The physical sheets the printer will produce, in order. Each sheet fills
  // its `SLOTS_PER_SHEET[cardSize]` slots by walking an ordered queue of
  // recipes: a slot keeps consuming its current recipe's faces (front, then
  // continuations) until that recipe runs out, then picks up the next one —
  // so short recipes interleave two-to-a-page around a long one that needs
  // several sheets to itself. For two-sided jobs the same slots are filled a
  // second time for the back, so a slot's front and back always belong to the
  // same recipe and land on opposite faces of one sheet.
  const sheets = useMemo<PageSheet[]>(() => {
    const slotCount = cardSize === "card-6x4" ? cardsPerSheet : SLOTS_PER_SHEET[cardSize];

    interface Column {
      recipeId: string;
      recipe: Recipe;
      label: string;
      faces: RecipeFace[];
      hasBack: boolean;
      idx: number;
      queueIndex: number;
    }

    const queue: Column[] = [];
    for (const item of items ?? []) {
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
        queueIndex: queue.length,
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
            slots[slotIndex]!.back = column.faces[column.idx];
            column.idx += 1;
            anyBack = true;
          }
        });
      }

      out.push({
        id: `sheet-${sheetNum}`,
        slots,
        backGroupNeeded: anyBack,
      });
    }

    // A duplex job needs every sheet but the last to emit a back side — even
    // a fully blank one — so the physical page count stays in sync and a
    // later sheet's front doesn't land on the back of an earlier one.
    if (continueOnBack) {
      out.forEach((sheet, index) => {
        sheet.backGroupNeeded = sheet.backGroupNeeded || index !== out.length - 1;
      });
    }

    return out;
  }, [items, cardSize, cardsPerSheet, continueOnBack, photosOn, sourceUrlOn, template, measuredFacesFor]);

  // What the rail and deck actually browse: one recipe face per item, in the
  // same order recipes were queued, regardless of which physical sheet (and
  // slot on it) they end up sharing for print. A recipe that needs more faces
  // than fit in one front/back pair (long recipes on 6x4, mostly) spends an
  // extra sheet sharing its slot's continuation with whatever the *other*
  // slot on that sheet is doing — scanning sheets in physical order would
  // then interleave that recipe's later faces with its sheet-mate's, so each
  // recipe's items are grouped together (by `queueIndex`) after the scan,
  // keeping this array itself in physical order otherwise unchanged.
  const navItems = useMemo<NavItem[]>(() => {
    const groups = new Map<number, NavItem[]>();
    sheets.forEach((sheet, sheetIndex) => {
      sheet.slots.forEach((slot, slotIndex) => {
        if (!slot) return;
        const navItem: NavItem = {
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
        const group = groups.get(slot.queueIndex);
        if (group) group.push(navItem);
        else groups.set(slot.queueIndex, [navItem]);
      });
    });
    return Array.from(groups.keys())
      .sort((a, b) => a - b)
      .flatMap((queueIndex) => groups.get(queueIndex)!);
  }, [sheets, continueOnBack]);

  // Off-screen measurement pass for every recipe currently in the queue —
  // drop this into the tree once; it never renders anything visible itself.
  const measurers = (
    <>
      {measuredRecipeItems.map(({ id, recipe, hasPhoto }) => (
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

  return {
    hasRecipeBackSide,
    continueOnBack,
    measuredRecipeItems,
    printLayoutReady,
    sheets,
    navItems,
    measurers,
  };
}
