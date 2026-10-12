import { describe, expect, it } from "vitest";
import {
  adaptCookPilotRecipe,
  adaptCookPilotRecipes,
  sourceUrlFromResponse,
  withoutWebsiteDescription,
  sourceNotesFromResponse,
} from "@/lib/cookpilot";

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

describe("sourceUrlFromResponse", () => {
  it("takes the link CookPilot found in pasted text", () => {
    expect(sourceUrlFromResponse({ recipe: recipeData("Bread"), sourceURL: "https://example.com/bread" })).toBe(
      "https://example.com/bread",
    );
  });

  it("is undefined when the response carries none", () => {
    expect(sourceUrlFromResponse({ recipe: recipeData("Bread") })).toBeUndefined();
    expect(sourceUrlFromResponse(null)).toBeUndefined();
    expect(sourceUrlFromResponse("nope")).toBeUndefined();
  });

  it("refuses anything that is not an absolute http(s) address, since it is printed", () => {
    expect(sourceUrlFromResponse({ sourceURL: "example.com/bread" })).toBeUndefined();
    expect(sourceUrlFromResponse({ sourceURL: "javascript:alert(1)" })).toBeUndefined();
    expect(sourceUrlFromResponse({ sourceURL: "  " })).toBeUndefined();
  });

  it("lands on the adapted recipe as its source", () => {
    const body = { recipe: recipeData("Bread"), sourceURL: "https://www.example.com/bread" };
    const recipe = adaptCookPilotRecipe(body, sourceUrlFromResponse(body));
    expect(recipe?.sourceUrl).toBe("https://www.example.com/bread");
    expect(recipe?.sourceName).toBe("example.com");
  });
});

describe("website descriptions", () => {
  it("never keeps a web page's own description, single or roundup", () => {
    const blurb = { ...recipeData("Borscht"), description: "The BEST borscht, trust me." };
    const [single] = adaptCookPilotRecipes({ recipe: blurb }, "https://x.example/r");
    expect(single).not.toHaveProperty("description");
    const roundup = adaptCookPilotRecipes({ recipes: [blurb, blurb] }, "https://x.example/r");
    expect(roundup.every((recipe) => !("description" in recipe))).toBe(true);
  });

  it("leaves the single adapter alone, since photos and pasted text use it too", () => {
    const blurb = { ...recipeData("Borscht"), description: "My family's soup." };
    expect(adaptCookPilotRecipe({ recipe: blurb })?.description).toBe("My family's soup.");
  });

  it("keeps the cook's own note when it drops the website's description", () => {
    const out = withoutWebsiteDescription({
      title: "Borscht",
      description: "SEO filler",
      note: "Double the dill.",
      ingredients: [],
      instructions: [],
    });
    expect(out).not.toHaveProperty("description");
    expect(out.note).toBe("Double the dill.");
  });
});

describe("a source's notes", () => {
  // A website's or creator's notes are their writing, which RecipePrinter keeps none of. Only pasted
  // text (the cook's own input) takes them, in `parseText`; the generic adapter never does.
  const withNotes = {
    recipe: {
      title: "Loaf",
      notes: "Keeps for three days.",
      ingredientSections: [{ title: null, ingredients: [{ name: "flour", amount: "500", unit: "g" }] }],
      instructionSections: [],
    },
  };

  it("are not taken into an imported recipe's note", () => {
    expect(adaptCookPilotRecipe(withNotes)?.note).toBeUndefined();
  });

  it("are readable by a caller that imports the cook's own text", () => {
    expect(sourceNotesFromResponse(withNotes)).toBe("Keeps for three days.");
    expect(sourceNotesFromResponse({ data: withNotes })).toBe("Keeps for three days.");
    expect(sourceNotesFromResponse({ recipe: { title: "No notes" } })).toBeUndefined();
    // The image parser's envelope.
    expect(sourceNotesFromResponse({ recipeJSON: JSON.stringify(withNotes.recipe) })).toBe("Keeps for three days.");
  });
});

describe("the page a recipe was really read from", () => {
  // A pin or a post that links out is only how the cook got there. CookPilot
  // names the page it read (`parser.resolvedSourceURL`), and crediting the pin
  // instead printed "pinterest.com" under a blog's recipe.
  const body = (resolvedSourceURL: unknown) => ({
    recipes: [{ title: "Chili", ingredientSections: [{ ingredients: [{ name: "beans" }] }], instructionSections: [] }],
    parser: { source: "json-ld", resolvedSourceURL },
  });

  it("is the recipe's source, for every recipe of the response", () => {
    const [recipe] = adaptCookPilotRecipes(body("https://www.realblog.org/chili"), "https://www.pinterest.com/pin/123/");
    expect(recipe.sourceUrl).toBe("https://www.realblog.org/chili");
    expect(recipe.sourceName).toBe("realblog.org");
  });

  it("leaves the pasted link standing when CookPilot names nothing usable", () => {
    for (const unusable of [undefined, "", 7, "javascript:alert(1)", "/relative"]) {
      const [recipe] = adaptCookPilotRecipes(body(unusable), "https://www.pinterest.com/pin/123/");
      expect(recipe.sourceUrl).toBe("https://www.pinterest.com/pin/123/");
    }
  });
});

describe("an ingredient's printed line", () => {
  // The line is what a card prints and all a saved project keeps, so it has
  // to read as one ingredient whatever shape the parts arrive in.
  const lineFor = (ingredient: Record<string, unknown>) =>
    adaptCookPilotRecipes({
      recipe: { title: "T", ingredientSections: [{ ingredients: [ingredient] }], instructionSections: [] },
    })[0].ingredients[0];

  it("says each part once and keeps a bracketed note in its brackets", () => {
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ amount: "3", unit: "cloves", name: "3 cloves" }, "3 cloves"],
      [{ amount: "3", unit: "Cloves", name: "3 cloves garlic" }, "3 cloves garlic"],
      [{ amount: "2", name: "2 eggs" }, "2 eggs"],
      [{ amount: "1", unit: "can", name: "crushed tomatoes", notes: "(28 ounce)" }, "1 can crushed tomatoes (28 ounce)"],
      [{ amount: "2", unit: "tbsp", name: "butter", notes: "softened" }, "2 tbsp butter, softened"],
      [{ amount: "1", name: "large onion", notes: "diced (about 2 cups)" }, "1 large onion, diced (about 2 cups)"],
      [{ amount: "2", unit: "cups", name: "2% milk" }, "2 cups 2% milk"],
      [{ name: "salt" }, "salt"],
    ];
    for (const [ingredient, line] of cases) expect(lineFor(ingredient).raw).toBe(line);
  });

  it("keeps the amount as the amount when the name only repeated it", () => {
    expect(lineFor({ amount: "3", unit: "cloves", name: "3 cloves" })).toMatchObject({
      amount: "3",
      name: "cloves",
      raw: "3 cloves",
    });
  });
});
