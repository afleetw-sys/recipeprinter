import type { Recipe } from "@/types/recipe";
import { ingredientText } from "@/lib/recipeCardLayout";

export const COOKBOOK_CATEGORIES = [
  "Breakfast",
  "Appetizers",
  "Soups & Salads",
  "Main Dishes",
  "Sides",
  "Breads",
  "Desserts",
  "Drinks",
] as const;

export type CookbookCategory = (typeof COOKBOOK_CATEGORIES)[number] | "Uncategorized";

type CategoryRule = {
  category: (typeof COOKBOOK_CATEGORIES)[number];
  keywords: string[];
  /**
   * Words that mean something else often enough to be dangerous on their
   * own — "pie" is shepherd's as often as it's apple, "cake" is crab as
   * often as it's birthday. These only count toward this rule's score when
   * `SAVORY_INDICATORS` finds nothing in the same text; a plain `keywords`
   * match always counts regardless.
   */
  ambiguousKeywords?: string[];
};

// A word that, alongside an ambiguous keyword above, says "savory" loudly
// enough to veto it — this is what stops "Spinach Pie" from scoring
// Desserts on "pie" alone. Deliberately not exhaustive (a keyword list never
// is); it targets the specific collisions this classifier has actually been
// seen to make, not every savory word in English.
const SAVORY_INDICATORS = [
  "spinach", "chicken", "beef", "pork", "turkey", "lamb", "shepherd",
  "tamale", "quiche", "meat", "crab", "fish", "salmon", "steak", "gravy",
  "savory", "shrimp", "sausage", "bacon",
];

const RULES: CategoryRule[] = [
  { category: "Breakfast", keywords: ["breakfast", "brunch", "pancake", "waffle", "omelet", "omelette", "french toast", "oatmeal", "granola", "muffin", "frittata"] },
  { category: "Appetizers", keywords: ["appetizer", "starter", "bruschetta", "crostini", "dip", "deviled egg", "party bite", "canape", "tapas", "nachos"] },
  { category: "Soups & Salads", keywords: ["soup", "stew", "chowder", "bisque", "salad", "gazpacho", "broth", "chili"] },
  {
    category: "Main Dishes",
    keywords: [
      "main dish", "entree", "chicken", "beef", "pork", "salmon", "fish", "turkey",
      "pasta", "lasagna", "parmesan", "casserole", "pizza", "burger", "taco", "curry",
      // Common everyday dish names that weren't matching anything at all —
      // "mac and cheese" fell all the way to the "More Recipes" catch-all
      // for lack of a single keyword recognizing it.
      "macaroni", "mac and cheese", "mac n cheese", "mac & cheese", "meatloaf",
      "stir fry", "stir-fry", "quesadilla", "enchilada", "sandwich", "risotto",
      "stroganoff", "meatball", "skillet",
      // Savory pies and cakes, named explicitly so they outscore (or at
      // least tie and fall to Uncategorized rather than wrongly win as) the
      // generic "pie"/"cake" keyword under Desserts.
      "shepherd's pie", "shepherds pie", "pot pie", "tamale pie", "meat pie",
      "quiche", "spinach pie", "fish pie", "fish cake", "crab cake",
    ],
  },
  { category: "Sides", keywords: ["side dish", "side", "roasted vegetables", "mashed potato", "slaw", "rice", "beans", "stuffing", "vegetable"] },
  { category: "Breads", keywords: ["bread", "biscuit", "roll", "focaccia", "sourdough", "cornbread", "bagel", "bun", "dough"] },
  {
    category: "Desserts",
    keywords: ["dessert", "cookie", "brownie", "chocolate", "cupcake", "frosting", "ice cream", "cheesecake", "candy"],
    // "pie"/"tart"/"cake"/"pudding" alone used to be enough to send a
    // spinach pie or a fish cake here — see SAVORY_INDICATORS.
    ambiguousKeywords: ["pie", "tart", "cake", "pudding"],
  },
  { category: "Drinks", keywords: ["drink", "cocktail", "mocktail", "smoothie", "lemonade", "tea", "coffee", "latte", "punch", "margarita", "juice"] },
];

function normalized(value: string | undefined): string {
  return (value ?? "").toLocaleLowerCase();
}

function keywordTest(keyword: string, text: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}(?:s|es)?\\b`, "i").test(text);
}

function addMatches(
  scores: Map<CookbookCategory, number>,
  text: string,
  weight: number,
) {
  if (!text) return;
  const savory = SAVORY_INDICATORS.some((word) => keywordTest(word, text));
  for (const rule of RULES) {
    let matches = 0;
    for (const keyword of rule.keywords) {
      if (keywordTest(keyword, text)) matches += 1;
    }
    if (!savory) {
      for (const keyword of rule.ambiguousKeywords ?? []) {
        if (keywordTest(keyword, text)) matches += 1;
      }
    }
    if (matches > 0) {
      scores.set(rule.category, (scores.get(rule.category) ?? 0) + matches * weight);
    }
  }
}

export interface CookbookClassification {
  category: CookbookCategory;
  confidence: number;
  scores: Partial<Record<CookbookCategory, number>>;
}

/** Deterministic, deliberately conservative cookbook classification.
    Strong metadata/title matches are trusted; weak ingredient/description-only
    matches remain Uncategorized for the cook to place. */
export function classifyRecipe(recipe: Recipe): CookbookClassification {
  const scores = new Map<CookbookCategory, number>();
  addMatches(scores, normalized(recipe.title), 5);
  addMatches(scores, normalized(recipe.course), 5);
  addMatches(scores, normalized(recipe.tags?.join(" ")), 4);
  addMatches(
    scores,
    normalized(recipe.ingredients.map(ingredientText).join(" ")),
    1,
  );
  addMatches(scores, normalized(recipe.description), 1);

  const ranked = Array.from(scores.entries()).sort(
    ([categoryA, scoreA], [categoryB, scoreB]) =>
      scoreB - scoreA ||
      COOKBOOK_CATEGORIES.indexOf(categoryA as (typeof COOKBOOK_CATEGORIES)[number]) -
        COOKBOOK_CATEGORIES.indexOf(categoryB as (typeof COOKBOOK_CATEGORIES)[number]),
  );
  const [best, second] = ranked;
  const bestScore = best?.[1] ?? 0;
  const margin = bestScore - (second?.[1] ?? 0);
  const confident = bestScore >= 4 && margin >= 2;
  return {
    category: confident ? best[0] : "Uncategorized",
    confidence: confident ? Math.min(1, bestScore / 10) : 0,
    scores: Object.fromEntries(scores),
  };
}
