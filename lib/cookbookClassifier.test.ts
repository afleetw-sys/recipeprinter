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

  it("does not send a savory pie or cake to Desserts on the word alone", () => {
    expect(classifyRecipe(recipe("Spinach Pie")).category).toBe("Main Dishes");
    expect(classifyRecipe(recipe("Crab Cake")).category).toBe("Main Dishes");
    expect(classifyRecipe(recipe("Shepherd's Pie")).category).toBe("Main Dishes");
    // A real dessert pie still counts — nothing savory contradicts it.
    expect(classifyRecipe(recipe("Apple Pie")).category).toBe("Desserts");
  });

  it("recognizes mac and cheese as a main dish instead of falling to the catch-all", () => {
    expect(classifyRecipe(recipe("Mac and Cheese")).category).toBe("Main Dishes");
    expect(classifyRecipe(recipe("Mac n Cheese")).category).toBe("Main Dishes");
    expect(classifyRecipe(recipe("Baked Macaroni")).category).toBe("Main Dishes");
  });
});
