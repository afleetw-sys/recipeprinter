import type { Recipe, RecipeIngredient, RecipeInstruction } from "@/types/recipe";

// Fixture corpus for the layout measurement harness (app/print/_harness).
// These are NOT a random sample of recipes — each one is chosen to sit ON a
// layout boundary, the region where the character-budget guess and the real
// rendered height disagree and content clips or reflows. A recipe that
// comfortably fits (or comfortably overflows) proves nothing; these live at
// the edges, which is exactly where the current engine fails and where the
// rewrite has to be proven correct.
//
// Every recipe carries an `image` so the harness can exercise photo-on/off as
// a real axis (the photo box reserves CSS-driven vertical space that changes
// the split). The value is a tiny inline SVG data URI so nothing hits the
// network while measuring.

export interface HarnessRecipe {
  id: string;
  label: string;
  /** Why this fixture exists — which boundary/edge case it targets. */
  note: string;
  recipe: Recipe;
}

// 4:3 solid placeholder — the card CSS sizes the photo box, so the pixels
// themselves are irrelevant; only that an image renders and reserves space.
const PLACEHOLDER_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="180"><rect width="240" height="180" fill="#cbb79a"/></svg>',
  );

function ing(name: string, section?: string): RecipeIngredient {
  return section ? { name, section } : { name };
}

function steps(texts: string[], section?: string, startAt = 1): RecipeInstruction[] {
  return texts.map((text, i) => (section ? { step: startAt + i, text, section } : { step: startAt + i, text }));
}

function makeIngredients(count: number, prefix = "ingredient"): RecipeIngredient[] {
  return Array.from({ length: count }, (_, i) => ing(`1 cup ${prefix} number ${i + 1}`));
}

function makeSteps(count: number, wordsEach = 12): RecipeInstruction[] {
  return Array.from({ length: count }, (_, i) => ({
    step: i + 1,
    text:
      `Step ${i + 1}: ` +
      Array.from({ length: wordsEach }, (_, w) => `word${w + 1}`).join(" ") +
      ".",
  }));
}

function base(partial: Partial<Recipe> & { title: string }): Recipe {
  return {
    ingredients: [],
    instructions: [],
    image: PLACEHOLDER_IMAGE,
    sourceUrl: "https://example.com/recipes/the-source-page-url-goes-here",
    servings: 2,
    totalTime: "20 min",
    ...partial,
  };
}

export const HARNESS_RECIPES: HarnessRecipe[] = [
  {
    id: "salmon",
    label: "Honey Garlic Salmon Stir Fry Noodles",
    note: "The reported clip: sectioned ingredients + a step that lands right at the 6x4 front boundary.",
    recipe: base({
      title: "Honey Garlic Salmon Stir Fry Noodles",
      ingredients: [
        ing("2, 4-6 ounce salmon fillets", "Salmon"),
        ing("1/4 teaspoon salt", "Salmon"),
        ing("1/4 teaspoon black pepper", "Salmon"),
        ing("1/4 teaspoon paprika", "Salmon"),
        ing("1 tablespoon toasted sesame oil", "Salmon"),
        ing("2 teaspoons minced garlic", "Sauce"),
        ing("1/4 cup low sodium tamari or soy sauce", "Sauce"),
        ing("3 tablespoons honey", "Sauce"),
        ing("1 tablespoon sriracha, (or more to taste)", "Sauce"),
        ing("1 tablespoon fresh lime juice", "Sauce"),
        ing("2 tablespoons water", "Sauce"),
        ing("1 tablespoon toasted sesame oil", "Noodles/Stir Fry"),
        ing("1 tablespoon minced garlic", "Noodles/Stir Fry"),
        ing("2 teaspoons fresh grated ginger", "Noodles/Stir Fry"),
        ing("4 ounces shiitake mushrooms", "Noodles/Stir Fry"),
        ing("3/4 cup edamame", "Noodles/Stir Fry"),
        ing("1 cup chopped bok choy", "Noodles/Stir Fry"),
        ing("1/4 cup diced green onion, (white part only)", "Noodles/Stir Fry"),
        ing("6 ounces brown rice noodles", "Noodles/Stir Fry"),
      ],
      instructions: steps([
        "Bring a large pot of salted water to a boil and cook noodles according to package instructions.",
        "Pat the salmon dry and season both sides with salt, pepper, and paprika.",
        "Whisk together the garlic, tamari, honey, sriracha, lime juice, and water for the sauce.",
        "Sear the salmon in sesame oil until crisp, about 3 minutes per side, then set aside.",
        "Stir fry the garlic, ginger, mushrooms, edamame, and bok choy until tender-crisp.",
        "Toss the noodles and sauce into the pan, then top with the salmon and green onion.",
      ]),
    }),
  },
  {
    id: "tiny",
    label: "Two-Ingredient Toast",
    note: "Must stay front-only on every size — never invent a back face.",
    recipe: base({
      title: "Two-Ingredient Toast",
      ingredients: [ing("2 slices bread"), ing("1 tablespoon butter")],
      instructions: steps(["Toast the bread.", "Spread with butter."]),
    }),
  },
  {
    id: "huge",
    label: "Twelve-Hour Holiday Feast",
    note: "Needs 3-4 faces — stresses multi-continuation packing.",
    recipe: base({
      title: "Twelve-Hour Holiday Feast",
      ingredients: makeIngredients(40),
      instructions: makeSteps(30, 16),
    }),
  },
  {
    id: "many-short-ingredients",
    label: "Spice Blend",
    note: "Many tiny ingredients — stresses the 2-column newspaper split.",
    recipe: base({
      title: "House Spice Blend",
      ingredients: makeIngredients(28, "spice"),
      instructions: steps(["Combine all spices.", "Store in a sealed jar."]),
    }),
  },
  {
    id: "giant-single-step",
    label: "One Enormous Step",
    note: "A single unbreakable step much taller than the rest — the pop-by-real-height case.",
    recipe: base({
      title: "One Enormous Step",
      ingredients: makeIngredients(6),
      instructions: [
        { step: 1, text: "Preheat the oven." },
        { step: 2, text: "Mix the dry ingredients." },
        {
          step: 3,
          text:
            "This is the enormous step: " +
            Array.from({ length: 90 }, (_, w) => `detail${w + 1}`).join(" ") +
            ". It cannot be broken across faces, so it must move whole.",
        },
        { step: 4, text: "Cool and serve." },
      ],
    }),
  },
  {
    id: "sectioned-both",
    label: "Sectioned Ingredients And Steps",
    note: "Section headers on both lists eat vertical space the text length misses.",
    recipe: base({
      title: "Layered Lasagna",
      ingredients: [
        ...[0, 1, 2, 3].map((i) => ing(`1 cup sauce item ${i + 1}`, "Sauce")),
        ...[0, 1, 2, 3].map((i) => ing(`1 cup filling item ${i + 1}`, "Filling")),
        ...[0, 1, 2].map((i) => ing(`1 cup topping item ${i + 1}`, "Topping")),
      ],
      instructions: [
        ...steps(["Make the sauce base.", "Simmer the sauce.", "Season the sauce."], "Sauce", 1),
        ...steps(["Mix the filling.", "Layer the pan.", "Add the topping.", "Bake covered.", "Bake uncovered."], "Assembly", 4),
      ],
    }),
  },
  {
    id: "no-ingredients",
    label: "Steps Only",
    note: "Empty ingredients section — the single-column method path.",
    recipe: base({
      title: "Perfect Boiled Eggs",
      ingredients: [],
      instructions: makeSteps(10, 14),
    }),
  },
  {
    id: "no-steps",
    label: "Ingredients Only",
    note: "Empty instructions section — ingredient-only wide layout.",
    recipe: base({
      title: "Charcuterie Board",
      ingredients: makeIngredients(22, "board item"),
      instructions: [],
    }),
  },
  {
    id: "long-title-photo",
    label: "Very Long Title With Photo",
    note: "A long wrapping title plus photo — header eats front vertical space.",
    recipe: base({
      title: "Grandma's Sunday Slow-Braised Short Rib Ragu With Hand-Rolled Pappardelle And Gremolata",
      ingredients: makeIngredients(14),
      instructions: makeSteps(9, 15),
    }),
  },
  {
    id: "boundary-front-6x4",
    label: "6x4 Front Boundary",
    note: "Sized to land the last front item exactly at the 6x4 front budget edge.",
    recipe: base({
      title: "Weeknight Fried Rice",
      ingredients: makeIngredients(9, "rice item"),
      instructions: makeSteps(5, 13),
    }),
  },
  {
    id: "empty-face-after-pull",
    label: "Empty-Face-After-Pull Shape",
    note: "A back face light enough that a pull can empty it — INV-3 stress.",
    recipe: base({
      title: "Simple Pancakes",
      ingredients: makeIngredients(8),
      instructions: [...makeSteps(6, 12), { step: 7, text: "Serve warm." }],
    }),
  },
  {
    id: "oscillation-shape",
    label: "Oscillation Shape",
    note: "Content near a boundary where a pop then a pull can cycle A/B/A/B.",
    recipe: base({
      title: "Braised Chicken Thighs",
      ingredients: makeIngredients(11),
      instructions: [
        ...makeSteps(7, 14),
        { step: 8, text: "This slightly longer closing step is what tips the last face over and back near the boundary." },
      ],
    }),
  },
  {
    id: "long-ingredients-short-steps",
    label: "Long Ingredients, Short Steps",
    note: "Ingredients overflow the front while steps are trivial — ingredientsOnly path.",
    recipe: base({
      title: "Everything Salad",
      ingredients: makeIngredients(30, "salad item"),
      instructions: steps(["Toss everything together.", "Dress and serve."]),
    }),
  },
  {
    id: "short-ingredients-long-steps",
    label: "Short Ingredients, Long Steps",
    note: "Few ingredients, many long steps — instruction-heavy continuation flow.",
    recipe: base({
      title: "Sourdough Loaf",
      ingredients: makeIngredients(5),
      instructions: makeSteps(16, 20),
    }),
  },
  {
    id: "medium-fits-letter-not-6x4",
    label: "Fits Letter, Not 6x4",
    note: "Single-face on letter but must split on 6x4 — size-sensitivity check.",
    recipe: base({
      title: "Sheet Pan Fajitas",
      ingredients: makeIngredients(16),
      instructions: makeSteps(8, 14),
    }),
  },
  {
    id: "bourbon-chicken",
    label: "Bourbon Chicken",
    note: "Reported under-fill: ~13 sectioned ingredients + 4 medium steps leaves the front half-empty and strands every step on a near-empty back.",
    recipe: base({
      title: "Bourbon Chicken",
      sourceUrl: "https://cooklikelauren.com/dinner/bourbon-chicken",
      ingredients: [
        ing("6-7 lbs boneless skinless chicken thighs"),
        ing("4 packets good season's zesty Italian salad dressing mix"),
        ing("Olive oil"),
        ing("2 tbsp sesame oil", "Sauce"),
        ing("6 cloves minced garlic", "Sauce"),
        ing("3/4 C low sodium soy sauce", "Sauce"),
        ing("2 Tbsp rice vinegar", "Sauce"),
        ing("1 C brown sugar", "Sauce"),
        ing("1 tsp ground ginger", "Sauce"),
        ing("1/2 tsp red pepper flakes", "Sauce"),
        ing("1 TB chili paste or sriracha", "Sauce"),
      ],
      instructions: steps([
        "Trim extra fat off chicken thighs. Place in a bowl with zesty Italian dressing mix and olive oil. Mix and lay in a single layer on a large sheet pan. Bake at 375 for 45 minutes.",
        "Once the chicken is cooked cut into bite size pieces and set aside.",
        "Add the oil to a wok over medium heat and cook the garlic for 2 minutes. Add the rest of the sauce ingredients and whisk. Turn the heat to high and let it thicken for 3-4 minutes.",
        "Turn heat back down to medium and add chicken to the wok. Stir and allow it to heat through before serving.",
      ]),
    }),
  },
  {
    id: "one-long-ingredient",
    label: "One Very Long Ingredient",
    note: "A single ingredient line that wraps to several lines at column width.",
    recipe: base({
      title: "Marinade",
      ingredients: [
        ing(
          "1/4 cup of a very long ingredient description that keeps going with clarifying notes, brand suggestions, and substitution options so it wraps to several lines at any column width",
        ),
        ...makeIngredients(6),
      ],
      instructions: makeSteps(5, 12),
    }),
  },
];
