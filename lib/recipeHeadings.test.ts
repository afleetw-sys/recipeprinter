import { describe, expect, it } from "vitest";
import { applyRecipeTargetEdit } from "@/lib/useRecipeInlineEditor";
import { printableRecipe } from "@/lib/queue";
import { missingRecipeFields } from "@/lib/recipeMissingFields";
import { recipeHeading, type RecipeHeadingKind } from "@/lib/recipeHeadings";
import type { Recipe } from "@/types/recipe";

const recipe: Recipe = {
  title: "Soup",
  servings: 4,
  cookTime: "30 min",
  ingredients: [{ raw: "1 onion" }],
  instructions: [{ step: 1, text: "Cook it." }],
};

const kinds: RecipeHeadingKind[] = ["ingredientsHeading", "stepsHeading"];
const neighbour = (kind: RecipeHeadingKind): RecipeHeadingKind =>
  kind === "ingredientsHeading" ? "stepsHeading" : "ingredientsHeading";
const edit = (r: Recipe, kind: RecipeHeadingKind, value: string) =>
  applyRecipeTargetEdit(r, { kind }, value, true);
const missing = (r: Recipe) =>
  missingRecipeFields(r, { cookbook: false, showSourceUrl: false, showDescription: true });

describe.each(kinds)("the %s", (kind) => {
  it("prints the default until the cook types something else", () => {
    expect(recipeHeading(recipe, kind)).not.toBe("");
    const renamed = edit(recipe, kind, "  For the dough ");
    expect(recipeHeading(renamed, kind)).toBe("For the dough");
  });

  it("is removed by emptying it, and leaves the other heading alone", () => {
    const renamedNeighbour = edit(recipe, neighbour(kind), "Method");
    const removed = edit(renamedNeighbour, kind, "   ");
    expect(recipeHeading(removed, kind)).toBe("");
    expect(recipeHeading(removed, neighbour(kind))).toBe("Method");
  });

  it("follows the default again when the default is typed back, in any case", () => {
    const renamed = edit(recipe, kind, "Method");
    const back = edit(renamed, kind, recipeHeading(recipe, kind).toUpperCase());
    expect(back[kind]).toBeUndefined();
    expect(recipeHeading(back, kind)).toBe(recipeHeading(recipe, kind));
  });

  it("survives being saved", () => {
    expect(printableRecipe(edit(recipe, kind, "Method"))[kind]).toBe("Method");
    expect(printableRecipe(edit(recipe, kind, ""))[kind]).toBe("");
  });

  it("is offered by the reveal button once removed, and not before", () => {
    expect(missing(recipe)).toEqual([]);
    expect(missing(edit(recipe, kind, "Method"))).toEqual([]);
    expect(missing(edit(recipe, kind, ""))).toEqual(["heading"]);
  });
});

describe("the reveal button's name for removed headings", () => {
  it("is plural when both are removed", () => {
    const both = edit(edit(recipe, "ingredientsHeading", ""), "stepsHeading", "");
    expect(missing(both)).toEqual(["headings"]);
  });

  it("ignores a removed heading over a list the recipe does not have", () => {
    const noSteps = { ...edit(recipe, "stepsHeading", ""), instructions: [] };
    expect(missing(noSteps)).not.toContain("heading");
  });

  it("names it in page order, before the lists", () => {
    const blank = edit({ ...recipe, servings: undefined, cookTime: undefined, instructions: [] }, "ingredientsHeading", "");
    expect(missing(blank)).toEqual(["time", "servings", "heading", "steps"]);
  });
});
