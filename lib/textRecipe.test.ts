import { describe, expect, it } from "vitest";
import { parseRecipeText } from "@/lib/textRecipe";

const raws = (recipe: { ingredients: { raw?: string }[] }) =>
  recipe.ingredients.map((ing) => ing.raw);
const steps = (recipe: { instructions: { text: string }[] }) =>
  recipe.instructions.map((ins) => ins.text);

describe("parseRecipeText", () => {
  it("reads the short paste the remote parser gives up on", () => {
    // The reported failure, verbatim — including the comma after the step
    // number, which is what a person types when they miss the period.
    const recipe = parseRecipeText("Banana Bread\n\n2 cups flour\n\n1, Bake it.");
    expect(recipe).not.toBeNull();
    expect(recipe!.title).toBe("Banana Bread");
    expect(raws(recipe!)).toEqual(["2 cups flour"]);
    expect(steps(recipe!)).toEqual(["Bake it."]);
    expect(recipe!.instructions[0].step).toBe(1);
  });

  it("accepts a single ingredient with no instructions", () => {
    const recipe = parseRecipeText("Simple Syrup\n1 cup sugar");
    expect(raws(recipe!)).toEqual(["1 cup sugar"]);
    expect(recipe!.instructions).toEqual([]);
  });

  it("accepts instructions with no ingredients", () => {
    const recipe = parseRecipeText("Toast\n1. Toast the bread.\n2. Butter it.");
    expect(recipe!.ingredients).toEqual([]);
    expect(steps(recipe!)).toEqual(["Toast the bread.", "Butter it."]);
  });

  it("follows explicit headings", () => {
    const recipe = parseRecipeText(
      [
        "Pancakes",
        "Ingredients",
        "1 cup flour",
        "Butter, for the pan",
        "Instructions",
        "Whisk the flour with the milk.",
        "Cook until golden.",
      ].join("\n"),
    );
    expect(recipe!.title).toBe("Pancakes");
    expect(raws(recipe!)).toEqual(["1 cup flour", "Butter, for the pan"]);
    expect(steps(recipe!)).toEqual([
      "Whisk the flour with the milk.",
      "Cook until golden.",
    ]);
  });

  it("reads decorated headings", () => {
    const recipe = parseRecipeText(
      ["Soup", "## INGREDIENTS:", "- 2 carrots", "**Directions**", "- Simmer."].join("\n"),
    );
    expect(raws(recipe!)).toEqual(["2 carrots"]);
    expect(steps(recipe!)).toEqual(["Simmer."]);
  });

  it("keeps an ingredient that reads like a sentence inside a declared list", () => {
    const recipe = parseRecipeText(
      ["Salad", "Ingredients", "Tomatoes, chopped and drained.", "Steps", "Toss."].join("\n"),
    );
    expect(raws(recipe!)).toEqual(["Tomatoes, chopped and drained."]);
    expect(steps(recipe!)).toEqual(["Toss."]);
  });

  it("does not mistake a numbered ingredient list for steps", () => {
    const recipe = parseRecipeText(
      ["Rub", "1. 2 tbsp paprika", "2. 1 tsp salt", "3. Mix them together."].join("\n"),
    );
    expect(raws(recipe!)).toEqual(["2 tbsp paprika", "1 tsp salt"]);
    expect(steps(recipe!)).toEqual(["Mix them together."]);
  });

  it("switches to steps without a heading", () => {
    const recipe = parseRecipeText(
      ["Eggs", "3 eggs", "1 tbsp butter", "Beat the eggs.", "Cook them slowly."].join("\n"),
    );
    expect(raws(recipe!)).toEqual(["3 eggs", "1 tbsp butter"]);
    expect(steps(recipe!)).toEqual(["Beat the eggs.", "Cook them slowly."]);
  });

  it("pulls servings and times out of the line flow", () => {
    const recipe = parseRecipeText(
      ["Stew", "Serves 6", "Prep time: 10 minutes", "Cook time: 2 hours", "2 lbs beef"].join("\n"),
    );
    expect(recipe!.servings).toBe("6");
    expect(recipe!.prepTime).toBe("10 minutes");
    expect(recipe!.cookTime).toBe("2 hours");
    expect(raws(recipe!)).toEqual(["2 lbs beef"]);
  });

  it("keeps notes out of the recipe body", () => {
    const recipe = parseRecipeText(
      ["Bread", "500 g flour", "Notes", "Keeps for three days."].join("\n"),
    );
    expect(raws(recipe!)).toEqual(["500 g flour"]);
    expect(recipe!.note).toBe("Keeps for three days.");
  });

  it("keeps the group labels a two-part recipe is pasted with", () => {
    const recipe = parseRecipeText(
      [
        "Chicken and Rice",
        "Ingredients",
        "For the chicken:",
        "2 lbs thighs",
        "For the rice",
        "1 cup basmati",
        "Instructions",
        "Sear the thighs.",
      ].join("\n"),
    );
    expect(recipe!.ingredients).toEqual([
      { raw: "2 lbs thighs", section: "For the chicken" },
      { raw: "1 cup basmati", section: "For the rice" },
    ]);
    // The heading resets the group, so a step is not filed under "For the rice".
    expect(recipe!.instructions[0].section).toBeUndefined();
  });

  it("does not mistake a measured line for a group label", () => {
    const recipe = parseRecipeText("Brine\nIngredients\n1 cup salt: kosher\n2 qt water");
    expect(raws(recipe!)).toEqual(["1 cup salt: kosher", "2 qt water"]);
    expect(recipe!.ingredients[0].section).toBeUndefined();
  });

  it("returns null for text with no recipe in it", () => {
    expect(parseRecipeText("")).toBeNull();
    expect(parseRecipeText("Hey, are you free on Thursday?")).toBeNull();
    expect(
      parseRecipeText("Hey there\nAre you free on Thursday?\nLet me know."),
    ).toBeNull();
    expect(parseRecipeText("https://example.com/recipes/banana-bread")).toBeNull();
  });

  it("titles a recipe that opens straight into ingredients", () => {
    const recipe = parseRecipeText("2 cups flour\n1 tsp salt");
    expect(recipe!.title).toBe("Untitled recipe");
    expect(raws(recipe!)).toEqual(["2 cups flour", "1 tsp salt"]);
  });
});
