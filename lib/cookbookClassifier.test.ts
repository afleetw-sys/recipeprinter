import { describe, expect, it } from "vitest";
import { classifyRecipe } from "@/lib/cookbookClassifier";
import type { Recipe } from "@/types/recipe";

function recipe(title: string, extras: Partial<Recipe> = {}): Recipe {
  return { title, ingredients: [], instructions: [], ...extras };
}

describe("cookbook classifier", () => {
  it.each([
    ["Chocolate chip cookies", "Desserts"],
    ["Chicken parmesan", "Main Dishes"],
    ["Bruschetta", "Appetizers"],
    ["Pancakes", "Breakfast"],
  ])("classifies %s as %s", (title, category) => {
    expect(classifyRecipe(recipe(title)).category).toBe(category);
  });

  it("uses existing course and tags as strong signals", () => {
    expect(classifyRecipe(recipe("Summer favorite", { course: "drink", tags: ["cocktail"] })).category).toBe("Drinks");
  });

  it("keeps weak or ambiguous matches uncategorized", () => {
    expect(classifyRecipe(recipe("Grandma's favorite", {
      ingredients: [{ name: "chocolate" }, { name: "chicken" }],
    })).category).toBe("Uncategorized");
  });
});
