import { formatRecipeTime } from "@/lib/time";
import type { CoverConfig, Recipe, RecipePageLayout } from "@/types/recipe";
import type { CardSectionLayout, PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";

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

// Bistro and pantry both push the card's left padding in further to clear a
// decorative spine (a checkerboard strip, a notebook rule-and-holes column —
// see `.recipe-template--bistro`/`.recipe-template--pantry .recipe-card` in
// globals.css), narrowing every two-column "wide" section's usable width.
// The cost budgets above are calibrated against the unindented card, so
// without this a step estimated to just barely fit can still overflow its
// real (narrower) column — and since a single step is unbreakable, the
// browser is forced to fragment it mid-sentence rather than defer it to the
// back. Charged as a flat reserve (see `applyReserve`) against the stacked
// front budget so borderline steps defer to the back face instead.
const TEMPLATE_STACKED_FRONT_GUTTER_RESERVE: Partial<
  Record<RecipePrintTemplate, Partial<Record<PrintCardSize, number>>>
> = {
  bistro: { "card-6x4": 25 },
  pantry: { "card-6x4": 35 },
  cookout: { "card-6x4": 30 },
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

export function sourceLabel(recipe: Recipe): string | null {
  if (!recipe.sourceUrl || !/^https?:\/\//i.test(recipe.sourceUrl)) return null;
  try {
    const url = new URL(recipe.sourceUrl);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return recipe.sourceUrl.split("#")[0].replace(/\/$/, "");
  }
}

export function metaBits(recipe: Recipe): string[] {
  const bits: string[] = [];
  const time = formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime);
  if (time) bits.push(time);
  const serves = recipe.servings ?? recipe.yield;
  if (serves) bits.push(`Serves ${serves}`);
  return bits;
}

export function ingredientText(ing: Recipe["ingredients"][number]): string {
  if (ing.raw) return ing.raw;
  const amount = [ing.amount, ing.unit].filter(Boolean).join(" ");
  return [amount, ing.name].filter(Boolean).join(" ") + (ing.note ? `, ${ing.note}` : "");
}

// Splits a flat, ordered sequence of real rendered heights into two newspaper
// columns: column 1 gets items[0..k), column 2 gets items[k..n). This is a
// balanced-bisection problem (find the single cut point whose prefix sum is
// closest to half the total), not a bin-packing/greedy-interleave one — the
// latter would scatter items across columns out of reading order (e.g. 1,3,5
// in column 1 and 2,4,6 in column 2), which is wrong for content that reads
// top-to-bottom-then-left-to-right. `heights` must already account for any
// item that has to stay glued to what precedes it (e.g. a section title glued
// to its first item) — glue it into one height before calling this.
export function splitIntoColumns(heights: number[]): number {
  const n = heights.length;
  if (n === 0) return 0;

  const total = heights.reduce((sum, h) => sum + h, 0);
  const target = total / 2;

  let prefix = 0;
  let bestIndex = 1;
  let bestDiff = Number.POSITIVE_INFINITY;
  // Column 1 always gets at least one item (k starts at 1) — an empty first
  // column below a full second one isn't a balance CSS's column-fill:balance
  // would ever produce, and isn't better-balanced by any measure once there's
  // real content to place.
  for (let k = 1; k <= n; k++) {
    prefix += heights[k - 1];
    const diff = Math.abs(prefix - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIndex = k;
    }
  }
  return bestIndex;
}

export function sectionGroups<T extends { section?: string }>(items: T[]) {
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

export interface ColumnChunk<T> {
  item: T;
  /** Index into the original flat items array (e.g. recipe.ingredients). */
  index: number;
  /** Set only on a group's first item — the chunk `splitIntoColumns` should measure with its title glued on. */
  groupTitle?: string;
  /** Groups consecutive chunks that belong to the same section group, so a renderer knows where to open/close a group wrapper. */
  groupId: number;
}

// Flattens `sectionGroups`' output back into one ordered sequence, one chunk
// per item, tagging each group's first item with its title (the unit
// `splitIntoColumns` should measure as one glued block) and every chunk with
// a stable `groupId` (so a column renderer, walking its own slice of this
// list, knows where one section group's wrapper ends and the next begins —
// independent of which chunks a given column ends up holding).
export function buildColumnChunks<T>(
  groups: Array<{ title?: string; items: T[] }>,
  indexOf: (item: T) => number,
): ColumnChunk<T>[] {
  const chunks: ColumnChunk<T>[] = [];
  groups.forEach((group, groupId) => {
    group.items.forEach((item, i) => {
      chunks.push({ item, index: indexOf(item), groupTitle: i === 0 ? group.title : undefined, groupId });
    });
  });
  return chunks;
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
  const gutterReserve = TEMPLATE_STACKED_FRONT_GUTTER_RESERVE[template ?? "classic"]?.[size] ?? 0;
  const frontBudget = applyReserve(
    baseBudget,
    (hasSourceUrl ? SOURCE_URL_FOOTER_RESERVE[size] : 0) + gutterReserve,
  );
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
  /**
   * Shrink-to-fit factor for this face's content, 1 = unscaled. Set only by
   * the measurement pass, and only for a face that pagination genuinely
   * cannot rescue: one whose remaining content is a single unbreakable item
   * still taller than the card. Moving that item to its own face doesn't help
   * — it overflows there too — so the sole remaining lever is smaller type.
   */
  contentScale?: number;
}

export interface RecipeFaces {
  front: RecipeFace;
  back: RecipeFace | null;
  pages: RecipeFace[];
  hasBack: boolean;
}

// Section dividers and covers are always exactly one physical page — unlike a
// recipe, there's no content-length budget to split across faces — so these
// sibling resolvers exist purely for naming symmetry with `getRecipeFaces`
// and to give the divider/cover a distinct, tagged shape `usePrintSheets` can
// dispatch on, rather than forcing them into `RecipeFace`'s ingredients/
// instructions shape.

export interface SectionDividerContent {
  title: string;
}

export function dividerToFaces(title: string): SectionDividerContent {
  return { title };
}

export interface CoverContent {
  cover: CoverConfig;
  side: "front" | "back";
}

export function coverToFaces(cover: CoverConfig, side: "front" | "back" = "front"): CoverContent {
  return { cover, side };
}

export type RecipeCardEditTarget =
  | { kind: "title" }
  | { kind: "description" }
  | { kind: "cookTime" }
  | { kind: "servings" }
  | { kind: "image" }
  | { kind: "sourceUrl" }
  | { kind: "ingredient"; index: number }
  | { kind: "step"; index: number }
  | { kind: "ingredientSection"; index: number }
  | { kind: "instructionSection"; index: number };

export interface RecipeCardInlineEdit {
  /** Other photos already in this project, offered by the shared image picker. */
  recipeImages?: string[];
  /** Cookbook only: the recipe's photo placement + a setter, so the in-card
      "Photo" dialog can change None/In-card/Full-page in the same place it
      changes the photo's source. */
  photoPlacement?: string;
  photoPlacementOptions?: Array<{ id: string; label: string; hint?: string }>;
  onPhotoPlacementChange?: (id: string) => void;
  editingTarget: RecipeCardEditTarget | null;
  value: string;
  onFocusTarget: (target: RecipeCardEditTarget, value: string) => void;
  onValueChange: (value: string) => void;
  onCommit: (value?: string) => void;
  onImageChange: (url: string) => void;
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

/* ── Cookbook page-layout planning (Phase 2b) ──────────────────────────────
   Pure planning of how a section's recipes fall onto physical sheets, given
   each recipe's resolved page layout and its measured face COUNT. Kept DOM-free
   and out of the `usePrintSheets` hook so the risky part — inserting photo
   pages, keeping reading order — is unit-testable. The hook resolves each
   `frontFace`/`backFace` index back to a real `RecipeFace` and attaches the
   recipe/label/queueIndex.

   Rules (a cookbook always gives each recipe its own full page):
   - `full`/`image-spread` → one card per sheet; the card's overflow continues
     on its own back only when the job is duplex (`continueOnBack`).
   - `image-spread` prepends a full-bleed facing photo page (only if a hero
     image exists), then the card page(s). */
export interface CookbookPlanItem {
  id: string;
  layout: RecipePageLayout;
  /** Number of measured faces at the recipe's effective size (>=1). */
  faceCount: number;
  /** Facing-page image for `image-spread`; absent = no photo page emitted. */
  heroImageUrl?: string;
}

export interface CookbookPlanRecipeSlot {
  kind: "recipe";
  itemId: string;
  /** Index into the recipe's face list for the front of this slot. */
  frontFace: number;
  /** Index for the duplex back, or null when this slot is single-sided. */
  backFace: number | null;
  /** Total faces the recipe has (so the renderer knows `hasBack`). */
  faceCount: number;
}

export interface CookbookPlanImageSlot {
  kind: "image";
  itemId: string;
  heroImageUrl: string;
}

export type CookbookPlanSlot = CookbookPlanRecipeSlot | CookbookPlanImageSlot;

export interface CookbookPlanSheet {
  slots: (CookbookPlanSlot | null)[];
  /** `image` = a full-bleed facing photo page (image-spread). */
  layoutKind?: "image";
  backGroupNeeded: boolean;
}

function planFullRecipe(item: CookbookPlanItem, continueOnBack: boolean): CookbookPlanSheet[] {
  const out: CookbookPlanSheet[] = [];
  const faceCount = Math.max(1, item.faceCount);
  let idx = 0;
  while (idx < faceCount) {
    const front = idx;
    idx += 1;
    let back: number | null = null;
    if (continueOnBack && idx < faceCount) {
      back = idx;
      idx += 1;
    }
    out.push({
      slots: [{ kind: "recipe", itemId: item.id, frontFace: front, backFace: back, faceCount }],
      backGroupNeeded: back !== null,
    });
  }
  return out;
}

export function planCookbookSection(
  items: CookbookPlanItem[],
  { continueOnBack }: { continueOnBack: boolean },
): CookbookPlanSheet[] {
  const out: CookbookPlanSheet[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i];

    if (item.layout === "image-spread") {
      if (item.heroImageUrl) {
        out.push({
          layoutKind: "image",
          backGroupNeeded: false,
          slots: [{ kind: "image", itemId: item.id, heroImageUrl: item.heroImageUrl }],
        });
      }
      out.push(...planFullRecipe(item, continueOnBack));
      i += 1;
      continue;
    }

    out.push(...planFullRecipe(item, continueOnBack));
    i += 1;
  }
  return out;
}

/* ── Book imposition — pages → two-page spreads (Phase 1) ───────────────────
   Cookbook mode reads as an open book: one SPREAD (left/verso + right/recto) at
   a time. This pure pass groups the ordered page list into spreads with real
   book parity, so the on-screen deck can render two facing pages. It decides
   grouping ONLY (which page sits left vs right, where a blank filler goes) — the
   pages themselves are unchanged, and print still emits one page per sheet.

   Rules:
   - The front cover and back cover each stand alone (no facing page).
   - Body pages fill left→right in their natural order.
   - No blank sheets are inserted to force chapter, TOC, image, or recipe parity.
   - A trailing null is preview-only presentation for an incomplete spread; it
     never becomes a physical `PageSheet` or printed page. */
export type BookPageKind =
  | "cover"
  | "dedication"
  | "back"
  | "chapter"
  | "section-photo"
  | "image-photo"
  | "content";

export interface BookSpread {
  /** Index (into the input array) of the left/verso page, or null for a blank. */
  left: number | null;
  /** Index of the right/recto page, or null for a blank. */
  right: number | null;
  /** A standalone cover/back-cover page — shown as one centered page, no facing. */
  single: boolean;
}

export function assembleSpreads(pages: BookPageKind[]): BookSpread[] {
  const spreads: BookSpread[] = [];
  let start = 0;
  let end = pages.length;

  if (pages[start] === "cover") {
    spreads.push({ left: null, right: start, single: true });
    start += 1;
  }
  let backSpread: BookSpread | null = null;
  if (end - 1 >= start && pages[end - 1] === "back") {
    backSpread = { left: end - 1, right: null, single: true };
    end -= 1;
  }

  // Keep a full-photo page and the recipe immediately following it as one
  // atomic editorial spread. Other pages still flow naturally; a lone page
  // before an image spread is merely presented by itself in the preview and
  // does not create a printed padding sheet.
  let cursor = start;
  while (cursor < end) {
    if (pages[cursor] === "image-photo" && pages[cursor + 1] === "content") {
      spreads.push({ left: cursor, right: cursor + 1, single: false });
      cursor += 2;
      continue;
    }
    if (pages[cursor + 1] === "image-photo" && pages[cursor + 2] === "content") {
      spreads.push({ left: cursor, right: null, single: false });
      cursor += 1;
      continue;
    }
    // Keep a chapter opener and its facing full-page/grid photo as one atomic
    // spread — opener on the left/verso, photo on the right/recto. Same shape as
    // the image-spread pair above, with the realign lookahead so a stray page
    // can't split the opener from its photo.
    if (pages[cursor] === "chapter" && pages[cursor + 1] === "section-photo") {
      spreads.push({ left: cursor, right: cursor + 1, single: false });
      cursor += 2;
      continue;
    }
    if (pages[cursor + 1] === "chapter" && pages[cursor + 2] === "section-photo") {
      spreads.push({ left: cursor, right: null, single: false });
      cursor += 1;
      continue;
    }
    spreads.push({
      left: cursor,
      right: cursor + 1 < end ? cursor + 1 : null,
      single: false,
    });
    cursor += 2;
  }

  if (backSpread) spreads.push(backSpread);
  return spreads;
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
