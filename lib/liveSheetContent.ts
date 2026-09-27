import type { Recipe } from "@/types/recipe";
import type { RecipeFace } from "@/lib/recipeCardLayout";

/** The part of a sheet this reads: its recipe slots. Generic so it takes the
    real `PageSheet` without importing the hook module that defines it. */
type SlotLike = { kind: string } | null;
type RecipeSlotLike = {
  kind: "recipe";
  recipeId: string;
  recipe: Recipe;
  front: RecipeFace;
  back: RecipeFace | null;
};
type SheetLike = { slots: SlotLike[] };

/**
 * Carries each line of a face over to the same line of the edited recipe.
 *
 * A face holds the recipe's own row objects, split across pages. When the
 * rows are still the same in number, each keeps its position and only its
 * words change, so the page breaks the face was measured with still hold the
 * same rows. Null when the count moved (a split, a deleted line) or a row is
 * not found: then there is no telling which rows now sit on which page.
 */
function remapFace(face: RecipeFace, before: Recipe, after: Recipe): RecipeFace | null {
  if (
    before.ingredients.length !== after.ingredients.length ||
    before.instructions.length !== after.instructions.length
  ) {
    return null;
  }
  const ingredients = face.ingredients.map((row) => after.ingredients[before.ingredients.indexOf(row)]);
  const instructions = face.instructions.map((row) => after.instructions[before.instructions.indexOf(row)]);
  if (ingredients.some((row) => !row) || instructions.some((row) => !row)) return null;
  return { ...face, ingredients, instructions };
}

/**
 * The sheets on screen, with the words you just typed.
 *
 * The deck keeps showing the last finished layout until an edited recipe has
 * been measured again (the double buffer in usePrintSheets), and that layout
 * holds the recipe from BEFORE the edit. Closing a field swapped it back to
 * that older text for as long as the measurement took, and only then to what
 * had been saved: the edit flashed away and came back.
 *
 * So the text is brought forward straight away and the page breaks follow
 * when the measurement lands. The title, times and note always come across;
 * the rows come across when they still line up one to one (see `remapFace`),
 * which is every edit that only changes words. An edit that adds or removes a
 * row keeps the older rows for that beat, as before.
 *
 * Returns the same array when nothing on it is out of date, so an unchanged
 * book keeps its identity and nothing downstream recomputes.
 */
export function withLiveRecipes<S extends SheetLike>(
  sheets: S[],
  live: ReadonlyMap<string, Recipe>,
): S[] {
  let changed = false;
  const next = sheets.map((sheet) => {
    let sheetChanged = false;
    const slots = sheet.slots.map((slot) => {
      if (!slot || slot.kind !== "recipe") return slot;
      const recipeSlot = slot as unknown as RecipeSlotLike;
      const current = live.get(recipeSlot.recipeId);
      if (!current || current === recipeSlot.recipe) return slot;
      sheetChanged = true;
      const front = remapFace(recipeSlot.front, recipeSlot.recipe, current);
      const back = recipeSlot.back ? remapFace(recipeSlot.back, recipeSlot.recipe, current) : null;
      const rowsLineUp = front !== null && (recipeSlot.back === null || back !== null);
      return {
        ...recipeSlot,
        recipe: current,
        ...(rowsLineUp ? { front, back } : {}),
      } as unknown as SlotLike;
    });
    if (!sheetChanged) return sheet;
    changed = true;
    return { ...sheet, slots };
  });
  return changed ? next : sheets;
}
