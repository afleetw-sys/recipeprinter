import { describe, expect, it } from "vitest";
import {
  addableRecipeLines,
  FIELD_SWITCH_IDS,
  RECIPE_LINE_ORDER,
  type FieldSwitches,
  type RecipeLineId,
} from "@/lib/recipeFields";

// A line switched off in "Show on recipes" is one the cook decided the book
// doesn't print, so the "+" list stops offering it (Amelia, 2026-11-21): it
// went on listing every line, switched off or not. Every switch, on cards and
// in a cookbook, the book's photo and link settings too; title, ingredients
// and steps are locked on and always offered.
describe("the + list leaves out lines switched off in Show on recipes", () => {
  const allOn: FieldSwitches = Object.fromEntries(FIELD_SWITCH_IDS.map((id) => [id, true]));
  const book = { photos: true, link: true };

  for (const cookbook of [false, true]) {
    const where = cookbook ? "cookbook" : "cards";

    it(`offers every line while everything is on (${where})`, () => {
      expect(addableRecipeLines(allOn, cookbook, book)).toEqual(RECIPE_LINE_ORDER);
    });

    for (const id of FIELD_SWITCH_IDS) {
      it(`drops ${id} switched off, and only it (${where})`, () => {
        const lines = addableRecipeLines({ ...allOn, [id]: false }, cookbook, book);
        expect(lines).not.toContain(id as RecipeLineId);
        expect(lines).toEqual(RECIPE_LINE_ORDER.filter((line) => line !== id));
      });
    }

    it(`drops Photo and Link when the book has them off (${where})`, () => {
      expect(addableRecipeLines(allOn, cookbook, { photos: false, link: true })).not.toContain("photo");
      expect(addableRecipeLines(allOn, cookbook, { photos: true, link: false })).not.toContain("link");
    });

    it(`always offers ingredients and steps (${where})`, () => {
      const allOff: FieldSwitches = Object.fromEntries(FIELD_SWITCH_IDS.map((id) => [id, false]));
      expect(addableRecipeLines(allOff, cookbook, { photos: false, link: false })).toEqual(["ingredients", "steps"]);
    });
  }
});
