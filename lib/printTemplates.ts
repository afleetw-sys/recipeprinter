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
  /** Requires RecipePrinter Pro, no exceptions — see `canUseCardSize` in
   *  lib/recipePrinterPurchases.ts. The only free size is "letter"; adding
   *  or un-gating a size later is a one-line change here, not a new
   *  conditional at each call site. */
  proOnly: boolean;
}> = [
  { id: "letter", label: "Full Page", detail: "Letter", proOnly: false },
  // Not "Recipe Card" — that name already means the non-cookbook project
  // TYPE everywhere else (the print-page tabs, /projects, the account
  // dropdown), regardless of which size it's printed at. Calling this size
  // option the same thing implied a Letter-size recipe-cards project was
  // somehow not real "recipe cards", or that this size was the only way to
  // print one.
  { id: "card-6x4", label: "Card", detail: "4×6", proOnly: true },
];

export const PRO_ONLY_CARD_SIZES: readonly PrintCardSize[] = PRINT_CARD_SIZE_OPTIONS.filter(
  (option) => option.proOnly,
).map((option) => option.id);

export function isProOnlyCardSize(cardSize: PrintCardSize): boolean {
  return PRO_ONLY_CARD_SIZES.includes(cardSize);
}

export const RECIPE_PRINT_TEMPLATE_OPTIONS: Array<{
  id: RecipePrintTemplate;
  label: string;
  detail: string;
}> = [
  { id: "classic", label: "Classic", detail: "Cornflower and slate, clean cookbook card" },
  { id: "pantry", label: "Pantry", detail: "Fine ruled lines with small ingredient sketches" },
  { id: "typewriter", label: "Typewriter", detail: "Black and white, typed on an index card" },
  { id: "bistro", label: "Bistro", detail: "Blue checks, tomato red, playful kitchen card" },
  { id: "heirloom", label: "Heirloom", detail: "Cream stock, red utensil keepsake" },
  { id: "market", label: "Market", detail: "A thin teal bar up top and a row of cut-paper groceries below" },
  { id: "counter", label: "Counter", detail: "Black-and-white notes with tiny counter details" },
  { id: "keepsake", label: "Keepsake", detail: "Cream recipe-box card with classic family style" },
  { id: "garden", label: "Garden", detail: "Soft green stock, rolling hills and a vine of tomatoes" },
  { id: "quilt", label: "Quilt", detail: "Warm cream with a quilted strip of green and rust tiles" },
  { id: "supper", label: "Supper", detail: "A deep red frame set with a fork, spoon or knife" },
  { id: "diner", label: "Diner", detail: "A bold outlined red title and a dashed photo frame" },
];
