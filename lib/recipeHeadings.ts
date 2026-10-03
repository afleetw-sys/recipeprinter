import type { Recipe } from "@/types/recipe";

/**
 * The two section headings on a recipe card, "Ingredients" and "Steps".
 *
 * A cook can rename either on one recipe, or remove it. People print more than
 * recipes (lesson notes, packing lists), and "Ingredients" over a list of
 * history topics reads as a mistake; some recipes want "Method" or "For the
 * dough", and a short card can do without a heading at all.
 *
 * Stored on the recipe as three states, the way a chapter's description is:
 * - absent: the default heading, so every recipe saved before this existed
 *   reads exactly as it did;
 * - `""`: removed, and listed by the toolbar's reveal button so it can be
 *   brought back;
 * - anything else: the cook's own heading.
 */
export type RecipeHeadingKind = "ingredientsHeading" | "stepsHeading";

export const DEFAULT_RECIPE_HEADINGS: Record<RecipeHeadingKind, string> = {
  ingredientsHeading: "Ingredients",
  stepsHeading: "Steps",
};

/** What the card prints for this heading. `""` means it is removed. */
export function recipeHeading(recipe: Recipe, kind: RecipeHeadingKind): string {
  return recipe[kind] ?? DEFAULT_RECIPE_HEADINGS[kind];
}

/**
 * What to store for a heading the cook has just typed.
 *
 * The default typed back in (in any case, since the card prints headings in
 * capitals and the cook may type what they see) is stored as absent rather
 * than as a copy, so the recipe follows the default again.
 */
export function storedRecipeHeading(kind: RecipeHeadingKind, typed: string): string | undefined {
  const trimmed = typed.trim();
  if (trimmed.toLowerCase() === DEFAULT_RECIPE_HEADINGS[kind].toLowerCase()) return undefined;
  return trimmed;
}

/** The value a removed heading's field opens with when it is brought back. */
export function revealedHeadingValue(recipe: Recipe, kind: RecipeHeadingKind): string {
  return recipe[kind] === "" ? DEFAULT_RECIPE_HEADINGS[kind] : recipeHeading(recipe, kind);
}

/**
 * The headings this recipe has removed, for the reveal button: "heading" for
 * one, "headings" for both. Only a heading over a section the card actually
 * has counts; there is nothing to bring back over a list that is not there.
 */
export function removedHeadingsName(recipe: Recipe): string | null {
  const removed = [
    recipe.ingredients.length > 0 && recipe.ingredientsHeading === "",
    recipe.instructions.length > 0 && recipe.stepsHeading === "",
  ].filter(Boolean).length;
  if (removed === 0) return null;
  return removed === 1 ? "heading" : "headings";
}
