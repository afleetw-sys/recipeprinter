import { fieldShown, fieldValue, type FieldSwitches } from "@/lib/recipeFields";
import { formatRecipeTime } from "@/lib/time";
import type { Recipe, AddableRecipeLine } from "@/types/recipe";

/**
 * What the page toolbar's "+" can add to this recipe, in the order it appears
 * on the card: the lines it has nothing in, and the fields (lib/recipeFields.tsx)
 * the current theme isn't showing, written or not. A recipe page draws no
 * empty line, not even as a prompt: the card on screen is laid out as it
 * prints, and a prompt taking room pushed a full card's last lines under its
 * footer. So "+" is where an empty or hidden one comes back from.
 */
export function emptyRecipeFields(
  recipe: Recipe,
  {
    cookbook,
    showSourceUrl,
    fieldSwitches,
  }: { cookbook: boolean; showSourceUrl: boolean; fieldSwitches: FieldSwitches | undefined },
): AddableRecipeLine[] {
  const offered = (field: "description" | "contributor" | "category" | "note") =>
    !fieldValue(recipe, field) || !fieldShown(fieldSwitches, field, cookbook);
  const empty: AddableRecipeLine[] = [];
  if (offered("description")) empty.push("description");
  if (!formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime)) empty.push("time");
  if (!(recipe.servings ?? recipe.yield)) empty.push("servings");
  if (offered("contributor")) empty.push("contributor");
  if (offered("category")) empty.push("category");
  // A cookbook recipe can be given a link by hand whatever the book-wide
  // setting says (it gets its own override on commit), so a missing link is
  // always an empty line there. Elsewhere the line only exists while the
  // setting is on.
  if ((cookbook || showSourceUrl) && !recipe.sourceUrl) empty.push("link");
  if (recipe.ingredients.length === 0) empty.push("ingredients");
  if (recipe.instructions.length === 0) empty.push("steps");
  if (offered("note")) empty.push("note");
  return empty;
}
