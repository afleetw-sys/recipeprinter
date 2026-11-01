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

/** The little of a page that `hostedPendingPage` reads. */
interface HostSheet {
  slots: readonly ({ kind: string; id?: string; recipeId?: string; pageId?: string } | null)[];
}

/**
 * The empty page an arriving recipe will fill, when there is one, so its
 * loading card stands on that page.
 *
 * A recipe goes straight after the page it is added after (the last page of a
 * recipe that runs onto two), so the page next in line is where it lands: the
 * facing page when that one is empty, or the first page of the next spread
 * when that is. Empty means nothing at all (the end of the book) or a blank
 * the book only prints to pair its pages up. The loading card used to be drawn
 * as a new page below the spread in every case but one (the top of a chapter
 * whose opener faces an empty page), and the recipe then landed back up on the
 * empty page, out of view.
 *
 * Never beside the contents, which keeps its facing page empty, nor onto a
 * blank page the cook added (theirs, not room), nor when every recipe opens on
 * its own full-page photo spread.
 */
export function hostedPendingPage({
  spreads,
  sheets,
  anchorSheet,
  anchorId,
  fullPagePhotos,
}: {
  spreads: readonly { left: number | null; right: number | null; single?: boolean }[];
  sheets: readonly HostSheet[];
  /** The sheet of the nav item the recipe is added after (`pendingAnchorIndexIn`). */
  anchorSheet: number | null;
  /** That nav item's id, or null when nothing is anchored. */
  anchorId: string | null;
  /** Every recipe opens on its own full-page photo spread. */
  fullPagePhotos: boolean;
}): { spread: number; side: "left" | "right" } | null {
  if (fullPagePhotos || anchorSheet === null) return null;
  const idOf = (slot: HostSheet["slots"][number]) => (slot?.kind === "recipe" ? slot.recipeId : slot?.id);
  // The last page the anchor is on.
  let last = anchorSheet;
  if (anchorId) {
    for (let i = anchorSheet + 1; i < sheets.length; i += 1) {
      if (!sheets[i]?.slots.some((slot) => idOf(slot) === anchorId)) break;
      last = i;
    }
  }
  if (sheets[last]?.slots.some((slot) => slot?.kind === "toc" || slot?.kind === "cover")) return null;
  const isRoom = (sheet: number | null) =>
    sheet === null ||
    Boolean(sheets[sheet]?.slots.some((slot) => slot?.kind === "blank" && !slot.pageId));

  const index = spreads.findIndex((spread) => spread.left === last || spread.right === last);
  const spread = spreads[index];
  if (!spread || spread.single) return null;
  if (spread.left === last) return isRoom(spread.right) ? { spread: index, side: "right" } : null;
  const next = spreads[index + 1];
  if (!next || next.single || next.left === null) return null;
  return isRoom(next.left) ? { spread: index + 1, side: "left" } : null;
}
