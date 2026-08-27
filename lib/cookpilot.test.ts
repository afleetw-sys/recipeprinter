import { describe, expect, it } from "vitest";
import { adaptCookPilotRecipe, adaptCookPilotRecipes } from "@/lib/cookpilot";

// A minimal CookPilot RecipeData (section-based) with one ingredient and one step.
function recipeData(title: string) {
  return {
    title,
    ingredientSections: [{ title: null, ingredients: [{ name: "beets", amount: "2", unit: null }] }],
    instructionSections: [{ title: null, instructions: [{ text: "Simmer the beets." }] }],
  };
}

describe("adaptCookPilotRecipes", () => {
  it("maps a { recipes: [...] } roundup response to a flattened Recipe array in order", () => {
    const body = { recipes: [recipeData("Borscht One"), recipeData("Borscht Two"), recipeData("Borscht Three")] };
    const recipes = adaptCookPilotRecipes(body, "https://example.com/borscht");
    expect(recipes.map((r) => r.title)).toEqual(["Borscht One", "Borscht Two", "Borscht Three"]);
    expect(recipes[0].ingredients.map((i) => i.name)).toEqual(["beets"]);
    expect(recipes[0].instructions.map((i) => i.text)).toEqual(["Simmer the beets."]);
    // sourceUrl/sourceName flow through the single-recipe adapter.
    expect(recipes[0].sourceUrl).toBe("https://example.com/borscht");
  });

  it("drops invalid entries without sinking the batch", () => {
    const body = {
      recipes: [
        recipeData("Good"),
        { title: "", ingredientSections: [], instructionSections: [] }, // no title/ingredients/steps → null
      ],
    };
    expect(adaptCookPilotRecipes(body).map((r) => r.title)).toEqual(["Good"]);
  });

  it("wraps a single-recipe { recipe } envelope as a one-element array", () => {
    const single = adaptCookPilotRecipes({ recipe: recipeData("Solo") });
    expect(single).toHaveLength(1);
    expect(single[0].title).toBe("Solo");
    // Parity with the single-recipe adapter it delegates to.
    expect(single[0].title).toBe(adaptCookPilotRecipe({ recipe: recipeData("Solo") })?.title);
  });

  it("returns an empty array when there is no usable recipe", () => {
    expect(adaptCookPilotRecipes({ recipes: [] })).toEqual([]);
    expect(adaptCookPilotRecipes(null)).toEqual([]);
    expect(adaptCookPilotRecipes({ recipe: { title: "", ingredientSections: [], instructionSections: [] } })).toEqual([]);
  });
});

describe("a section named after the dish", () => {
  // Real response from parseSocialRecipe for a pasted salad-dressing recipe:
  // the parser found no internal headings, so it titled the one section with
  // the recipe's own name. Rendered, the dish's name appeared twice on the
  // card — once as the title, once as a heading over the first ingredient.
  const body = {
    recipe: {
      title: "Homemade Salad Dressing",
      ingredientSections: [
        {
          title: "Homemade Salad Dressing",
          ingredients: [{ amount: "1/2", unit: "cup", name: "olive oil" }],
        },
        {
          title: "Optional",
          ingredients: [{ amount: "1", unit: "tsp", name: "oregano" }],
        },
      ],
      instructionSections: [],
    },
  };

  it("loses the heading but keeps the ingredient", () => {
    const recipe = adaptCookPilotRecipe(body);
    expect(recipe?.ingredients).toHaveLength(2);
    expect(recipe?.ingredients[0].section).toBeUndefined();
    expect(recipe?.ingredients[0].raw).toBe("1/2 cup olive oil");
  });

  it("keeps a heading that says something the title does not", () => {
    const recipe = adaptCookPilotRecipe(body);
    expect(recipe?.ingredients[1].section).toBe("Optional");
  });

  it("matches on case and trailing punctuation", () => {
    const shouty = adaptCookPilotRecipe({
      recipe: {
        title: "Homemade Salad Dressing",
        ingredientSections: [
          {
            title: "HOMEMADE SALAD DRESSING:",
            ingredients: [{ name: "olive oil" }],
          },
        ],
        instructionSections: [],
      },
    });
    expect(shouty?.ingredients[0].section).toBeUndefined();
  });

  it("does the same for instruction sections", () => {
    const recipe = adaptCookPilotRecipe({
      recipe: {
        title: "Borscht",
        ingredientSections: [],
        instructionSections: [
          { title: "Borscht", instructions: [{ text: "Simmer the beets." }] },
          { title: "To serve", instructions: [{ text: "Add sour cream." }] },
        ],
      },
    });
    expect(recipe?.instructions[0].section).toBeUndefined();
    expect(recipe?.instructions[1].section).toBe("To serve");
  });
});
