"use client";

import { useEffect, useState } from "react";
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

export type RecipePrintTemplate = "classic" | "heirloom" | "bistro" | "pantry" | "counter";

export const RECIPE_PRINT_TEMPLATE_OPTIONS: Array<{
  id: RecipePrintTemplate;
  label: string;
  detail: string;
}> = [
  { id: "classic", label: "Classic", detail: "Bright blue, clean cookbook card" },
  { id: "pantry", label: "Pantry", detail: "Fine ruled lines with small ingredient sketches" },
  { id: "counter", label: "Counter", detail: "Black-and-white notes with tiny counter details" },
  { id: "heirloom", label: "Heirloom", detail: "Cream stock, red utensil keepsake" },
  { id: "bistro", label: "Bistro", detail: "Blue checks, tomato red, playful kitchen card" },
];

// How much ingredient/instruction text fits on the front before it must
// continue on the back, in `textCost` units. Calibrated to the real printed
// page capacity (letter instructions render at ~0.79px per cost unit, so a
// letter front holds ~1100 cost) with a small safety margin so the tail flows
// to the back rather than clipping at the page edge.
const FRONT_SECTION_BUDGET: Record<
  PrintCardSize,
  { ingredients: number; instructions: number }
> = {
  letter: { ingredients: 1000, instructions: 1050 },
  "card-6x4": { ingredients: 760, instructions: 980 },
};

// Showing the recipe photo pushes the columns down, so the front holds less
// text. Letter leads with a tall banner above the title on the templates that
// support it (classic/counter); every other case tucks a smaller thumbnail
// beside the title. These are the budget units to reclaim from the front when a
// photo renders, matched to how much vertical space each treatment consumes.
function photoFrontReduction(size: PrintCardSize, template: RecipePrintTemplate): number {
  if (size === "letter") {
    return template === "classic" || template === "counter" ? 270 : 120;
  }
  return 110;
}

interface SplitOptions {
  hasPhoto?: boolean;
  template?: RecipePrintTemplate;
}

const BACK_SECTION_BUDGET: Record<
  PrintCardSize,
  { ingredients: number; instructions: number }
> = {
  letter: { ingredients: 2500, instructions: 3800 },
  "card-6x4": { ingredients: 900, instructions: 1200 },
};

// Hard item caps guard against many-but-tiny steps overflowing the fixed card
// height (the length-aware budget above handles the usual case). Keep these
// loose so short recipes stay on one side instead of spilling onto the back.
const FRONT_SECTION_LIMITS: Partial<
  Record<PrintCardSize, { ingredients: number; instructions: number }>
> = {
  "card-6x4": { ingredients: 12, instructions: 9 },
};

type CardSectionLayout = "standard" | "stacked";

interface SplitRecipeResult {
  frontIngredients: Recipe["ingredients"];
  frontInstructions: Recipe["instructions"];
  backIngredients: Recipe["ingredients"];
  backInstructions: Recipe["instructions"];
  frontLayout: CardSectionLayout;
  backLayout: CardSectionLayout;
}

function sourceLabel(recipe: Recipe): string | null {
  if (recipe.sourceUrl) {
    return recipe.sourceUrl;
  }
  if (recipe.sourceName) return recipe.sourceName;
  return null;
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

function textCost(value: string): number {
  return value.length + Math.max(0, value.split(/\s+/).length - 1) * 2;
}

function splitByBudget<T>(
  items: T[],
  budget: number,
  label: (item: T) => string,
  maxFrontItems = Number.POSITIVE_INFINITY,
) {
  if (!Number.isFinite(budget)) return { front: items, back: [] };

  const front: T[] = [];
  const back: T[] = [];
  let used = 0;
  let overflowStarted = false;

  for (const item of items) {
    const cost = textCost(label(item));
    if (
      overflowStarted ||
      (front.length > 0 && (front.length >= maxFrontItems || used + cost > budget))
    ) {
      overflowStarted = true;
      back.push(item);
    } else {
      front.push(item);
      used += cost;
    }
  }

  return { front, back };
}

function splitIngredientHeavyCard(recipe: Recipe): SplitRecipeResult {
  const ingredientRows = Math.ceil(recipe.ingredients.length / 2);
  const instructionBudget = Math.max(260, 880 - ingredientRows * 46);
  const instructions = splitByBudget(
    recipe.instructions,
    instructionBudget,
    (step) => step.text,
    4,
  );

  return {
    frontIngredients: recipe.ingredients,
    frontInstructions: instructions.front,
    backIngredients: [] as Recipe["ingredients"],
    backInstructions: instructions.back,
    frontLayout: "stacked",
    backLayout: "standard",
  };
}

function splitRecipe(
  recipe: Recipe,
  size: PrintCardSize,
  options: SplitOptions = {},
): SplitRecipeResult {
  const { hasPhoto = false, template = "classic" } = options;
  const baseBudget = FRONT_SECTION_BUDGET[size];
  const reduction = hasPhoto ? photoFrontReduction(size, template) : 0;
  const frontBudget = {
    ingredients: Math.max(120, baseBudget.ingredients - reduction),
    instructions: Math.max(160, baseBudget.instructions - reduction),
  };
  const frontLimits = FRONT_SECTION_LIMITS[size];
  const ingredients = splitByBudget(
    recipe.ingredients,
    frontBudget.ingredients,
    ingredientText,
    frontLimits?.ingredients,
  );
  const instructions = splitByBudget(
    recipe.instructions,
    frontBudget.instructions,
    (step) => step.text,
    frontLimits?.instructions,
  );

  if (size === "card-6x4" && ingredients.back.length > 0) {
    return splitIngredientHeavyCard(recipe);
  }

  if (ingredients.back.length === 0 && instructions.back.length === 0) {
    return {
      frontIngredients: ingredients.front,
      frontInstructions: instructions.front,
      backIngredients: [] as Recipe["ingredients"],
      backInstructions: [] as Recipe["instructions"],
      frontLayout: "standard",
      backLayout: "standard",
    };
  }

  const backBudget = BACK_SECTION_BUDGET[size];
  const backIngredients = splitByBudget(
    ingredients.back,
    backBudget.ingredients,
    ingredientText,
  );
  const backInstructions = splitByBudget(
    instructions.back,
    backBudget.instructions,
    (step) => step.text,
  );

  return {
    frontIngredients: ingredients.front,
    frontInstructions: instructions.front,
    backIngredients: [...backIngredients.front, ...backIngredients.back],
    backInstructions: [...backInstructions.front, ...backInstructions.back],
    frontLayout: "standard",
    backLayout: "standard",
  };
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
  hasBack: boolean;
}

/**
 * The front/back faces a recipe splits into at a given size. The on-screen page
 * navigator uses this to mirror exactly what `RecipeCardPrint` will print.
 */
export function getRecipeFaces(
  recipe: Recipe,
  size: PrintCardSize,
  options?: SplitOptions,
): RecipeFaces {
  const split = splitRecipe(recipe, size, options);
  const hasBack =
    split.backIngredients.length > 0 || split.backInstructions.length > 0;
  return {
    front: {
      ingredients: split.frontIngredients,
      instructions: split.frontInstructions,
      layout: split.frontLayout,
    },
    back: hasBack
      ? {
          ingredients: split.backIngredients,
          instructions: split.backInstructions,
          layout: split.backLayout,
        }
      : null,
    hasBack,
  };
}

export function RecipeCardFace({
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
}) {
  const source = sourceLabel(recipe);
  const meta = metaBits(recipe);
  const ingredientsOnly = ingredients.length > 0 && instructions.length === 0;
  const methodOnly = instructions.length > 0 && ingredients.length === 0;
  const stackedLayout = layout === "stacked";
  // The photo only rides along on the front face (where the header lives). If
  // the source image 404s or is hotlink-blocked we drop it rather than print a
  // broken-image box.
  const [imageFailed, setImageFailed] = useState(false);
  const showPhoto = showImage && showHeader && Boolean(recipe.image) && !imageFailed;

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
      className={`recipe-card recipe-card--${side}`}
      data-has-back={hasBackFace ? "true" : undefined}
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div className="recipe-card__accent" aria-hidden />

      {showHeader ? (
        <header
          className={`recipe-card__header ${
            showPhoto ? "recipe-card__header--with-photo" : ""
          }`}
        >
          <div className="recipe-card__headline">
            <h1 className="recipe-card__title">{recipe.title}</h1>
            {(meta.length > 0 || source) && (
              <p className="recipe-card__meta">
                {meta.join("  ·  ")}
                {meta.length > 0 && source ? "  ·  " : ""}
                {source && <span className="recipe-card__source">{source}</span>}
              </p>
            )}
          </div>
          {showPhoto && (
            <span className="recipe-card__photo" aria-hidden>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="recipe-card__photo-img"
                src={recipe.image}
                alt=""
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
            <ul>
              {ingredients.map((ing, i) => (
                <li key={i}>{ingredientText(ing)}</li>
              ))}
            </ul>
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
              {side === "front" && hasBackFace ? (
                <span className="recipe-card__continued-inline"> (continued on back)</span>
              ) : side === "back" ? (
                " continued"
              ) : (
                ""
              )}
            </h2>
            <ol>
              {instructions.map((step) => (
                <li key={`${step.step}-${step.text.slice(0, 24)}`}>
                  <span className="recipe-card__step-number">{step.step}</span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="recipe-card__footer">
        <span>Printed with RecipePrinter</span>
      </footer>
    </article>
  );
}

export default function RecipeCardPrint({
  recipe,
  size,
  template,
  doubleSided,
  isLast,
  showImage = false,
}: {
  recipe: Recipe;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  doubleSided: boolean;
  isLast?: boolean;
  showImage?: boolean;
}) {
  const [previewSide, setPreviewSide] = useState<"front" | "back">("front");
  const {
    frontIngredients,
    frontInstructions,
    backIngredients,
    backInstructions,
    frontLayout,
    backLayout,
  } = splitRecipe(recipe, size, {
    hasPhoto: showImage && Boolean(recipe.image),
    template,
  });
  const hasBack = backIngredients.length > 0 || backInstructions.length > 0;
  const needsPrintBack = hasBack || (doubleSided && !isLast);
  const showSideNav = doubleSided && hasBack;

  useEffect(() => {
    if (!doubleSided) setPreviewSide("front");
  }, [doubleSided]);

  return (
    <div className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}>
      {showSideNav && (
        <div className="recipe-card-side-nav no-print" aria-label={`${recipe.title} sides`}>
          <button
            type="button"
            className="recipe-card-side-nav__button"
            aria-label="Show front"
            disabled={previewSide === "front"}
            onClick={() => setPreviewSide("front")}
          >
            ←
          </button>
          <span>{previewSide === "front" ? "Front" : "Back"}</span>
          <button
            type="button"
            className="recipe-card-side-nav__button"
            aria-label="Show back"
            disabled={previewSide === "back"}
            onClick={() => setPreviewSide("back")}
          >
            →
          </button>
        </div>
      )}
      <RecipeCardFace
        recipe={recipe}
        ingredients={frontIngredients}
        instructions={frontInstructions}
        side="front"
        showHeader
        layout={frontLayout}
        hasBackFace={hasBack}
        previewHidden={showSideNav && previewSide !== "front"}
        showImage={showImage}
      />
      {needsPrintBack &&
        (hasBack ? (
          <RecipeCardFace
            recipe={recipe}
            ingredients={backIngredients}
            instructions={backInstructions}
            side="back"
            showHeader={false}
            layout={backLayout}
            hasBackFace={hasBack}
            previewHidden={doubleSided && previewSide !== "back"}
          />
        ) : (
          <RecipeCardFace
            recipe={recipe}
            ingredients={[]}
            instructions={[]}
            side="back"
            showHeader={false}
            layout="standard"
            hasBackFace={false}
            blank
          />
        ))}
    </div>
  );
}
