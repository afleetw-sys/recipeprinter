import { describe, expect, it } from "vitest";
import { withLiveRecipes } from "@/lib/liveSheetContent";
import type { Recipe } from "@/types/recipe";
import type { RecipeFace } from "@/lib/recipeCardLayout";

const before: Recipe = {
  title: "Old title",
  ingredients: [{ raw: "1 egg" }, { raw: "2 cups flour" }, { raw: "1 cup milk" }],
  instructions: [
    { step: 1, text: "Mix." },
    { step: 2, text: "Rest." },
    { step: 3, text: "Bake." },
  ],
};

function face(recipe: Recipe, ing: number[], steps: number[]): RecipeFace {
  return {
    ingredients: ing.map((i) => recipe.ingredients[i]),
    instructions: steps.map((i) => recipe.instructions[i]),
    layout: "standard",
  };
}

type Slot = { kind: "recipe"; recipeId: string; recipe: Recipe; front: RecipeFace; back: RecipeFace | null };
const sheetWith = (recipe: Recipe, front: RecipeFace) => ({
  slots: [{ kind: "recipe" as const, recipeId: "r1", recipe, front, back: null } as Slot],
});
const slotOf = (sheet: { slots: Slot[] }) => sheet.slots[0];
const texts = (face: RecipeFace) => face.instructions.map((step) => step.text);

describe("withLiveRecipes", () => {
  it("returns the same sheets when nothing changed", () => {
    const sheets = [sheetWith(before, face(before, [0, 1, 2], [0, 1, 2]))];
    expect(withLiveRecipes(sheets, new Map([["r1", before]]))).toBe(sheets);
  });

  it("brings a retyped row and the title forward onto the old page breaks", () => {
    const after: Recipe = {
      ...before,
      title: "New title",
      instructions: [before.instructions[0], { step: 2, text: "Rest 10 minutes." }, before.instructions[2]],
    };
    const sheets = [
      sheetWith(before, face(before, [0, 1, 2], [0, 1])),
      sheetWith(before, face(before, [], [2])),
    ];
    const [first, second] = withLiveRecipes(sheets, new Map([["r1", after]]));
    expect(slotOf(first).recipe.title).toBe("New title");
    expect(texts(slotOf(first).front)).toEqual(["Mix.", "Rest 10 minutes."]);
    expect(texts(slotOf(second).front)).toEqual(["Bake."]);
  });

  it("keeps a split line and its new half on the page it was on, though every step renumbers", () => {
    const after: Recipe = {
      ...before,
      instructions: [
        { step: 1, text: "Mix." },
        { step: 2, text: "Rest," },
        { step: 3, text: "then fold." },
        { step: 4, text: "Bake." },
      ],
    };
    const sheets = [
      sheetWith(before, face(before, [0, 1, 2], [0, 1])),
      sheetWith(before, face(before, [], [2])),
    ];
    const [first, second] = withLiveRecipes(sheets, new Map([["r1", after]]));
    expect(texts(slotOf(first).front)).toEqual(["Mix.", "Rest,", "then fold."]);
    expect(texts(slotOf(second).front)).toEqual(["Bake."]);
  });

  it("drops deleted rows from the page that held them", () => {
    const after: Recipe = {
      ...before,
      ingredients: [before.ingredients[0], before.ingredients[2]],
      instructions: [{ step: 1, text: "Mix." }, { step: 2, text: "Bake." }],
    };
    const sheets = [
      sheetWith(before, face(before, [0, 1, 2], [0, 1])),
      sheetWith(before, face(before, [], [2])),
    ];
    const [first, second] = withLiveRecipes(sheets, new Map([["r1", after]]));
    expect(slotOf(first).front.ingredients).toEqual(after.ingredients);
    expect(texts(slotOf(first).front)).toEqual(["Mix."]);
    expect(texts(slotOf(second).front)).toEqual(["Bake."]);
  });

  it("puts a row added at the very start on the first page", () => {
    const after: Recipe = { ...before, ingredients: [{ raw: "Pinch of salt" }, ...before.ingredients] };
    const [sheet] = withLiveRecipes([sheetWith(before, face(before, [0, 1, 2], [0]))], new Map([["r1", after]]));
    expect(slotOf(sheet).front.ingredients).toEqual(after.ingredients);
  });
});
