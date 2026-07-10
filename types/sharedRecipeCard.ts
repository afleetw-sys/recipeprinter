import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { Recipe } from "@/types/recipe";

/**
 * A RecipePrinter-authored share link: a recipe plus the exact design/print
 * settings it should open with, stored under `sharedRecipeCards/{slug}` (the
 * slug is the doc id). Deliberately separate from CookPilot's own
 * `sharedRecipes` collection — different shape, different purpose.
 */
export interface SharedRecipeCard {
  slug: string;
  recipe: Recipe;
  template: RecipePrintTemplate;
  cardSize: PrintCardSize;
  cardsPerSheet: 1 | 2;
  showPhoto: boolean;
  showSourceUrl: boolean;
  showCutLines: boolean;
  doubleSided: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  published: boolean;
  /** Rough visit count, bumped once per browser page load. Optional: docs created before this field existed don't have it — treat missing as 0. */
  viewCount?: number;
}

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 80;

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

/** Best-effort slug suggestion from a recipe title; still needs `isValidSlug` validation. */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}
