import type { PrintCardSize, RecipePrintTemplate } from "@/types/recipe";

/**
 * The card sizes and looks a cook can pick from, as data.
 *
 * Split from components/RecipeCardPrint, which declared them beside the
 * components that draw them. Anything wanting to VALIDATE a stored value ("is
 * this still a real template?") had to import the whole ~2,100-line printable-
 * card tree to do it — which is what pushed the validators in lib/printSettings
 * onto the homepage's critical path and forced a lib/printSettingsStore module
 * to be split off purely to escape them. That split is folded back in now.
 *
 * Nothing here renders. There is no JSX, no component reference and no import
 * beyond the two type names, so a module that only needs to know WHICH
 * templates exist can ask without pulling in the machinery that draws them.
 * components/RecipeCardPrint re-exports all of it, so existing import sites are
 * unaffected — see the type declarations in types/recipe.ts.
 */
export const PRINT_CARD_SIZE_OPTIONS: Array<{
  id: PrintCardSize;
  label: string;
  detail: string;
}> = [
  { id: "letter", label: "Full page", detail: "Letter paper" },
  { id: "card-6x4", label: "6 x 4 card", detail: "Landscape recipe card" },
];

export const RECIPE_PRINT_TEMPLATE_OPTIONS: Array<{
  id: RecipePrintTemplate;
  label: string;
  detail: string;
}> = [
  { id: "classic", label: "Classic", detail: "Cornflower and slate, clean cookbook card" },
  { id: "pantry", label: "Pantry", detail: "Fine ruled lines with small ingredient sketches" },
  { id: "counter", label: "Counter", detail: "Black-and-white notes with tiny counter details" },
  { id: "heirloom", label: "Heirloom", detail: "Cream stock, red utensil keepsake" },
  { id: "keepsake", label: "Keepsake", detail: "Cream recipe-box card with classic family style" },
  { id: "bistro", label: "Bistro", detail: "Blue checks, tomato red, playful kitchen card" },
];
