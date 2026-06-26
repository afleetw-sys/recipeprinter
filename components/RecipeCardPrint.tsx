"use client";

import { useState } from "react";
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

export type RecipePrintTemplate = "classic" | "editorial" | "market" | "minimal";

export const RECIPE_PRINT_TEMPLATE_OPTIONS: Array<{
  id: RecipePrintTemplate;
  label: string;
  detail: string;
}> = [
  { id: "classic", label: "Classic", detail: "Bright blue, clean cookbook card" },
  { id: "editorial", label: "Editorial", detail: "Warm serif, magazine-style layout" },
  { id: "market", label: "Market", detail: "Fresh green, recipe box energy" },
  { id: "minimal", label: "Minimal", detail: "Sharp black and white kitchen note" },
];

const FRONT_SECTION_BUDGET: Record<
  PrintCardSize,
  { ingredients: number; instructions: number }
> = {
  letter: { ingredients: 2200, instructions: 3400 },
  "card-6x4": { ingredients: 980, instructions: 1250 },
};

const BACK_SECTION_BUDGET: Record<
  PrintCardSize,
  { ingredients: number; instructions: number }
> = {
  letter: { ingredients: 2500, instructions: 3800 },
  "card-6x4": { ingredients: 1080, instructions: 1450 },
};

function sourceLabel(recipe: Recipe): string | null {
  if (recipe.sourceName) return recipe.sourceName;
  if (recipe.sourceUrl) {
    try {
      return new URL(recipe.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return recipe.sourceUrl;
    }
  }
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

function splitByBudget<T>(items: T[], budget: number, label: (item: T) => string) {
  if (!Number.isFinite(budget)) return { front: items, back: [] };

  const front: T[] = [];
  const back: T[] = [];
  let used = 0;

  for (const item of items) {
    const cost = textCost(label(item));
    if (front.length > 0 && used + cost > budget) {
      back.push(item);
    } else {
      front.push(item);
      used += cost;
    }
  }

  return { front, back };
}

function splitRecipe(recipe: Recipe, size: PrintCardSize) {
  const frontBudget = FRONT_SECTION_BUDGET[size];
  const ingredients = splitByBudget(
    recipe.ingredients,
    frontBudget.ingredients,
    ingredientText,
  );
  const instructions = splitByBudget(
    recipe.instructions,
    frontBudget.instructions,
    (step) => step.text,
  );

  if (ingredients.back.length === 0 && instructions.back.length === 0) {
    return {
      frontIngredients: ingredients.front,
      frontInstructions: instructions.front,
      backIngredients: [] as Recipe["ingredients"],
      backInstructions: [] as Recipe["instructions"],
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
  };
}

function RecipeCardFace({
  recipe,
  ingredients,
  instructions,
  side,
  showHeader,
  previewHidden = false,
  blank = false,
}: {
  recipe: Recipe;
  ingredients: Recipe["ingredients"];
  instructions: Recipe["instructions"];
  side: "front" | "back";
  showHeader: boolean;
  previewHidden?: boolean;
  blank?: boolean;
}) {
  const source = sourceLabel(recipe);
  const meta = metaBits(recipe);

  if (blank) {
    return (
      <article
        aria-hidden
        className="recipe-card recipe-card--back recipe-card--blank"
        data-preview-hidden="true"
      />
    );
  }

  return (
    <article
      className={`recipe-card recipe-card--${side}`}
      data-preview-hidden={previewHidden ? "true" : undefined}
    >
      <div className="recipe-card__accent" aria-hidden />

      {showHeader ? (
        <header className="recipe-card__header">
          <h1 className="recipe-card__title">{recipe.title}</h1>
          {(meta.length > 0 || source) && (
            <p className="recipe-card__meta">
              {meta.join("  ·  ")}
              {meta.length > 0 && source ? "  ·  " : ""}
              {source && <span className="recipe-card__source">{source}</span>}
            </p>
          )}
        </header>
      ) : (
        <header className="recipe-card__header recipe-card__header--continued">
          <p className="recipe-card__continued">Continued</p>
          <h1 className="recipe-card__title recipe-card__title--continued">{recipe.title}</h1>
        </header>
      )}

      <div
        className={`recipe-card__cols ${
          ingredients.length === 0 ? "recipe-card__cols--single" : ""
        }`}
      >
        {ingredients.length > 0 && (
          <section className="recipe-card__ingredients">
            <h2 className="recipe-card__label">
              Ingredients{side === "back" ? " continued" : ""}
            </h2>
            <ul>
              {ingredients.map((ing, i) => (
                <li key={i}>{ingredientText(ing)}</li>
              ))}
            </ul>
          </section>
        )}

        {instructions.length > 0 && (
          <section className="recipe-card__method">
            <h2 className="recipe-card__label">
              Method{side === "back" ? " continued" : ""}
            </h2>
            <ol
              style={{
                counterReset: `rc-step ${Math.max(0, (instructions[0]?.step ?? 1) - 1)}`,
              }}
            >
              {instructions.map((step) => (
                <li key={step.step}>{step.text}</li>
              ))}
            </ol>
          </section>
        )}
      </div>

      <footer className="recipe-card__footer">
        <span>Printed with RecipePrinter</span>
        {recipe.sourceUrl && <span className="recipe-card__footer-src">{recipe.sourceUrl}</span>}
      </footer>
    </article>
  );
}

export default function RecipeCardPrint({
  recipe,
  size,
  template,
  doubleSided,
}: {
  recipe: Recipe;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  doubleSided: boolean;
}) {
  const [previewSide, setPreviewSide] = useState<"front" | "back">("front");
  const { frontIngredients, frontInstructions, backIngredients, backInstructions } = splitRecipe(
    recipe,
    size,
  );
  const hasBack = backIngredients.length > 0 || backInstructions.length > 0;
  const needsPrintBack = hasBack || doubleSided;

  return (
    <div className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}>
      {hasBack && (
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
        previewHidden={hasBack && previewSide !== "front"}
      />
      {needsPrintBack &&
        (hasBack ? (
          <RecipeCardFace
            recipe={recipe}
            ingredients={backIngredients}
            instructions={backInstructions}
            side="back"
            showHeader={false}
            previewHidden={previewSide !== "back"}
          />
        ) : (
          <RecipeCardFace
            recipe={recipe}
            ingredients={[]}
            instructions={[]}
            side="back"
            showHeader={false}
            blank
          />
        ))}
    </div>
  );
}
