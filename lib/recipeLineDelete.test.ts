import { describe, expect, it } from "vitest";
import { deleteRecipeLines } from "@/lib/useRecipeInlineEditor";
import type { Recipe } from "@/types/recipe";

function recipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    title: "Test",
    ingredients: [],
    instructions: [],
    ...overrides,
  } as Recipe;
}

const ing = (raw: string, section?: string) => (section === undefined ? { raw } : { raw, section });
const step = (index: number, text: string, section?: string) =>
  section === undefined ? { step: index, text } : { step: index, text, section };

describe("deleteRecipeLines", () => {
  it("removes every selected ingredient in one pass", () => {
    const next = deleteRecipeLines(
      recipe({ ingredients: [ing("flour"), ing("sugar"), ing("salt"), ing("butter")] }),
      [
        { kind: "ingredient", index: 1 },
        { kind: "ingredient", index: 2 },
      ],
    );
    expect(next.ingredients.map((item) => item.raw)).toEqual(["flour", "butter"]);
  });

  it("renumbers the steps that are left", () => {
    const next = deleteRecipeLines(
      recipe({
        instructions: [step(1, "Mix"), step(2, "Rest"), step(3, "Bake"), step(4, "Cool")],
      }),
      [
        { kind: "step", index: 0 },
        { kind: "step", index: 1 },
      ],
    );
    expect(next.instructions).toEqual([
      { step: 1, text: "Bake" },
      { step: 2, text: "Cool" },
    ]);
  });

  it("takes a heading and its rows together when the drag covered both", () => {
    const next = deleteRecipeLines(
      recipe({
        ingredients: [
          ing("flour"),
          ing("cream", "For the glaze"),
          ing("sugar", "For the glaze"),
          ing("salt"),
        ],
      }),
      [
        { kind: "ingredientSection", index: 1 },
        { kind: "ingredient", index: 1 },
        { kind: "ingredient", index: 2 },
      ],
    );
    expect(next.ingredients).toEqual([{ raw: "flour" }, { raw: "salt" }]);
  });

  it("clears only the label when the heading alone was selected", () => {
    const next = deleteRecipeLines(
      recipe({
        ingredients: [ing("flour"), ing("cream", "For the glaze"), ing("sugar", "For the glaze")],
      }),
      [{ kind: "ingredientSection", index: 1 }],
    );
    expect(next.ingredients).toEqual([{ raw: "flour" }, { raw: "cream" }, { raw: "sugar" }]);
  });

  it("folds the rows into the section above when the heading alone was selected", () => {
    const next = deleteRecipeLines(
      recipe({
        ingredients: [
          ing("almonds", "Almond paste"),
          ing("egg white", "Cookie glaze"),
          ing("icing sugar", "Cookie glaze"),
        ],
      }),
      [{ kind: "ingredientSection", index: 1 }],
    );
    expect(next.ingredients).toEqual([
      { raw: "almonds", section: "Almond paste" },
      { raw: "egg white", section: "Almond paste" },
      { raw: "icing sugar", section: "Almond paste" },
    ]);
  });

  it("does not rejoin a section the same drag is deleting", () => {
    const next = deleteRecipeLines(
      recipe({
        ingredients: [
          ing("almonds", "Almond paste"),
          ing("egg white", "Cookie glaze"),
          ing("icing sugar", "Cookie glaze"),
        ],
      }),
      [
        { kind: "ingredient", index: 0 },
        { kind: "ingredientSection", index: 1 },
      ],
    );
    expect(next.ingredients).toEqual([{ raw: "egg white" }, { raw: "icing sugar" }]);
  });

  it("leaves a later group that reuses the same title alone", () => {
    const next = deleteRecipeLines(
      recipe({
        ingredients: [
          ing("cream", "Glaze"),
          ing("flour"),
          ing("sugar", "Glaze"),
        ],
      }),
      [{ kind: "ingredientSection", index: 0 }],
    );
    expect(next.ingredients).toEqual([{ raw: "cream" }, { raw: "flour" }, { raw: "sugar", section: "Glaze" }]);
  });

  it("deletes across both halves of the card at once", () => {
    const next = deleteRecipeLines(
      recipe({
        ingredients: [ing("flour"), ing("sugar")],
        instructions: [step(1, "Mix"), step(2, "Bake")],
      }),
      [
        { kind: "ingredient", index: 0 },
        { kind: "step", index: 1 },
      ],
    );
    expect(next.ingredients).toEqual([{ raw: "sugar" }]);
    expect(next.instructions).toEqual([{ step: 1, text: "Mix" }]);
  });

  it("leaves the recipe untouched when nothing was selected", () => {
    const before = recipe({ ingredients: [ing("flour")], instructions: [step(1, "Mix")] });
    const next = deleteRecipeLines(before, []);
    expect(next.ingredients).toEqual([{ raw: "flour" }]);
    expect(next.instructions).toEqual([{ step: 1, text: "Mix" }]);
  });
});
