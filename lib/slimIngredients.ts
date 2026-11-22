import type { Recipe } from "@/types/recipe";

/**
 * A recipe's ingredients without the parsed breakdown of any line that already
 * carries the whole line (`raw`). See `slimIngredients` in lib/printProjects.ts,
 * which applies this to every recipe a save writes; it lives here, on its own,
 * so linked recipes (lib/linkedRecipes.ts) can compare recipes the way they are
 * stored. A copy read back from the account is slimmed; one still in the page
 * is not, and those are the same recipe, not an edit.
 */
export function slimRecipe(recipe: Recipe): Recipe {
  if (!recipe.ingredients?.length) return recipe;
  let changed = false;
  const ingredients = recipe.ingredients.map((ingredient) => {
    if (!ingredient.raw?.trim()) return ingredient;
    if (
      ingredient.amount === undefined &&
      ingredient.unit === undefined &&
      ingredient.name === undefined &&
      ingredient.note === undefined
    ) {
      return ingredient;
    }
    changed = true;
    return { raw: ingredient.raw, section: ingredient.section };
  });
  return changed ? { ...recipe, ingredients } : recipe;
}
