import { describe, expect, it } from "vitest";
import { withLiveRecipes } from "@/lib/liveSheetContent";
import type { Recipe } from "@/types/recipe";
import type { RecipeFace } from "@/lib/recipeCardLayout";

const before: Recipe = {
  title: "Old title",
  ingredients: [{ raw: "1 egg" }, { raw: "2 cups flour" }],
  instructions: [{ step: 1, text: "Mix." }, { step: 2, text: "Bake." }],
} as Recipe;

function face(recipe: Recipe, ing: number[], steps: number[]): RecipeFace {
  return {
    ingredients: ing.map((i) => recipe.ingredients[i]),
    instructions: steps.map((i) => recipe.instructions[i]),
    layout: "standard",
  };
}

function sheetWith(recipe: Recipe, front: RecipeFace) {
  return { slots: [{ kind: "recipe" as const, recipeId: "r1", recipe, front, back: null }] };
}

describe("withLiveRecipes", () => {
  it("returns the same sheets when nothing changed", () => {
    const sheets = [sheetWith(before, face(before, [0, 1], [0]))];
    expect(withLiveRecipes(sheets, new Map([["r1", before]]))).toBe(sheets);
  });

  it("brings the edited title and rows forward onto the old page breaks", () => {
    const after: Recipe = {
      ...before,
      title: "New title",
      instructions: [before.instructions[0], { step: 2, text: "Bake for 20 minutes." }],
    };
    const sheets = [sheetWith(before, face(before, [0, 1], [1]))];
    const [sheet] = withLiveRecipes(sheets, new Map([["r1", after]]));
    const slot = sheet.slots[0] as ReturnType<typeof sheetWith>["slots"][number];
    expect(slot.recipe.title).toBe("New title");
    expect(slot.front.instructions).toEqual([{ step: 2, text: "Bake for 20 minutes." }]);
    expect(slot.front.ingredients).toEqual(after.ingredients);
  });

  it("keeps the old rows when the row count moved, but still takes the new title", () => {
    const after: Recipe = { ...before, title: "New title", ingredients: [before.ingredients[0]] };
    const original = face(before, [0, 1], [0, 1]);
    const [sheet] = withLiveRecipes([sheetWith(before, original)], new Map([["r1", after]]));
    const slot = sheet.slots[0] as ReturnType<typeof sheetWith>["slots"][number];
    expect(slot.recipe.title).toBe("New title");
    expect(slot.front).toBe(original);
  });
});
