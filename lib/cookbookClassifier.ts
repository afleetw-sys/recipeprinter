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
};

const RULES: CategoryRule[] = [
  { category: "Breakfast", keywords: ["breakfast", "brunch", "pancake", "waffle", "omelet", "omelette", "french toast", "oatmeal", "granola", "muffin", "frittata"] },
  { category: "Appetizers", keywords: ["appetizer", "starter", "bruschetta", "crostini", "dip", "deviled egg", "party bite", "canape", "tapas", "nachos"] },
  { category: "Soups & Salads", keywords: ["soup", "stew", "chowder", "bisque", "salad", "gazpacho", "broth", "chili"] },
  { category: "Main Dishes", keywords: ["main dish", "entree", "chicken", "beef", "pork", "salmon", "fish", "turkey", "pasta", "lasagna", "parmesan", "casserole", "pizza", "burger", "taco", "curry"] },
  { category: "Sides", keywords: ["side dish", "side", "roasted vegetables", "mashed potato", "slaw", "rice", "beans", "stuffing", "vegetable"] },
  { category: "Breads", keywords: ["bread", "biscuit", "roll", "focaccia", "sourdough", "cornbread", "bagel", "bun", "dough"] },
  { category: "Desserts", keywords: ["dessert", "cookie", "cake", "brownie", "pie", "tart", "pudding", "chocolate", "cupcake", "frosting", "ice cream", "cheesecake", "candy"] },
  { category: "Drinks", keywords: ["drink", "cocktail", "mocktail", "smoothie", "lemonade", "tea", "coffee", "latte", "punch", "margarita", "juice"] },
];

function normalized(value: string | undefined): string {
  return (value ?? "").toLocaleLowerCase();
}

function addMatches(
  scores: Map<CookbookCategory, number>,
  text: string,
  weight: number,
) {
  if (!text) return;
  for (const rule of RULES) {
    let matches = 0;
    for (const keyword of rule.keywords) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}(?:s|es)?\\b`, "i").test(text)) matches += 1;
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
