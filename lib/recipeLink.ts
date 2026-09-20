import type { RecipePagePlacement } from "@/types/recipe";

/**
 * Whether ONE recipe shows its source link: its own override when it has one,
 * otherwise the book-wide "Recipe link" setting. The link's counterpart to
 * `photoOnFor` in usePrintSheets, and shared for the same reason -- measurement
 * (a link line changes a card's height) and every place that draws the card
 * must resolve it identically or a page clips.
 *
 * Overrides only exist in cookbook mode. A recipe card has no per-recipe
 * placement, so there the setting is the whole answer.
 */
export function recipeLinkOn(
  bookWide: boolean,
  cookbookMode: boolean,
  placement: Pick<RecipePagePlacement, "showSourceUrl"> | undefined,
): boolean {
  return (cookbookMode ? placement?.showSourceUrl : undefined) ?? bookWide;
}
