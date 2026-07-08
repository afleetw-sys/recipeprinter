"use client";

import { Fragment, memo, useState } from "react";
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
type CardSectionLayout = "standard" | "stacked";

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
}

// The source link adds a second, wrapped line to the front face's footer.
// Charged against the front budget (in the same `textCost` units as the
// ingredient/instruction budgets above) so a recipe that was packed right up
// to the fixed card height spills onto the back instead of having its footer
// silently clipped off by print's `overflow: hidden`.
const SOURCE_URL_FOOTER_RESERVE: Record<PrintCardSize, number> = {
  letter: 260,
  "card-6x4": 240,
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
  const time = recipe.totalTime || recipe.cookTime || recipe.prepTime;
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
  const { hasPhoto = false, showSourceUrl = false, template } = options;
  const hasSourceUrl = showSourceUrl && Boolean(sourceLabel(recipe));
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
}) {
  const source = sourceLabel(recipe);
  const meta = metaBits(recipe);
  const ingredientsOnly = ingredients.length > 0 && instructions.length === 0;
  const methodOnly = instructions.length > 0 && ingredients.length === 0;
  const stackedLayout = layout === "stacked";
  const ingredientGroups = sectionGroups(ingredients);
  const instructionGroups = sectionGroups(instructions);
  // The photo only rides along on the front face (where the header lives). If
  // the source image 404s or is hotlink-blocked we drop it rather than print a
  // broken-image box.
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = showImage && showHeader && Boolean(recipe.image) && !imageFailed;
  // Individually-drawn rects, not an SVG <pattern> tile (and before that, a
  // tiled CSS gradient) — both of those get pre-rasterized to a fixed-DPI
  // bitmap by Chrome's print/PDF pipeline even though they render crisply
  // on screen, which is what actually turned this checkerboard blocky in
  // exported PDFs. Plain vector geometry has no tile to rasterize, so it
  // stays crisp at any print DPI. 48 bands (0.24in each) comfortably covers
  // the tallest card (11in letter); any extra past the real card height is
  // clipped by the SVG's own viewport, which is sized to the card by CSS.
  const checkerBands = 48;

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
            <h1 className="recipe-card__title">{recipe.title}</h1>
            {meta.length > 0 && <p className="recipe-card__meta">{meta.join("  ·  ")}</p>}
          </div>
          {showPhoto && (
            <span className="recipe-card__photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="recipe-card__photo-img"
                src={recipe.image}
                alt={recipe.title ? `Photo of ${recipe.title}` : "Recipe photo"}
                decoding="async"
                onError={() => setImageFailed(true)}
              />
            </span>
          )}
        </header>
      ) : null}

      <div
        className={`recipe-card__cols ${
          ingredients.length === 0 ? "recipe-card__cols--single" : ""
        } ${ingredientsOnly ? "recipe-card__cols--ingredients-only" : ""} ${
          methodOnly ? "recipe-card__cols--method-only" : ""
        } ${stackedLayout ? "recipe-card__cols--stacked" : ""}`}
      >
        {ingredients.length > 0 && (
          <section
            className={`recipe-card__ingredients ${
              ingredientsOnly || stackedLayout ? "recipe-card__ingredients--wide" : ""
            }`}
          >
            <h2 className="recipe-card__label">Ingredients</h2>
            <div className="recipe-card__section-groups">
              {ingredientGroups.map((group, groupIndex) => (
                <div
                  className="recipe-card__section-group"
                  key={`${group.title ?? "ingredients"}-${groupIndex}`}
                >
                  {group.title && (
                    <h3 className="recipe-card__section-title">{group.title}</h3>
                  )}
                  <ul>
                    {group.items.map((ing, i) => (
                      <li key={`${groupIndex}-${i}`}>{ingredientText(ing)}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {instructions.length > 0 && (
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
              {instructionGroups.map((group, groupIndex) => (
                <div
                  className="recipe-card__section-group"
                  key={`${group.title ?? "steps"}-${groupIndex}`}
                >
                  {group.title && (
                    <h3 className="recipe-card__section-title">{group.title}</h3>
                  )}
                  <ol>
                    {group.items.map((step) => (
                      <li key={`${step.step}-${step.text.slice(0, 24)}`}>
                        <span className="recipe-card__step-number">{step.step}</span>
                        <span>{step.text}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="recipe-card__footer">
        <span className="recipe-card__footer-brand">Printed with RecipePrinter</span>
        {showSourceUrl && showHeader && source && (
          <span className="recipe-card__footer-source">{source}</span>
        )}
      </footer>
    </article>
  );
});
