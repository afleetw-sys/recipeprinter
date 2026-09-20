import type { PrintCardSize, Recipe, RecipePrintTemplate } from "@/types/recipe";

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
  showPhoto: boolean;
  showSourceUrl: boolean;
  showCutLines: boolean;
  doubleSided: boolean;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  published: boolean;
}
