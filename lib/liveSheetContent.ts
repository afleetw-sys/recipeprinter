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
type Row = Recipe["ingredients"][number] | Recipe["instructions"][number];
type ListName = "ingredients" | "instructions";

/** A row's content, without the step number: a split or a delete renumbers
    every step after it, and those steps have not changed. */
function rowKey(row: Row): string {
  const { step: _step, ...rest } = row as Row & { step?: number };
  return JSON.stringify(rest);
}

/**
 * Which face each row of the edited list belongs on, given the faces the
 * old list was measured into.
 *
 * The rows that did not change are matched from both ends of the list (a
 * split, a delete or a retype changes one run in the middle), so each keeps
 * the page it was on. Whatever changed in between goes on the page of the row
 * before it, or of the row after it at the very start. Null when a face holds
 * a row the old recipe does not, which leaves nothing to line up against.
 */
function assignRows(
  faces: RecipeFace[],
  list: ListName,
  before: Recipe,
  after: Recipe,
): Row[][] | null {
  const oldRows = before[list] as Row[];
  const newRows = after[list] as Row[];
  const ownerOfOld: number[] = new Array(oldRows.length).fill(-1);
  for (let f = 0; f < faces.length; f += 1) {
    for (const row of faces[f][list] as Row[]) {
      const at = oldRows.indexOf(row);
      if (at === -1) return null;
      ownerOfOld[at] = f;
    }
  }
  const oldKeys = oldRows.map(rowKey);
  const newKeys = newRows.map(rowKey);
  let prefix = 0;
  while (prefix < oldRows.length && prefix < newRows.length && oldKeys[prefix] === newKeys[prefix]) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldRows.length - prefix &&
    suffix < newRows.length - prefix &&
    oldKeys[oldRows.length - 1 - suffix] === newKeys[newRows.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const owners: number[] = newRows.map((_, j) => {
    if (j < prefix) return ownerOfOld[j];
    if (j >= newRows.length - suffix) return ownerOfOld[oldRows.length - (newRows.length - j)];
    return -1;
  });
  // The changed run: the face of the row before it, else the row after it,
  // else the first face that holds any of this list at all.
  const fallback = Math.max(0, ownerOfOld.find((owner) => owner >= 0) ?? 0);
  for (let j = 0; j < owners.length; j += 1) {
    if (owners[j] >= 0) continue;
    const previous = owners.slice(0, j).reverse().find((owner) => owner >= 0);
    const next = owners.slice(j + 1).find((owner) => owner >= 0);
    owners[j] = previous ?? next ?? fallback;
  }
  const grouped: Row[][] = faces.map(() => []);
  newRows.forEach((row, j) => grouped[owners[j]]?.push(row));
  return grouped;
}

/** Every face of one recipe on these sheets, in reading order, and where each
    one sits so it can be put back. */
type FacePlace = { sheet: number; slot: number; side: "front" | "back" };

/**
 * The sheets on screen, with the words you just typed.
 *
 * The deck keeps showing the last finished layout until an edited recipe has
 * been measured again (the double buffer in usePrintSheets), and that layout
 * holds the recipe from BEFORE the edit. Closing a field swapped it back to
 * that older text for as long as the measurement took, and only then to what
 * had been saved: the edit flashed away and came back.
 *
 * So the text is brought forward straight away, onto the page breaks the old
 * layout had (see `assignRows`), and the breaks themselves follow when the
 * measurement lands. That covers retyping a line, splitting one with Enter,
 * and deleting rows.
 *
 * Returns the same array when nothing on it is out of date, so an unchanged
 * book keeps its identity and nothing downstream recomputes.
 */
export function withLiveRecipes<S extends SheetLike>(
  sheets: S[],
  live: ReadonlyMap<string, Recipe>,
): S[] {
  const stale = new Map<string, { before: Recipe; after: Recipe; places: FacePlace[] }>();
  sheets.forEach((sheet, sheetIndex) =>
    sheet.slots.forEach((slot, slotIndex) => {
      if (!slot || slot.kind !== "recipe") return;
      const recipeSlot = slot as unknown as RecipeSlotLike;
      const after = live.get(recipeSlot.recipeId);
      if (!after || after === recipeSlot.recipe) return;
      const entry = stale.get(recipeSlot.recipeId) ?? { before: recipeSlot.recipe, after, places: [] };
      entry.places.push({ sheet: sheetIndex, slot: slotIndex, side: "front" });
      if (recipeSlot.back) entry.places.push({ sheet: sheetIndex, slot: slotIndex, side: "back" });
      stale.set(recipeSlot.recipeId, entry);
    }),
  );
  if (stale.size === 0) return sheets;

  // The new face for each place, keyed "sheet:slot:side".
  const newFaces = new Map<string, RecipeFace>();
  stale.forEach(({ before, after, places }) => {
    const faces = places.map((place) => {
      const slot = sheets[place.sheet].slots[place.slot] as unknown as RecipeSlotLike;
      return place.side === "front" ? slot.front : (slot.back as RecipeFace);
    });
    const ingredients = assignRows(faces, "ingredients", before, after);
    const instructions = assignRows(faces, "instructions", before, after);
    if (!ingredients || !instructions) return;
    places.forEach((place, f) => {
      newFaces.set(`${place.sheet}:${place.slot}:${place.side}`, {
        ...faces[f],
        ingredients: ingredients[f] as RecipeFace["ingredients"],
        instructions: instructions[f] as RecipeFace["instructions"],
      });
    });
  });

  return sheets.map((sheet, sheetIndex) => {
    if (!sheet.slots.some((slot) => slot?.kind === "recipe" && stale.has((slot as unknown as RecipeSlotLike).recipeId))) {
      return sheet;
    }
    const slots = sheet.slots.map((slot, slotIndex) => {
      if (!slot || slot.kind !== "recipe") return slot;
      const recipeSlot = slot as unknown as RecipeSlotLike;
      const entry = stale.get(recipeSlot.recipeId);
      if (!entry) return slot;
      const front = newFaces.get(`${sheetIndex}:${slotIndex}:front`) ?? recipeSlot.front;
      const back = recipeSlot.back
        ? newFaces.get(`${sheetIndex}:${slotIndex}:back`) ?? recipeSlot.back
        : null;
      return { ...recipeSlot, recipe: entry.after, front, back } as unknown as SlotLike;
    });
    return { ...sheet, slots };
  });
}
