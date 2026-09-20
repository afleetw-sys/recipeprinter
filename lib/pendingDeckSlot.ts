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
