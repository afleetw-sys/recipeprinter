import { composeNote } from "@/lib/recipeNote";
import { removedHeadingsName } from "@/lib/recipeHeadings";
import { formatRecipeTime } from "@/lib/time";
import type { Recipe } from "@/types/recipe";

/**
 * The names of the fields a recipe page has not filled in, in the order they
 * appear on it. The page toolbar's reveal button says them out loud ("Add
 * link, time, servings") and shows them when pressed; no names, no button.
 */
export function missingRecipeFields(
  recipe: Recipe,
  {
    cookbook,
    showSourceUrl,
    showDescription,
  }: { cookbook: boolean; showSourceUrl: boolean; showDescription: boolean },
): string[] {
  const missing: string[] = [];
  // A cookbook recipe can be given a link by hand whatever the book-wide
  // setting says (it gets its own override on commit), so a missing link is
  // always a hidden field there. Elsewhere the field only exists while the
  // setting is on, so a missing link is only a hidden FIELD when that field
  // would show.
  if ((cookbook || showSourceUrl) && !recipe.sourceUrl) missing.push("link");
  if (!formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime)) missing.push("time");
  if (!(recipe.servings ?? recipe.yield)) missing.push("servings");
  // Ask what the note WOULD print, not whether the website blurb
  // exists. The card shows `composeNote(description, note,
  // showDescription)`, so a recipe that arrived with a blurb and no
  // note of its own prints nothing once the website-description
  // checkbox is off — an empty line with no way to reach it, because
  // this test read the stored blurb and concluded the field was
  // filled. Reading the composed line also stops the opposite: a cook's
  // own note with no blurb behind it printed fine and still offered to
  // reveal a field that was never missing.
  if (cookbook && !composeNote(recipe.description, recipe.note, showDescription).trim()) {
    missing.push("note");
  }
  // A removed "Ingredients" / "Steps" heading, so it can be brought back.
  const headings = removedHeadingsName(recipe);
  if (headings) missing.push(headings);
  if (recipe.ingredients.length === 0) missing.push("ingredients");
  if (recipe.instructions.length === 0) missing.push("steps");
  return missing;
}
