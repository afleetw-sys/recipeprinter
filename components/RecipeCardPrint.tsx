"use client";

import { Fragment, memo, useEffect, useState } from "react";
import { formatRecipeTime } from "@/lib/time";
import { ICON_SIZE, XIcon } from "@/components/icons";
import type { Recipe } from "@/types/recipe";

// Printable recipe layouts. Compact cards keep readable text and move overflow
// to a second side instead of squeezing the whole recipe smaller and smaller.

export type PrintCardSize = "letter" | "card-6x4";

export const PRINT_CARD_SIZE_OPTIONS: Array<{
  id: PrintCardSize;
  label: string;
  detail: string;
}> = [
  { id: "letter", label: "Full page", detail: "Letter paper" },
  { id: "card-6x4", label: "6 x 4 card", detail: "Landscape recipe card" },
];

export type RecipePrintTemplate =
  | "classic"
  | "heirloom"
  | "bistro"
  | "pantry"
  | "counter"
  | "keepsake";
export type CardSectionLayout = "standard" | "stacked";

export const RECIPE_PRINT_TEMPLATE_OPTIONS: Array<{
  id: RecipePrintTemplate;
  label: string;
  detail: string;
}> = [
  { id: "classic", label: "Classic", detail: "Bright blue, clean cookbook card" },
  { id: "pantry", label: "Pantry", detail: "Fine ruled lines with small ingredient sketches" },
  { id: "counter", label: "Counter", detail: "Black-and-white notes with tiny counter details" },
  { id: "heirloom", label: "Heirloom", detail: "Cream stock, red utensil keepsake" },
  { id: "keepsake", label: "Keepsake", detail: "Cream recipe-box card with classic family style" },
  { id: "bistro", label: "Bistro", detail: "Blue checks, tomato red, playful kitchen card" },
];

// How much ingredient/instruction text fits on the front before it must
// continue on the back, in `textCost` units. Photo and no-photo fronts have
// separate capacities because the rendered image consumes real vertical space.
const FRONT_SECTION_BUDGET: Record<
  PrintCardSize,
  {
    withoutPhoto: { ingredients: number; instructions: number };
    withPhoto: { ingredients: number; instructions: number };
  }
> = {
  letter: {
    withoutPhoto: { ingredients: 1400, instructions: 2400 },
    withPhoto: { ingredients: 1100, instructions: 1900 },
  },
  "card-6x4": {
    withoutPhoto: { ingredients: 760, instructions: 980 },
    withPhoto: { ingredients: 560, instructions: 720 },
  },
};

// `ingredients` is the share an ingredient section gets when it splits the
// front with steps; `ingredientsOnly` is how far ingredients may run when they
// won't finish on the front (steps wait for the next face), so the lower half
// of the page fills with ingredients instead of sitting blank.
const STACKED_FRONT_BUDGET: Record<
  PrintCardSize,
  {
    withoutPhoto: { total: number; ingredients: number; ingredientsOnly: number; instructions: number };
    withPhoto: { total: number; ingredients: number; ingredientsOnly: number; instructions: number };
  }
> = {
  letter: {
    withoutPhoto: { total: 3200, ingredients: 1700, ingredientsOnly: 3600, instructions: 3100 },
    withPhoto: { total: 2200, ingredients: 1350, ingredientsOnly: 2600, instructions: 2150 },
  },
  "card-6x4": {
    withoutPhoto: { total: 720, ingredients: 760, ingredientsOnly: 1320, instructions: 700 },
    withPhoto: { total: 560, ingredients: 620, ingredientsOnly: 1060, instructions: 520 },
  },
};

const STACKED_FRONT_LIMITS: Record<
  PrintCardSize,
  {
    withoutPhoto: { ingredients: number; instructions: number };
    withPhoto: { ingredients: number; instructions: number };
  }
> = {
  letter: {
    withoutPhoto: { ingredients: 34, instructions: 22 },
    withPhoto: { ingredients: 26, instructions: 15 },
  },
  "card-6x4": {
    withoutPhoto: { ingredients: 24, instructions: 14 },
    withPhoto: { ingredients: 20, instructions: 12 },
  },
};

const TEMPLATE_STACKED_FRONT_LIMIT_OVERRIDES: Partial<
  Record<
    RecipePrintTemplate,
    Partial<
      Record<
        PrintCardSize,
        Partial<{
          withoutPhoto: Partial<{ ingredients: number; instructions: number }>;
          withPhoto: Partial<{ ingredients: number; instructions: number }>;
        }>
      >
    >
  >
> = {
  counter: {
    "card-6x4": {
      // Counter spends extra vertical space on the checker band and large
      // photo header, so long two-column step lists need to continue sooner.
      withPhoto: { instructions: 4 },
    },
  },
};

interface SplitOptions {
  hasPhoto?: boolean;
  template?: RecipePrintTemplate;
  showSourceUrl?: boolean;
  // Skips the side-by-side front entirely and starts from the stacked
  // layout. Used by the measurement-based overflow correction: when reality
  // disagrees with the budget heuristic and even the "everything fits on the
  // front" guess overflows, the recipe needs the same stacked front a normal
  // multi-face recipe gets, not a side-by-side layout with items missing.
  forceStacked?: boolean;
}

// The source link adds a second, wrapped line to the front face's footer.
// Charged against the front budget (in the same `textCost` units as the
// ingredient/instruction budgets above) so a recipe that was packed right up
// to the fixed card height spills onto the back instead of having its footer
// silently clipped off by print's `overflow: hidden`.
// card-6x4's budgets are already much smaller than letter's (hundreds vs.
// thousands of textCost units), so the reserve has to shrink to match or it
// eats a wildly disproportionate share of the front: 240 against a ~560-980
// budget was 33-43%, vs. the footer's actual ~7% of the physical card height
// (0.28in of 4in, see --recipe-card-footer-reserve), which tipped otherwise
// comfortably-fitting recipes into a needless back side.
const SOURCE_URL_FOOTER_RESERVE: Record<PrintCardSize, number> = {
  letter: 260,
  "card-6x4": 90,
};

const CONTINUATION_FLOW_BUDGET: Record<
  PrintCardSize,
  Record<
    CardSectionLayout,
    {
      total: number;
      ingredients: number;
      ingredientsOnly: number;
      instructions: number;
      instructionsOnly: number;
    }
  >
> = {
  letter: {
    standard: {
      total: 3600,
      ingredients: 1900,
      ingredientsOnly: 3400,
      instructions: 3200,
      instructionsOnly: 5600,
    },
    stacked: {
      total: 4200,
      ingredients: 2600,
      ingredientsOnly: 4400,
      instructions: 3400,
      instructionsOnly: 6000,
    },
  },
  "card-6x4": {
    standard: {
      total: 1250,
      ingredients: 760,
      ingredientsOnly: 1280,
      instructions: 980,
      instructionsOnly: 2400,
    },
    stacked: {
      total: 1150,
      ingredients: 760,
      ingredientsOnly: 1240,
      instructions: 860,
      instructionsOnly: 2350,
    },
  },
};

// Hard item caps guard against many-but-tiny steps overflowing the fixed card
// height (the length-aware budget above handles the usual case). Keep these
// loose so short recipes stay on one side instead of spilling onto the back.
const FRONT_SECTION_LIMITS: Partial<
  Record<
    PrintCardSize,
    {
      withoutPhoto: { ingredients: number; instructions: number };
      withPhoto: { ingredients: number; instructions: number };
    }
  >
> = {
  "card-6x4": {
    withoutPhoto: { ingredients: 12, instructions: 9 },
    withPhoto: { ingredients: 10, instructions: 6 },
  },
};

interface SplitRecipeResult {
  frontIngredients: Recipe["ingredients"];
  frontInstructions: Recipe["instructions"];
  backIngredients: Recipe["ingredients"];
  backInstructions: Recipe["instructions"];
  frontLayout: CardSectionLayout;
  backLayout: CardSectionLayout;
}

function sourceLabel(recipe: Recipe): string | null {
  if (!recipe.sourceUrl || !/^https?:\/\//i.test(recipe.sourceUrl)) return null;
  try {
    const url = new URL(recipe.sourceUrl);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return recipe.sourceUrl.split("#")[0].replace(/\/$/, "");
  }
}

function metaBits(recipe: Recipe): string[] {
  const bits: string[] = [];
  const time = formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime);
  if (time) bits.push(time);
  const serves = recipe.servings ?? recipe.yield;
  if (serves) bits.push(`Serves ${serves}`);
  return bits;
}

function ingredientText(ing: Recipe["ingredients"][number]): string {
  if (ing.raw) return ing.raw;
  const amount = [ing.amount, ing.unit].filter(Boolean).join(" ");
  return [amount, ing.name].filter(Boolean).join(" ") + (ing.note ? `, ${ing.note}` : "");
}

function sectionGroups<T extends { section?: string }>(items: T[]) {
  const groups: Array<{ title?: string; items: T[] }> = [];
  for (const item of items) {
    const title = item.section?.trim() || undefined;
    const previous = groups[groups.length - 1];
    if (previous && previous.title === title) {
      previous.items.push(item);
    } else {
      groups.push({ title, items: [item] });
    }
  }
  return groups;
}

function textCost(value: string): number {
  return value.length + Math.max(0, value.split(/\s+/).length - 1) * 2;
}

function totalTextCost<T>(items: T[], label: (item: T) => string): number {
  return items.reduce((total, item) => total + textCost(label(item)), 0);
}

function ingredientLayoutCost(
  ingredients: Recipe["ingredients"],
  layout: CardSectionLayout,
): number {
  const columnDivisor = layout === "stacked" ? 2 : 1;
  return (
    totalTextCost(ingredients, ingredientText) / columnDivisor +
    sectionGroups(ingredients).length * 36
  );
}

// A rendered section header (the `<h3>` between groups) costs vertical space the
// raw text length doesn't capture, so charge it when an item opens a new section
// on a face. Without this, a face that lands on several section boundaries (e.g.
// "Prep" then "Cook" steps) silently overflows. The charge is in the same units
// as the size's instruction budget, so it scales with the card: a letter step is
// far bigger than a 6x4 step, so its header reserve is bigger too.
const SECTION_HEADER_COST: Record<PrintCardSize, number> = {
  letter: 320,
  "card-6x4": 130,
};

function linearCost(costs: number[]): number {
  return costs.reduce((sum, cost) => sum + cost, 0);
}

function flowedColumnCost(costs: number[], budget: number): number {
  if (costs.length === 0) return 0;

  const columnCount = 2;
  const columns = [0];

  for (const cost of costs) {
    const lastIndex = columns.length - 1;
    const last = columns[lastIndex];

    if (last > 0 && last + cost > budget) {
      if (columns.length >= columnCount) return budget + cost;
      columns.push(cost);
    } else {
      columns[lastIndex] += cost;
    }
  }

  return Math.max(...columns);
}

// Shared engine behind `splitByBudget` (single running total) and
// `splitByFlowedColumnBudget` (two-column newspaper flow) — both walk the
// same list once, charging each item's text cost plus a section-header
// surcharge when it opens a new section, and differ only in how "does this
// still fit" is measured against the budget.
function splitByCostBudget<T>(
  items: T[],
  budget: number,
  label: (item: T) => string,
  costOf: (costs: number[]) => number,
  maxFrontItems = Number.POSITIVE_INFINITY,
  sectionOf?: (item: T) => string | undefined,
  sectionCost = 0,
  // By default the first item is always placed so callers that loop (e.g.
  // continuation faces) keep making progress even when one item exceeds the
  // budget. Front faces pass `strict` so a section that doesn't fit isn't forced
  // on — it can simply start on the next face — which avoids a lone overflowing
  // item that gets clipped.
  strict = false,
) {
  if (!Number.isFinite(budget)) return { front: items, back: [] };

  const front: T[] = [];
  const back: T[] = [];
  const costs: number[] = [];
  let overflowStarted = false;
  let frontSection: string | undefined;

  for (const item of items) {
    const section = sectionOf?.(item)?.trim() || undefined;
    const opensSection = sectionOf !== undefined && section !== undefined && section !== frontSection;
    const cost = textCost(label(item)) + (opensSection ? sectionCost : 0);
    const tooMany = front.length >= maxFrontItems;
    const tooBig = costOf([...costs, cost]) > budget && (strict || front.length > 0);
    if (overflowStarted || tooMany || tooBig) {
      overflowStarted = true;
      back.push(item);
    } else {
      front.push(item);
      costs.push(cost);
      frontSection = section;
    }
  }

  return { front, back };
}

function splitByBudget<T>(
  items: T[],
  budget: number,
  label: (item: T) => string,
  maxFrontItems = Number.POSITIVE_INFINITY,
  sectionOf?: (item: T) => string | undefined,
  sectionCost = 0,
  strict = false,
) {
  return splitByCostBudget(items, budget, label, linearCost, maxFrontItems, sectionOf, sectionCost, strict);
}

function splitByFlowedColumnBudget<T>(
  items: T[],
  budget: number,
  label: (item: T) => string,
  maxFrontItems = Number.POSITIVE_INFINITY,
  sectionOf?: (item: T) => string | undefined,
  sectionCost = 0,
  strict = false,
) {
  return splitByCostBudget(
    items,
    budget,
    label,
    (costs) => flowedColumnCost(costs, budget),
    maxFrontItems,
    sectionOf,
    sectionCost,
    strict,
  );
}

function splitInstructionsByAvailableSpace(
  instructions: Recipe["instructions"],
  budget: number,
  size: PrintCardSize,
  maxFrontItems = Number.POSITIVE_INFINITY,
  strict = false,
  twoColumn = false,
) {
  if (budget < 160) {
    return { front: [] as Recipe["instructions"], back: instructions };
  }

  const split = twoColumn ? splitByFlowedColumnBudget : splitByBudget;

  return split(
    instructions,
    budget,
    (step) => step.text,
    maxFrontItems,
    (step) => step.section,
    SECTION_HEADER_COST[size],
    strict,
  );
}

// The source-link footer reserve (see `SOURCE_URL_FOOTER_RESERVE`) is charged
// against every field of a front budget the same way, so both front-splitting
// functions borrow this instead of repeating the per-field subtraction.
function applyReserve<T extends Record<string, number>>(budget: T, reserve: number): T {
  const result = {} as T;
  for (const key of Object.keys(budget) as Array<keyof T>) {
    result[key] = Math.max(0, budget[key] - reserve) as T[keyof T];
  }
  return result;
}

function mergeNumberRecord<T extends Record<string, number>>(
  base: T,
  override: Partial<T> | undefined,
): T {
  return { ...base, ...override };
}

function stackedFrontLimitsFor(
  size: PrintCardSize,
  hasPhoto: boolean,
  template?: RecipePrintTemplate,
) {
  const photoKey = hasPhoto ? "withPhoto" : "withoutPhoto";
  return mergeNumberRecord(
    STACKED_FRONT_LIMITS[size][photoKey],
    TEMPLATE_STACKED_FRONT_LIMIT_OVERRIDES[template ?? "classic"]?.[size]?.[photoKey],
  );
}

function splitStandardFront(
  recipe: Recipe,
  size: PrintCardSize,
  hasPhoto: boolean,
  hasSourceUrl: boolean,
): SplitRecipeResult {
  const baseBudget = hasPhoto
    ? FRONT_SECTION_BUDGET[size].withPhoto
    : FRONT_SECTION_BUDGET[size].withoutPhoto;
  const frontBudget = applyReserve(baseBudget, hasSourceUrl ? SOURCE_URL_FOOTER_RESERVE[size] : 0);
  const frontLimits = hasPhoto
    ? FRONT_SECTION_LIMITS[size]?.withPhoto
    : FRONT_SECTION_LIMITS[size]?.withoutPhoto;
  const ingredients = splitByBudget(
    recipe.ingredients,
    frontBudget.ingredients,
    ingredientText,
    frontLimits?.ingredients,
  );
  const instructions = splitInstructionsByAvailableSpace(
    recipe.instructions,
    frontBudget.instructions,
    size,
    frontLimits?.instructions,
    true,
  );
  const ingredientsOverflow = ingredients.back.length > 0;

  return {
    frontIngredients: ingredients.front,
    frontInstructions: ingredientsOverflow ? ([] as Recipe["instructions"]) : instructions.front,
    backIngredients: ingredients.back,
    backInstructions: ingredientsOverflow ? recipe.instructions : instructions.back,
    frontLayout: "standard",
    backLayout: "standard",
  };
}

function splitStackedFront(
  recipe: Recipe,
  size: PrintCardSize,
  hasPhoto: boolean,
  hasSourceUrl: boolean,
  template?: RecipePrintTemplate,
): SplitRecipeResult {
  const baseBudget = hasPhoto
    ? STACKED_FRONT_BUDGET[size].withPhoto
    : STACKED_FRONT_BUDGET[size].withoutPhoto;
  const frontBudget = applyReserve(baseBudget, hasSourceUrl ? SOURCE_URL_FOOTER_RESERVE[size] : 0);
  const frontLimits = stackedFrontLimitsFor(size, hasPhoto, template);

  // Ingredients only reserve their smaller share when they finish on the front
  // and leave room for steps to begin. If they overflow that share they won't
  // finish here anyway — and steps must wait until ingredients end — so let them
  // run to the fuller `ingredientsOnly` budget rather than wrap early and strand
  // the lower half of the page.
  const shared = splitByBudget(
    recipe.ingredients,
    frontBudget.ingredients,
    ingredientText,
    frontLimits.ingredients,
  );
  const ingredients =
    shared.back.length > 0
      ? splitByBudget(
          recipe.ingredients,
          frontBudget.ingredientsOnly,
          ingredientText,
          frontLimits.ingredients,
        )
      : shared;

  if (ingredients.back.length > 0) {
    // Ingredients spill past the front, so every step continues on later faces.
    return {
      frontIngredients: ingredients.front,
      frontInstructions: [] as Recipe["instructions"],
      backIngredients: ingredients.back,
      backInstructions: recipe.instructions,
      frontLayout: "stacked",
      backLayout: "stacked",
    };
  }

  const ingredientHeightCost = ingredientLayoutCost(ingredients.front, "stacked");
  const remainingInstructionBudget = Math.min(
    frontBudget.instructions,
    frontBudget.total - ingredientHeightCost,
  );
  const instructions = splitInstructionsByAvailableSpace(
    recipe.instructions,
    remainingInstructionBudget,
    size,
    frontLimits.instructions,
    true,
    true,
  );

  return {
    frontIngredients: ingredients.front,
    frontInstructions: instructions.front,
    backIngredients: [] as Recipe["ingredients"],
    backInstructions: instructions.back,
    frontLayout: "stacked",
    backLayout: "stacked",
  };
}

function splitRecipe(
  recipe: Recipe,
  size: PrintCardSize,
  options: SplitOptions = {},
): SplitRecipeResult {
  const { hasPhoto = false, showSourceUrl = false, template, forceStacked = false } = options;
  const hasSourceUrl = showSourceUrl && Boolean(sourceLabel(recipe));

  if (!forceStacked) {
    const standardSplit = splitStandardFront(recipe, size, hasPhoto, hasSourceUrl);

    // Side-by-side is only used when the whole recipe fits on the front. The
    // moment anything spills onto another side, switch to the stacked layout
    // (full-width ingredients, then steps) so every face fills top-to-bottom.
    // Continuing a side-by-side split leaves a tall column beside a short one,
    // which is where the awkward half-empty pages came from.
    const fitsOnFront =
      standardSplit.backIngredients.length === 0 &&
      standardSplit.backInstructions.length === 0;
    if (fitsOnFront) {
      return standardSplit;
    }
  }

  return splitStackedFront(recipe, size, hasPhoto, hasSourceUrl, template);
}

export function recipeNeedsBackSide(
  recipe: Recipe,
  size: PrintCardSize,
  options?: SplitOptions,
): boolean {
  const { backIngredients, backInstructions } = splitRecipe(recipe, size, options);
  return backIngredients.length > 0 || backInstructions.length > 0;
}

export interface RecipeFace {
  ingredients: Recipe["ingredients"];
  instructions: Recipe["instructions"];
  layout: CardSectionLayout;
}

export interface RecipeFaces {
  front: RecipeFace;
  back: RecipeFace | null;
  pages: RecipeFace[];
  hasBack: boolean;
}

export type RecipeCardEditTarget =
  | { kind: "title" }
  | { kind: "cookTime" }
  | { kind: "servings" }
  | { kind: "image" }
  | { kind: "sourceUrl" }
  | { kind: "ingredient"; index: number }
  | { kind: "step"; index: number }
  | { kind: "ingredientSection"; index: number }
  | { kind: "instructionSection"; index: number };

export interface RecipeCardInlineEdit {
  editingTarget: RecipeCardEditTarget | null;
  value: string;
  onFocusTarget: (target: RecipeCardEditTarget, value: string) => void;
  onValueChange: (value: string) => void;
  onCommit: (value?: string) => void;
  onCancel: () => void;
  onInsertIngredient: (index: number) => void;
  onInsertStep: (index: number) => void;
  onSplitLine: (target: RecipeCardEditTarget, before: string, after: string) => void;
}

function continuationFaces(
  ingredients: Recipe["ingredients"],
  instructions: Recipe["instructions"],
  size: PrintCardSize,
  layout: CardSectionLayout,
): RecipeFace[] {
  const budget = CONTINUATION_FLOW_BUDGET[size][layout];
  const pages: RecipeFace[] = [];
  let remainingIngredients = ingredients;
  let remainingInstructions = instructions;

  while (remainingIngredients.length > 0 || remainingInstructions.length > 0) {
    // Ingredients share a face with steps only when they finish on it; the
    // smaller `ingredients` share keeps room for steps below. If they overflow
    // that share (or no steps remain), give them the fuller `ingredientsOnly`
    // budget so the face fills instead of wrapping ingredients early.
    const shared = splitByBudget(
      remainingIngredients,
      budget.ingredients,
      ingredientText,
    );
    const ingredientPage =
      shared.back.length > 0 || remainingInstructions.length === 0
        ? splitByBudget(remainingIngredients, budget.ingredientsOnly, ingredientText)
        : shared;
    const hasMoreIngredients = ingredientPage.back.length > 0;
    const ingredientHeightCost = ingredientLayoutCost(ingredientPage.front, layout);
    const instructionBudget =
      hasMoreIngredients
        ? 0
        : ingredientPage.front.length === 0
          ? budget.instructionsOnly
          : Math.min(budget.instructions, budget.total - ingredientHeightCost);
    const instructionsRenderInColumns =
      layout === "stacked" || ingredientPage.front.length === 0;
    const instructionPage = hasMoreIngredients
      ? { front: [] as Recipe["instructions"], back: remainingInstructions }
      : splitInstructionsByAvailableSpace(
          remainingInstructions,
          instructionBudget,
          size,
          Number.POSITIVE_INFINITY,
          false,
          instructionsRenderInColumns,
        );

    pages.push({
      ingredients: ingredientPage.front,
      instructions: instructionPage.front,
      layout,
    });

    remainingIngredients = ingredientPage.back;
    remainingInstructions = instructionPage.back;
  }

  return pages;
}

/**
 * The front/back faces a recipe splits into at a given size. The print page's
 * on-screen navigator renders these faces directly and is also what prints
 * (via `@media print`), so there's no separate print-only render to drift.
 */
export function getRecipeFaces(
  recipe: Recipe,
  size: PrintCardSize,
  options?: SplitOptions,
): RecipeFaces {
  const split = splitRecipe(recipe, size, options);
  const front = {
    ingredients: split.frontIngredients,
    instructions: split.frontInstructions,
    layout: split.frontLayout,
  };
  const continuations = continuationFaces(
    split.backIngredients,
    split.backInstructions,
    size,
    split.backLayout,
  );
  const pages = [front, ...continuations];
  const hasBack = continuations.length > 0;
  return {
    front,
    back: continuations[0] ?? null,
    pages,
    hasBack,
  };
}

export const RecipeCardFace = memo(function RecipeCardFace({
  recipe,
  ingredients,
  instructions,
  side,
  showHeader,
  layout,
  hasBackFace,
  previewHidden = false,
  blank = false,
  showImage = false,
  showSourceUrl = false,
  continued = false,
  inlineEdit,
}: {
  recipe: Recipe;
  ingredients: Recipe["ingredients"];
  instructions: Recipe["instructions"];
  side: "front" | "back";
  showHeader: boolean;
  layout: CardSectionLayout;
  hasBackFace: boolean;
  previewHidden?: boolean;
  blank?: boolean;
  showImage?: boolean;
  showSourceUrl?: boolean;
  continued?: boolean;
  inlineEdit?: RecipeCardInlineEdit;
}) {
  const source = sourceLabel(recipe);
  const meta = metaBits(recipe);
  const canEdit = Boolean(inlineEdit);
  // While editing, a section with nothing in it yet still gets a slot (with
  // just an "Add ingredient"/"Add step" prompt) so there's somewhere to
  // start — otherwise an empty recipe would never get past its first field.
  const showEmptyIngredients = canEdit && recipe.ingredients.length === 0;
  const showEmptyInstructions = canEdit && recipe.instructions.length === 0;
  const hasIngredientsSection = ingredients.length > 0 || showEmptyIngredients;
  const hasInstructionsSection = instructions.length > 0 || showEmptyInstructions;
  const ingredientsOnly = hasIngredientsSection && !hasInstructionsSection;
  const methodOnly = hasInstructionsSection && !hasIngredientsSection;
  const stackedLayout = layout === "stacked";
  const ingredientGroups = sectionGroups(ingredients);
  const instructionGroups = sectionGroups(instructions);
  // The photo only rides along on the front face (where the header lives). If
  // the source image 404s or is hotlink-blocked we drop it rather than print a
  // broken-image box.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [recipe.image]);
  // Individually-drawn rects, not an SVG <pattern> tile (and before that, a
  // tiled CSS gradient) — both of those get pre-rasterized to a fixed-DPI
  // bitmap by Chrome's print/PDF pipeline even though they render crisply
  // on screen, which is what actually turned this checkerboard blocky in
  // exported PDFs. Plain vector geometry has no tile to rasterize, so it
  // stays crisp at any print DPI. 48 bands (0.24in each) comfortably covers
  // the tallest card (11in letter); any extra past the real card height is
  // clipped by the SVG's own viewport, which is sized to the card by CSS.
  const checkerBands = 48;
  const showPhoto = showHeader && !imageFailed && (showImage && Boolean(recipe.image));

  // Whole-page edit mode means every field is a live input at once (see
  // togglePageEditMode in app/print/page.tsx) — there's no separate
  // select-then-edit step, so this only needs to tell the currently-focused
  // field apart from the rest (to know whether to show the shared draft
  // value or the field's live committed value).
  function sameTarget(a: RecipeCardEditTarget | null | undefined, b: RecipeCardEditTarget): boolean {
    if (!a || a.kind !== b.kind) return false;
    if (a.kind === "ingredient" && b.kind === "ingredient") return a.index === b.index;
    if (a.kind === "step" && b.kind === "step") return a.index === b.index;
    if (a.kind === "ingredientSection" && b.kind === "ingredientSection") return a.index === b.index;
    if (a.kind === "instructionSection" && b.kind === "instructionSection") return a.index === b.index;
    return true;
  }

  function startEdit(target: RecipeCardEditTarget, value: string) {
    inlineEdit?.onFocusTarget(target, value);
  }

  function commitEdit() {
    inlineEdit?.onCommit();
  }

  function handleEditKeyDown(
    event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    target?: RecipeCardEditTarget,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      inlineEdit?.onCancel();
      event.currentTarget.blur();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      // Ingredients/steps split at the cursor instead of committing the
      // whole field, so Enter behaves like it does in any text editor.
      if (inlineEdit && target && (target.kind === "ingredient" || target.kind === "step")) {
        const el = event.currentTarget;
        const cursor = el.selectionStart ?? el.value.length;
        inlineEdit.onSplitLine(target, el.value.slice(0, cursor), el.value.slice(cursor));
        return;
      }
      event.currentTarget.blur();
    }
  }

  function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") inlineEdit?.onCommit(reader.result);
    };
    reader.readAsDataURL(file);
  }

  // A freshly-inserted blank line has nothing for the user to have clicked
  // (it didn't exist a moment ago), so it never picks up real browser focus
  // on its own — this ref callback claims it once, the moment its element
  // mounts. `.focus()` on an already-focused element is a no-op, so reusing
  // this on every render (including while the user types) is safe.
  function focusIfEditing(target: RecipeCardEditTarget) {
    return (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (el && inlineEdit && sameTarget(inlineEdit.editingTarget, target) && document.activeElement !== el) {
        el.focus();
      }
    };
  }

  function insertIngredientAt(index: number) {
    inlineEdit?.onInsertIngredient(index);
  }

  function insertStepAt(index: number) {
    inlineEdit?.onInsertStep(index);
  }

  // Renders the click target that inserts a new blank ingredient/step.
  // `variant: "hover"` sits absolutely inside the preceding line and only
  // shows on hover (so it never affects layout when idle); `"empty"` is the
  // permanent one shown in place of a section that has nothing in it yet.
  function addLine(kind: "ingredient" | "step", index: number, variant: "hover" | "empty" = "hover") {
    if (!canEdit || !inlineEdit) return null;
    const label = kind === "ingredient" ? "Add ingredient" : "Add step";
    return (
      <button
        type="button"
        className={`recipe-card__add-line no-print ${
          variant === "empty" ? "recipe-card__add-line--empty" : ""
        }`}
        aria-label={label}
        onClick={(event) => {
          event.stopPropagation();
          if (kind === "ingredient") insertIngredientAt(index);
          else insertStepAt(index);
        }}
      >
        <span className="recipe-card__add-line-text">+ {label}</span>
      </button>
    );
  }

  function sectionTitle(
    kind: "ingredientSection" | "instructionSection",
    index: number,
    title: string,
  ) {
    if (!canEdit || !inlineEdit) {
      return <h3 className="recipe-card__section-title">{title}</h3>;
    }
    const target: RecipeCardEditTarget = { kind, index };
    const isEditingThis = sameTarget(inlineEdit.editingTarget, target);
    return (
      <input
        className="recipe-card__inline-input recipe-card__section-title"
        value={isEditingThis ? inlineEdit.value : title}
        aria-label="Section title"
        onFocus={() => startEdit(target, title)}
        onChange={(event) => inlineEdit.onValueChange(event.target.value)}
        onBlur={commitEdit}
        onKeyDown={handleEditKeyDown}
      />
    );
  }

  if (blank) {
    return (
      <article
        aria-hidden
        className="recipe-card recipe-card--back recipe-card--blank recipe-card--duplex-spacer"
        data-preview-hidden="true"
      />
    );
  }

  return (
    <article
      className={`recipe-card recipe-card--${side} ${
        continued ? "recipe-card--continued" : ""
      }`}
      data-has-back={hasBackFace ? "true" : undefined}
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div className="recipe-card__accent" aria-hidden />
      <div className="recipe-card__checker" aria-hidden>
        <svg width="100%" height="100%" focusable="false">
          {Array.from({ length: checkerBands }, (_, band) => {
            const y = band * 0.24;
            return (
              <Fragment key={band}>
                <rect x="0" y={`${y}in`} width="0.24in" height="0.24in" fill="#f8fffe" />
                <rect x="0.12in" y={`${y}in`} width="0.12in" height="0.12in" fill="#1479c9" />
                <rect x="0" y={`${y + 0.12}in`} width="0.12in" height="0.12in" fill="#1479c9" />
                <line
                  x1="0.12in"
                  y1={`${y}in`}
                  x2="0.24in"
                  y2={`${y + 0.12}in`}
                  stroke="#5fb0e6"
                  strokeWidth="0.003in"
                />
                <line
                  x1="0"
                  y1={`${y + 0.12}in`}
                  x2="0.12in"
                  y2={`${y + 0.24}in`}
                  stroke="#5fb0e6"
                  strokeWidth="0.003in"
                />
              </Fragment>
            );
          })}
        </svg>
      </div>

      {showHeader ? (
        <header
          className={`recipe-card__header ${
            showPhoto ? "recipe-card__header--with-photo" : ""
          }`}
        >
          <div className="recipe-card__headline">
            {canEdit && inlineEdit ? (
              <input
                className="recipe-card__inline-input recipe-card__title"
                value={sameTarget(inlineEdit.editingTarget, { kind: "title" }) ? inlineEdit.value : recipe.title}
                aria-label="Recipe title"
                onFocus={() => startEdit({ kind: "title" }, recipe.title)}
                onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                onBlur={commitEdit}
                onKeyDown={handleEditKeyDown}
              />
            ) : (
              <h1 className="recipe-card__title">{recipe.title}</h1>
            )}
            {canEdit && inlineEdit ? (
              <p className="recipe-card__meta recipe-card__meta--editable-targets">
                <input
                  className="recipe-card__inline-input recipe-card__inline-input--meta"
                  value={
                    sameTarget(inlineEdit.editingTarget, { kind: "cookTime" })
                      ? inlineEdit.value
                      : formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime) || ""
                  }
                  placeholder="Cook time"
                  aria-label="Cook time"
                  onFocus={() =>
                    startEdit({ kind: "cookTime" }, recipe.totalTime || recipe.cookTime || recipe.prepTime || "")
                  }
                  onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                />
                <span aria-hidden> · </span>
                <input
                  className="recipe-card__inline-input recipe-card__inline-input--meta"
                  value={
                    sameTarget(inlineEdit.editingTarget, { kind: "servings" })
                      ? inlineEdit.value
                      : recipe.servings ?? recipe.yield
                        ? `Serves ${recipe.servings ?? recipe.yield}`
                        : ""
                  }
                  placeholder="Servings"
                  aria-label="Servings"
                  onFocus={() =>
                    startEdit({ kind: "servings" }, recipe.servings === undefined ? "" : String(recipe.servings))
                  }
                  onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={handleEditKeyDown}
                />
              </p>
            ) : (
              meta.length > 0 && <p className="recipe-card__meta">{meta.join("  ·  ")}</p>
            )}
          </div>
          {showPhoto && (
            <span className={`recipe-card__photo ${canEdit ? "recipe-card__photo--editable" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="recipe-card__photo-img"
                src={recipe.image}
                alt={recipe.title ? `Photo of ${recipe.title}` : "Recipe photo"}
                decoding="async"
                onError={() => setImageFailed(true)}
              />
              {canEdit && inlineEdit && (
                <>
                  <label className="recipe-card__photo-edit">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only absolute h-px w-px overflow-hidden"
                      onChange={handleImageChange}
                    />
                  </label>
                  <button
                    type="button"
                    className="recipe-card__photo-remove"
                    aria-label="Remove photo"
                    onClick={() => inlineEdit.onCommit("")}
                  >
                    <XIcon size={ICON_SIZE.xs} />
                  </button>
                </>
              )}
            </span>
          )}
        </header>
      ) : null}

      <div
        className={`recipe-card__cols ${
          !hasIngredientsSection ? "recipe-card__cols--single" : ""
        } ${ingredientsOnly ? "recipe-card__cols--ingredients-only" : ""} ${
          methodOnly ? "recipe-card__cols--method-only" : ""
        } ${stackedLayout ? "recipe-card__cols--stacked" : ""}`}
      >
        {hasIngredientsSection && (
          <section
            className={`recipe-card__ingredients ${
              ingredientsOnly || stackedLayout ? "recipe-card__ingredients--wide" : ""
            }`}
          >
            <h2 className="recipe-card__label">Ingredients</h2>
            <div className="recipe-card__section-groups">
              {ingredientGroups.length === 0
                ? showEmptyIngredients && (
                    <div className="recipe-card__section-group">
                      <ul>
                        <li className="recipe-card__editable-line">
                          {addLine("ingredient", 0, "empty")}
                        </li>
                      </ul>
                    </div>
                  )
                : ingredientGroups.map((group, groupIndex) => (
                    <div
                      className="recipe-card__section-group"
                      key={`${group.title ?? "ingredients"}-${groupIndex}`}
                    >
                      {group.title &&
                        sectionTitle(
                          "ingredientSection",
                          recipe.ingredients.indexOf(group.items[0]),
                          group.title,
                        )}
                      <ul>
                        {group.items.map((ing, i) => {
                          const index = recipe.ingredients.indexOf(ing);
                          const target: RecipeCardEditTarget = { kind: "ingredient", index };
                          const text = ingredientText(ing);
                          const isEditingThis = inlineEdit && sameTarget(inlineEdit.editingTarget, target);
                          const displayValue = isEditingThis ? inlineEdit!.value : text;
                          return (
                            <li key={`${groupIndex}-${i}`} className="recipe-card__editable-line">
                              {canEdit && inlineEdit ? (
                                <textarea
                                  ref={focusIfEditing(target)}
                                  className="recipe-card__inline-textarea recipe-card__inline-textarea--line"
                                  value={displayValue}
                                  aria-label="Ingredient"
                                  rows={Math.max(1, displayValue.split(/\r?\n/).length)}
                                  onFocus={() => startEdit(target, text)}
                                  onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={(event) => handleEditKeyDown(event, target)}
                                />
                              ) : (
                                text
                              )}
                              {addLine("ingredient", index + 1)}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
            </div>
          </section>
        )}

        {hasInstructionsSection && (
          <section
            className={`recipe-card__method ${
              methodOnly || stackedLayout ? "recipe-card__method--wide" : ""
            }`}
          >
            <h2 className="recipe-card__label">
              Steps
              {side === "front" && hasBackFace && !continued ? (
                <span className="recipe-card__continued-inline"> (continued on back)</span>
              ) : side === "back" || continued ? (
                " continued"
              ) : (
                ""
              )}
            </h2>
            <div className="recipe-card__section-groups">
              {instructionGroups.length === 0
                ? showEmptyInstructions && (
                    <div className="recipe-card__section-group">
                      <ol>
                        <li className="recipe-card__editable-line">
                          {addLine("step", 0, "empty")}
                        </li>
                      </ol>
                    </div>
                  )
                : instructionGroups.map((group, groupIndex) => (
                    <div
                      className="recipe-card__section-group"
                      key={`${group.title ?? "steps"}-${groupIndex}`}
                    >
                      {group.title &&
                        sectionTitle(
                          "instructionSection",
                          recipe.instructions.indexOf(group.items[0]),
                          group.title,
                        )}
                      <ol>
                        {group.items.map((step) => {
                          const index = recipe.instructions.indexOf(step);
                          const target: RecipeCardEditTarget = { kind: "step", index };
                          const isEditingThis = inlineEdit && sameTarget(inlineEdit.editingTarget, target);
                          const displayValue = isEditingThis ? inlineEdit!.value : step.text;
                          return (
                            <li
                              key={`${step.step}-${step.text.slice(0, 24)}`}
                              className="recipe-card__editable-line"
                            >
                              <span className="recipe-card__step-number">{step.step}</span>
                              {canEdit && inlineEdit ? (
                                <textarea
                                  ref={focusIfEditing(target)}
                                  className="recipe-card__inline-textarea recipe-card__inline-textarea--line"
                                  value={displayValue}
                                  aria-label="Step"
                                  rows={Math.max(1, displayValue.split(/\r?\n/).length)}
                                  onFocus={() => startEdit(target, step.text)}
                                  onChange={(event) => inlineEdit.onValueChange(event.target.value)}
                                  onBlur={commitEdit}
                                  onKeyDown={(event) => handleEditKeyDown(event, target)}
                                />
                              ) : (
                                <span>{step.text}</span>
                              )}
                              {addLine("step", index + 1)}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ))}
            </div>
          </section>
        )}
      </div>

      <footer className="recipe-card__footer">
        <span className="recipe-card__footer-brand">Printed with RecipePrinter</span>
        {showSourceUrl && showHeader && (
          canEdit && inlineEdit ? (
            <input
              className="recipe-card__inline-input recipe-card__footer-source"
              value={
                sameTarget(inlineEdit.editingTarget, { kind: "sourceUrl" })
                  ? inlineEdit.value
                  : recipe.sourceUrl ?? ""
              }
              placeholder="Add link"
              aria-label="Source link"
              onFocus={() => startEdit({ kind: "sourceUrl" }, recipe.sourceUrl ?? "")}
              onChange={(event) => inlineEdit.onValueChange(event.target.value)}
              onBlur={commitEdit}
              onKeyDown={handleEditKeyDown}
            />
          ) : (
            source && <span className="recipe-card__footer-source">{source}</span>
          )
        )}
      </footer>
    </article>
  );
});
