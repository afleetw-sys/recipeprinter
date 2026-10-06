/**
 * The deck index that stands for the slot an arriving recipe will take.
 *
 * `pendingSlotIndexIn` answers in NAV ITEMS (one per face). The deck's
 * selection, `activeNavIndex`, is in the deck's own units, and in a cookbook
 * those are SPREADS: two pages to a slide, so `useDeckScroller` is handed
 * `spreads.length` as its length. Writing a nav index into it, as the page did,
 * landed about twice as far into the book as intended. Past the halfway point
 * the number ran off the end and was clamped to the last spread, so a recipe
 * added in the middle of a large book parked the deck at the back of it.
 *
 * In a book the slot is the spread holding the page the placeholder follows
 * (the last page when nothing is anchored). The recipe may go on to open the
 * next spread instead, which the jump to a just-added recipe then handles as
 * an ordinary move.
 */
export function deckIndexForPendingSlot({
  cookbookView,
  slot,
  navItems,
  spreads,
}: {
  cookbookView: boolean;
  /** The nav index the recipe will occupy — `pendingSlotIndexIn`. */
  slot: number;
  navItems: readonly { sheetIndex: number }[];
  spreads: readonly { left: number | null; right: number | null }[];
}): number {
  if (!cookbookView) return slot;
  if (spreads.length === 0) return 0;
  const before = navItems[Math.min(slot, navItems.length) - 1];
  if (!before) return 0;
  const index = spreads.findIndex(
    (spread) => spread.left === before.sheetIndex || spread.right === before.sheetIndex,
  );
  return index === -1 ? spreads.length - 1 : index;
}

/**
 * Where the deck lands for a just-added recipe: the slide that holds it and,
 * in the book's spread view, which page of that spread is selected (`null`
 * leaves the spread's default selection). Null when the recipe has no page
 * yet.
 */
export function landingForRecipe({
  cookbookView,
  recipeId,
  navItems,
  spreads,
}: {
  cookbookView: boolean;
  recipeId: string;
  navItems: readonly { recipeId: string; sheetIndex: number; kind?: string }[];
  spreads: readonly { left: number | null; right: number | null }[];
}): { slide: number; sheet: number | null } | null {
  // The recipe's own page, not the full-page photo facing it (which shares
  // its id): the recipe is what was added, and what the cook edits next.
  const ownPage = navItems.findIndex((navItem) => navItem.recipeId === recipeId && navItem.kind === "recipe");
  const index = ownPage !== -1 ? ownPage : navItems.findIndex((navItem) => navItem.recipeId === recipeId);
  if (index === -1) return null;
  const targetSheet = navItems[index]!.sheetIndex;
  if (!cookbookView) return { slide: index, sheet: null };
  const slide = spreads.findIndex(
    (spread) => spread.left === targetSheet || spread.right === targetSheet,
  );
  if (slide === -1) return null;
  // Selected, on whichever side of the spread it landed. Left to the
  // spread's default (its left page), a recipe arriving on the right, such as
  // one facing its chapter opener, arrived unselected.
  return { slide, sheet: targetSheet };
}
