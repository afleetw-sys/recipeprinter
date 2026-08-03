"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  assembleSpreads,
  getRecipeFaces,
  planCookbookSection,
  recipeNeedsBackSide,
  type BookPageKind,
  type CookbookPlanItem,
  type RecipeFace,
} from "@/lib/recipeCardLayout";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { RecipeFaceMeasurer } from "@/components/RecipeFaceMeasurer";
import type {
  CoverConfig,
  QueueItem,
  Recipe,
  RecipePageLayout,
  RecipePagePlacement,
  Section,
} from "@/types/recipe";

// Every physical sheet holds exactly one recipe-card slot, for every card
// size: a letter card is the size of the page, and a 6x4 card gets its own
// precut sheet rather than sharing one with another card.
const SLOTS_PER_SHEET = 1;

// Measured faces are cached per (recipe, size) pair, not per recipe: a recipe
// can be measured at `letter` (cookbook) and `card-6x4` for different jobs, and
// the two must not clobber each other — see the `measuredFaces` note.
function faceKey(id: string, size: PrintCardSize): string {
  return `${id}::${size}`;
}

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
  /** The fully-resolved "show this card's header photo" decision (book-wide
      default + per-page override + whether a photo exists + image-spread
      suppression). The renderer uses this directly, so measurement and render
      can't disagree on the card's height. */
  showPhoto: boolean;
  /** Suppress the card's own header photo — set for an `image-spread` recipe,
      whose photo already fills the facing page, so it isn't shown twice. */
  hidePhoto?: boolean;
}

// Section dividers and covers are always alone on their own sheet.
export interface DividerSheetSlot {
  kind: "divider";
  id: string;
  title: string;
  recipeTitles: string[];
  /** 1-based chapter ordinal among the sections that get an opener. */
  chapterNumber: number;
  showChapterNumber?: boolean;
  /** Chapter-opener photo/intro (cookbook mode); undefined = none. */
  subtitle?: string;
  photoUrl?: string;
  intro?: string;
}

export interface CoverSheetSlot {
  kind: "cover";
  id: string;
  cover: CoverConfig;
  /** `dedication` is a cover-like front-matter page after the front cover. */
  side: "front" | "back" | "dedication";
}

// One line in the table of contents: a chapter heading or a recipe under it,
// each with the printed page it lands on.
export interface TocEntry {
  kind: "chapter" | "recipe";
  title: string;
  pageNumber?: number;
  chapterNumber?: number;
}

export interface TocSheetSlot {
  kind: "toc";
  id: string;
  entries: TocEntry[];
}

// The full-bleed facing photo of an `image-spread` recipe (cookbook mode).
// Alone on its own letter page, immediately before the recipe's card page.
export interface ImageSheetSlot {
  kind: "image";
  /** The recipe this photo belongs to — id shared with the recipe slot so the
      two group adjacently in the navigator. */
  recipeId: string;
  label: string;
  imageUrl: string;
  /** Object-position focal point (0–100%) for the full-bleed crop; undefined =
      centered. Carried on the slot so print/preview and the measurer all render
      the same crop the cook set. */
  focusX?: number;
  focusY?: number;
  queueIndex: number;
}

export type SheetSlot =
  | RecipeSheetSlot
  | DividerSheetSlot
  | CoverSheetSlot
  | TocSheetSlot
  | ImageSheetSlot;

// One two-page spread in the cookbook "book view": `left`/`right` are indices
// into `sheets` (null = a blank filler page); `single` marks a standalone
// cover/back-cover shown as one centered page. See `assembleSpreads`.
export interface DeckSpread {
  left: number | null;
  right: number | null;
  single: boolean;
}

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
  /** Printed page number (cookbook mode); undefined on cover/TOC pages, which
      carry no folio. */
  pageNumber?: number;
  /** Running header text for this page (book title / chapter name). */
  runningHeader?: string;
  /** Per-recipe page layout (cookbook mode). `undefined`/`full` renders one
      card per sheet; `image` is a full-bleed facing photo page (image-spread),
      which is single-sided (never gets a duplex back). */
  layoutKind?: "image";
}

// The unit the on-screen navigator (rail + deck) browses by: one face at a
// time. Several `NavItem`s can point at the same sheet/slotIndex for a
// recipe's continuation pages — that's what lets a recipe's later faces still
// browse and flip independently on screen.
export interface NavItem {
  kind: "recipe" | "divider" | "cover" | "toc" | "image";
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
  /** Optional dedication / front-matter page, placed after the front cover and
      before the table of contents. A cover-like page whose `blurb` is the text. */
  dedication?: CoverConfig;
  /** Whether a named section gets its own divider page. Off (or a project
      with no named sections) reproduces today's flat behavior exactly. */
  sectionDividers?: boolean;
  /** Cookbook mode: emit a table-of-contents page after the cover, and page
      numbers + running headers on the body pages. */
  tableOfContents?: boolean;
  /** Book title for the running header / TOC (falls back to the cover title). */
  bookTitle?: string;
  /** Cookbook mode: enables per-recipe page layouts (`full`/`image-spread`).
      Off (plain card printing) ignores `itemPlacements` entirely and every
      recipe prints one-card-per-sheet exactly as before. */
  cookbookMode?: boolean;
  /** Per-recipe page layout, keyed by `QueueItem.id` (cookbook mode only). */
  itemPlacements?: Record<string, RecipePagePlacement>;
  /** Book-wide "Full page" photo default (cookbook): every recipe with an image
      defaults to a full-page image spread unless its own placement overrides. */
  defaultFullPage?: boolean;
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
  dedication,
  sectionDividers,
  tableOfContents,
  bookTitle,
  cookbookMode,
  itemPlacements,
  defaultFullPage,
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

  // Per-recipe page layouts (`full`/`image-spread`) only apply in cookbook mode,
  // and only when the book prints on letter. Outside cookbook mode this is always
  // false, so the resolvers below reduce to "every recipe is `full` at the global
  // `cardSize`" — i.e. byte-for-byte the plain recipe-card behavior.
  const cookbookLayouts = Boolean(cookbookMode) && cardSize === "letter";

  // The effective "show this recipe's header photo" decision, per recipe. A
  // per-page override (cookbook mode only) wins over the book-wide `photosOn`
  // default; either way there has to actually be a photo. Single source of truth
  // for BOTH measurement (a header photo changes card height) and what the slot
  // renders, so the two can never disagree and clip.
  const photoOnFor = useCallback(
    (id: string, recipe: Recipe): boolean => {
      if (!recipe.image) return false;
      const override = cookbookLayouts ? itemPlacements?.[id]?.showPhoto : undefined;
      return override ?? photosOn;
    },
    [cookbookLayouts, itemPlacements, photosOn],
  );

  // ── Measured faces (real rendered heights) ───────────────────────────────
  // `getRecipeFaces` is a text-length budget guess, not a measurement of the
  // recipe's actual rendered size — occasionally it guesses a face fits when it
  // doesn't, and the fixed card height's `overflow: hidden` at print time
  // silently truncates the extra content. `RecipeFaceMeasurer` renders each
  // recipe's guessed faces off-screen at real size, corrects any that actually
  // overflow, and reports the fixed-up pages here; the packing below prefers
  // this measured result and only falls back to the raw guess for a recipe whose
  // measurement hasn't settled yet (e.g. the instant it's added), so nothing
  // ever waits on it to render.
  //
  // Keyed by `id::size`, not `id` alone, so a recipe measured for a `letter`
  // cookbook and a `card-6x4` job can hold both without clobbering each other.
  const [measuredFaces, setMeasuredFaces] = useState<
    Record<string, { recipe: Recipe; cardSize: PrintCardSize; template: RecipePrintTemplate; hasPhoto: boolean; sourceUrlOn: boolean; pages: RecipeFace[] }>
  >({});

  const measuredFacesFor = useCallback(
    (id: string, recipe: Recipe, hasPhoto: boolean, size: PrintCardSize): RecipeFace[] | null => {
      const entry = measuredFaces[faceKey(id, size)];
      if (
        !entry ||
        entry.recipe !== recipe ||
        entry.template !== template ||
        entry.hasPhoto !== hasPhoto ||
        entry.sourceUrlOn !== sourceUrlOn
      ) {
        return null;
      }
      return entry.pages;
    },
    [measuredFaces, sourceUrlOn, template],
  );

  // Resolves each recipe's per-page layout: an explicit placement, else the
  // book-wide default — a full-page image spread when "Full page" is on and the
  // recipe actually has a photo, otherwise a plain full card. A cookbook always
  // gives each recipe its own full page. Outside cookbook mode everything is
  // `full`.
  const cookbookResolution = useMemo(() => {
    const layoutOf = new Map<string, RecipePageLayout>();
    if (!cookbookLayouts) return { layoutOf };

    for (const item of allItems) {
      if (!item.recipe) continue;
      const fallback: RecipePageLayout =
        defaultFullPage && item.recipe.image ? "image-spread" : "full";
      layoutOf.set(item.id, itemPlacements?.[item.id]?.pageLayout || fallback);
    }
    return { layoutOf };
  }, [cookbookLayouts, allItems, itemPlacements, defaultFullPage]);

  const measuredRecipeItems = useMemo(
    () =>
      allItems
        .filter((item): item is QueueItem & { recipe: Recipe } => Boolean(item.recipe))
        .map((item) => ({
          id: item.id,
          recipe: item.recipe,
          hasPhoto: photoOnFor(item.id, item.recipe),
          size: cardSize,
        })),
    [allItems, photoOnFor, cardSize],
  );

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
      measuredRecipeItems.some(({ id, recipe, hasPhoto, size }) => {
        const measured = measuredFacesFor(id, recipe, hasPhoto, size);
        if (measured) return measured.length > 1;
        return recipeNeedsBackSide(recipe, size, {
          hasPhoto,
          showSourceUrl: sourceUrlOn,
          template,
        });
      }),
    [measuredRecipeItems, measuredFacesFor, sourceUrlOn, template],
  );
  // A bound cookbook never uses the front/back "flip" model: a recipe's overflow
  // continues on the NEXT page (a new leaf), not the back of the same sheet.
  // Keeping duplex here would make one PageSheet print as two physical pages,
  // which silently breaks the book's recto/verso spread parity AND the TOC page
  // numbers / folios (both count one-per-sheet). So duplex applies only to the
  // plain card path.
  const continueOnBack = hasRecipeBackSide && doubleSided && !cookbookLayouts;

  const printLayoutReady = useMemo(
    () =>
      measuredRecipeItems.length > 0 &&
      measuredRecipeItems.every(
        ({ id, recipe, hasPhoto, size }) => measuredFacesFor(id, recipe, hasPhoto, size) !== null,
      ),
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
        const hasPhoto = photoOnFor(item.id, recipe);
        const faces =
          measuredFacesFor(item.id, recipe, hasPhoto, cardSize) ??
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
                showPhoto: photoOnFor(take.column.recipeId, take.column.recipe),
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

    // The measured (or, until measurement lands, guessed) faces for one recipe,
    // at the job's `cardSize`. The only place cookbook packing looks up faces.
    function facesForItem(item: QueueItem & { recipe: Recipe }): RecipeFace[] {
      const hasPhoto = photoOnFor(item.id, item.recipe);
      return (
        measuredFacesFor(item.id, item.recipe, hasPhoto, cardSize) ??
        getRecipeFaces(item.recipe, cardSize, {
          hasPhoto,
          showSourceUrl: sourceUrlOn,
          template,
        }).pages
      );
    }

    // All cookbook recipes, each with its faces and a stable global queueIndex.
    const cookbookRecipeInfo = new Map<
      string,
      { item: QueueItem & { recipe: Recipe }; faces: RecipeFace[]; queueIndex: number }
    >();
    if (cookbookLayouts) {
      allItems
        .filter((item): item is QueueItem & { recipe: Recipe } => Boolean(item.recipe))
        .forEach((item, index) =>
          cookbookRecipeInfo.set(item.id, { item, faces: facesForItem(item), queueIndex: index }),
        );
    }

    // Cookbook packing: the sheet SHAPE (which recipe/face lands where, photo
    // pages, duplex backs) is decided by the pure, unit-tested
    // `planCookbookSection`; this resolves each planned face index back to a
    // real `RecipeFace` and attaches recipe/label/queueIndex. Only used in
    // cookbook mode — the default one-card path is untouched.
    function buildCookbookSectionSheets(sectionItems: QueueItem[], idPrefix: string): PageSheet[] {
      const { layoutOf } = cookbookResolution;
      const planItems: CookbookPlanItem[] = [];
      for (const item of sectionItems) {
        if (!item.recipe) continue;
        const info = cookbookRecipeInfo.get(item.id);
        if (!info) continue;
        const layout = layoutOf.get(item.id) ?? "full";
        planItems.push({
          id: item.id,
          layout,
          faceCount: info.faces.length,
          heroImageUrl: itemPlacements?.[item.id]?.heroImageUrl || item.recipe.image,
        });
      }

      const plan = planCookbookSection(planItems, { continueOnBack });

      return plan.map((planSheet, sheetIndex) => {
        const slots: (SheetSlot | null)[] = planSheet.slots.map((planSlot) => {
          if (!planSlot) return null;
          const entry = cookbookRecipeInfo.get(planSlot.itemId);
          if (!entry) return null;
          if (planSlot.kind === "image") {
            const placement = itemPlacements?.[planSlot.itemId];
            return {
              kind: "image",
              recipeId: planSlot.itemId,
              label: entry.item.recipe.title || "Recipe",
              imageUrl: planSlot.heroImageUrl,
              focusX: placement?.heroFocusX,
              focusY: placement?.heroFocusY,
              queueIndex: entry.queueIndex,
            };
          }
          const isImageSpread = layoutOf.get(planSlot.itemId) === "image-spread";
          return {
            kind: "recipe",
            recipeId: planSlot.itemId,
            recipe: entry.item.recipe,
            label: entry.item.recipe.title || "Recipe",
            front: entry.faces[planSlot.frontFace],
            back: planSlot.backFace !== null ? entry.faces[planSlot.backFace] : null,
            hasBack: planSlot.faceCount > 1,
            isContinuation: planSlot.frontFace > 0,
            queueIndex: entry.queueIndex,
            // Per-page photo decision, minus the image-spread case whose photo
            // lives on the facing page (below), so the card never doubles it.
            showPhoto: photoOnFor(planSlot.itemId, entry.item.recipe) && !isImageSpread,
            // An image-spread recipe's photo fills the facing page, so its card
            // drops its own header photo (no duplicate).
            hidePhoto: isImageSpread,
          };
        });
        return {
          id: `sheet-${idPrefix}-cb-${sheetIndex + 1}`,
          slots,
          backGroupNeeded: planSheet.backGroupNeeded,
          layoutKind: planSheet.layoutKind,
        };
      });
    }

    const out: PageSheet[] = [];

    if (cover) {
      out.push({
        id: "sheet-cover-front",
        slots: [{ kind: "cover", id: "cover-front", cover, side: "front" }],
        backGroupNeeded: false,
      });
    }

    // Front matter: a dedication page on its own sheet, right after the cover
    // and before the TOC (spliced in below at an index that accounts for it).
    if (dedication) {
      out.push({
        id: "sheet-cover-dedication",
        slots: [{ kind: "cover", id: "cover-dedication", cover: dedication, side: "dedication" }],
        backGroupNeeded: false,
      });
    }

    let queueIndexCursor = 0;
    let chapterNumber = 0;
    sections.forEach((section) => {
      const showOpener = section.showOpener ?? Boolean(sectionDividers);
      if (showOpener && section.title?.trim()) {
        chapterNumber += 1;
        out.push({
          id: `sheet-divider-${section.id}`,
          slots: [{
            kind: "divider",
            id: section.id,
            title: section.title,
            chapterNumber,
            showChapterNumber: Boolean(section.numberAsChapter),
            subtitle: section.subtitle,
            photoUrl: section.photoUrl,
            intro: section.intro,
            recipeTitles: section.items
              .map((item) => item.recipe?.title?.trim() || item.title?.trim())
              .filter((title): title is string => Boolean(title)),
          }],
          backGroupNeeded: false,
        });
      }
      out.push(
        ...(cookbookLayouts
          ? buildCookbookSectionSheets(section.items, section.id)
          : buildSectionSheets(section.items, queueIndexCursor, section.id)),
      );
      queueIndexCursor += section.items.filter((item) => item.recipe).length;
    });

    if (backCover) {
      out.push({
        id: "sheet-cover-back",
        slots: [{ kind: "cover", id: "cover-back", cover: backCover, side: "back" }],
        backGroupNeeded: false,
      });
    }

    // ── Page numbering + table of contents (cookbook mode) ──────────────────
    // A numbering pass over the finished sheet order (not the recipe packing):
    // body pages (chapter openers + recipe pages) get a running page number and
    // a running header; covers and the TOC itself carry no folio. The TOC is
    // then built from that numbering and spliced in right after the front cover.
    if (tableOfContents) {
      const title = bookTitle?.trim() || cover?.title?.trim() || "";
      const tocEntries: TocEntry[] = [];
      let pageNo = 0;
      let currentChapter = "";
      for (const sheet of out) {
        const dividerSlot = sheet.slots.find((slot) => slot?.kind === "divider") as
          | DividerSheetSlot
          | undefined;
        const recipeSlots = sheet.slots.filter(
          (slot): slot is RecipeSheetSlot => slot?.kind === "recipe",
        );
        if (dividerSlot) {
          pageNo += 1;
          sheet.pageNumber = pageNo;
          currentChapter = dividerSlot.title;
          tocEntries.push({
            kind: "chapter",
            title: dividerSlot.title,
            pageNumber: pageNo,
            chapterNumber: dividerSlot.chapterNumber,
          });
          continue;
        }
        if (recipeSlots.length > 0) {
          pageNo += 1;
          sheet.pageNumber = pageNo;
          sheet.runningHeader = currentChapter || title;
          for (const slot of recipeSlots) {
            if (!slot.isContinuation) {
              tocEntries.push({ kind: "recipe", title: slot.label, pageNumber: pageNo });
            }
          }
        }
      }

      if (tocEntries.length > 0) {
        const tocSheet: PageSheet = {
          id: "sheet-toc",
          slots: [{ kind: "toc", id: "toc", entries: tocEntries }],
          backGroupNeeded: false,
        };
        // Insert after the front-matter pages already emitted (cover, then
        // dedication) so the order is cover → dedication → contents → chapters.
        out.splice((cover ? 1 : 0) + (dedication ? 1 : 0), 0, tocSheet);
      }
    }

    // A duplex job needs every recipe sheet but the last to emit a back side —
    // even a fully blank one — so the physical page count stays in sync and a
    // later sheet's front doesn't land on the back of an earlier one. Cover
    // and divider sheets are always single-sided and sit outside this padding;
    // so are `image` (image-spread photo) sheets, which are full-bleed and
    // never carry a duplex back.
    if (continueOnBack) {
      const isRecipeSheet = (sheet: PageSheet) =>
        !sheet.layoutKind && sheet.slots.some((slot) => slot?.kind === "recipe");
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
  }, [sections, allItems, cover, backCover, dedication, sectionDividers, tableOfContents, bookTitle, cardSize, continueOnBack, photoOnFor, sourceUrlOn, template, measuredFacesFor, cookbookLayouts, cookbookResolution, itemPlacements]);

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
        } else if (slot.kind === "toc") {
          groups.set(`toc:${slot.id}`, [
            {
              kind: "toc",
              recipeId: slot.id,
              sheetIndex,
              slotIndex,
              label: "Contents",
              pageLabel: "Contents",
              flip: false,
            },
          ]);
        } else if (slot.kind === "image") {
          // An image-spread's facing photo shares its recipe's nav group (same
          // queueIndex) so the two sit adjacent; the image sheet is emitted
          // first, so it lands just before the recipe's card face.
          const navItem: NavItem = {
            kind: "image",
            recipeId: slot.recipeId,
            sheetIndex,
            slotIndex,
            label: slot.label,
            pageLabel: "Photo",
            flip: false,
          };
          const key = `recipe:${slot.queueIndex}`;
          const group = groups.get(key);
          if (group) group.push(navItem);
          else groups.set(key, [navItem]);
        } else {
          const coverLabel =
            slot.side === "front" ? "Cover" : slot.side === "dedication" ? "Dedication" : "Back cover";
          groups.set(`cover:${slot.id}`, [
            {
              kind: "cover",
              recipeId: slot.id,
              sheetIndex,
              slotIndex,
              label: slot.side === "dedication" ? coverLabel : slot.cover.title || coverLabel,
              pageLabel: coverLabel,
              flip: false,
            },
          ]);
        }
      });
    });
    return Array.from(groups.values()).flat();
  }, [sheets, continueOnBack]);

  // Cookbook "book view": group the physical pages (`sheets`) into two-page
  // spreads for the deck, with real book parity (see `assembleSpreads`). Left /
  // right are indices into `sheets`; `null` is a blank filler. Empty outside
  // cookbook mode, where the deck stays one page per slide.
  const spreads = useMemo<DeckSpread[]>(() => {
    if (!cookbookLayouts) return [];
    const kinds: BookPageKind[] = sheets.map((sheet) => {
      if (sheet.layoutKind === "image") return "image-photo";
      const slot = sheet.slots.find((s): s is SheetSlot => s !== null);
      if (slot?.kind === "cover") {
        if (slot.side === "back") return "back";
        if (slot.side === "dedication") return "dedication";
        return "cover";
      }
      if (slot?.kind === "divider") return "chapter";
      return "content";
    });
    return assembleSpreads(kinds);
  }, [cookbookLayouts, sheets]);

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
        .filter(({ id, recipe, hasPhoto, size }) => measuredFacesFor(id, recipe, hasPhoto, size) === null)
        .map(({ id, recipe, hasPhoto, size }) => (
          <RecipeFaceMeasurer
            key={`${id}-${size}-${template}-${hasPhoto}-${sourceUrlOn}-${cookbookLayouts ? "cb" : ""}`}
            recipe={recipe}
            size={size}
            template={template}
            hasPhoto={hasPhoto}
            showSourceUrl={sourceUrlOn}
            cookbookMode={cookbookLayouts}
            onSettled={(pages) =>
              setMeasuredFaces((current) => ({
                ...current,
                [faceKey(id, size)]: { recipe, cardSize: size, template, hasPhoto, sourceUrlOn, pages },
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
    () => ({ sheets, navItems, spreads, cardSize, template, photosOn, sourceUrlOn, doubleSided }),
    [sheets, navItems, spreads, cardSize, template, photosOn, sourceUrlOn, doubleSided],
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
    /** Two-page spreads over the displayed sheets (cookbook book view); empty
        outside cookbook mode. */
    spreads: displayedLayout?.spreads ?? [],
    /** The size/template/photo/link the displayed sheets were measured for. */
    previewConfig: displayedLayout,
    /** True only before the first layout has ever landed — nothing to show yet. */
    awaitingFirstLayout: displayedLayout === null && measuredRecipeItems.length > 0,
    /** The layout each recipe resolves to (full / image-spread). Keyed by item id. */
    resolvedLayouts: cookbookResolution.layoutOf,
    measurers,
  };
}
