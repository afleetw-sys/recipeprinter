import { describe, expect, it } from "vitest";
import { slimIngredients } from "./printProjects";
import { ingredientText } from "./recipeCardLayout";
import type { PrintProject, RecipeIngredient } from "@/types/recipe";

const project = (ingredients: RecipeIngredient[]): PrintProject =>
  ({
    id: "p", sections: [{ id: "s", items: [{
      id: "i", method: "url", source: "x", status: "ready", title: "R", addedAt: 0,
      recipe: { title: "R", ingredients, instructions: [] },
    }] }],
    settings: {} as PrintProject["settings"],
    createdAt: 0, updatedAt: 0,
  }) as unknown as PrintProject;

const saved = (ingredients: RecipeIngredient[]) =>
  slimIngredients(project(ingredients)).sections[0].items[0].recipe!.ingredients;

describe("slimIngredients", () => {
  it("drops the parsed parts when the whole line is already there", () => {
    expect(saved([{ raw: "2 cups flour", amount: "2", unit: "cups", name: "flour" }])).toEqual([
      { raw: "2 cups flour", section: undefined },
    ]);
  });

  it("prints exactly the same line afterwards", () => {
    const before: RecipeIngredient = { raw: "2 cups flour", amount: "2", unit: "cups", name: "flour" };
    expect(ingredientText(saved([before])[0])).toBe(ingredientText(before));
  });

  it("keeps the parts when there is no whole line to fall back on", () => {
    const parsed: RecipeIngredient = { amount: "2", unit: "cups", name: "flour" };
    expect(saved([parsed])).toEqual([parsed]);
    expect(ingredientText(saved([parsed])[0])).toBe("2 cups flour");
  });

  it("treats a blank raw as no line at all", () => {
    const blank: RecipeIngredient = { raw: "   ", name: "flour" };
    expect(saved([blank])).toEqual([blank]);
  });

  it("keeps `section`, which is grouping and not a duplicate", () => {
    expect(saved([{ raw: "2 cups flour", name: "flour", section: "For the cake" }])[0].section).toBe(
      "For the cake",
    );
  });

  it("leaves an already-slim ingredient object identical", () => {
    const slim: RecipeIngredient = { raw: "2 cups flour" };
    expect(saved([slim])[0]).toBe(slim);
  });

  it("leaves a recipe with no ingredients alone", () => {
    expect(slimIngredients(project([])).sections[0].items[0].recipe!.ingredients).toEqual([]);
  });
});
