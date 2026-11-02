import { composeNote } from "@/lib/recipeNote";
import { formatRecipeTime } from "@/lib/time";
import type { Recipe, AddableRecipeLine } from "@/types/recipe";

/**
 * The lines this recipe has nothing in, in the order they appear on the card.
 * A recipe page draws no empty line, not even as a prompt: the card on screen
 * is laid out as it prints, and a prompt taking room pushed a full card's last
 * lines under its footer. So these are what the page toolbar's "+" menu
 * offers to add.
 */
export function emptyRecipeFields(
  recipe: Recipe,
  {
    cookbook,
    showSourceUrl,
    showDescription,
  }: { cookbook: boolean; showSourceUrl: boolean; showDescription: boolean },
): AddableRecipeLine[] {
  const empty: AddableRecipeLine[] = [];
  // A cookbook recipe can be given a link by hand whatever the book-wide
  // setting says (it gets its own override on commit), so a missing link is
  // always an empty line there. Elsewhere the line only exists while the
  // setting is on.
  if ((cookbook || showSourceUrl) && !recipe.sourceUrl) empty.push("link");
  if (!formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime)) empty.push("time");
  if (!(recipe.servings ?? recipe.yield)) empty.push("servings");
  // Ask what the note WOULD print, not whether the website blurb exists: a
  // recipe that arrived with a blurb and no note of its own prints nothing
  // once the website-description checkbox is off.
  if (cookbook && !composeNote(recipe.description, recipe.note, showDescription).trim()) {
    empty.push("note");
  }
  if (recipe.ingredients.length === 0) empty.push("ingredients");
  if (recipe.instructions.length === 0) empty.push("steps");
  return empty;
}
