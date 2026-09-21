import { describe, expect, it } from "vitest";
import { applyRecipeTargetEdit } from "@/lib/useRecipeInlineEditor";
import { formatRecipeTime } from "@/lib/time";
import type { Recipe } from "@/types/recipe";

// What the card prints for a recipe's time (see renderCookbookFacts).
const shownTime = (recipe: Recipe) =>
  formatRecipeTime(recipe.totalTime || recipe.cookTime || recipe.prepTime);

const base: Recipe = { title: "Soup", ingredients: [], instructions: [] };

describe("clearing a recipe's cook time", () => {
  it("removes it when the import only had a prep time", () => {
    const imported = { ...base, prepTime: "15 min" };
    expect(shownTime(imported)).toBe("15 min");
    const cleared = applyRecipeTargetEdit(imported, { kind: "cookTime" }, "", true);
    expect(shownTime(cleared)).toBeNull();
  });

  it("removes it when the import had prep, cook and total times", () => {
    const imported = { ...base, prepTime: "15 min", cookTime: "30 min", totalTime: "45 min" };
    const cleared = applyRecipeTargetEdit(imported, { kind: "cookTime" }, "  ", true);
    expect(shownTime(cleared)).toBeNull();
  });

  it("still replaces the time when one is typed", () => {
    const imported = { ...base, prepTime: "15 min", totalTime: "45 min" };
    const edited = applyRecipeTargetEdit(imported, { kind: "cookTime" }, "1 hr", true);
    expect(shownTime(edited)).toBe("1 hr");
  });
});
