import type { PageSheet, RecipeSheetSlot } from "@/lib/usePrintSheets";

/**
 * Two 4x6 cards on one Letter sheet, stacked one above the other.
 *
 * Stacked, not side by side, because of what a duplex printer does to the
 * back. "Flip on long edge" turns a portrait sheet over left to right, so
 * whatever is on the right of the front ends up behind the LEFT of the back.
 * Side by side, every back sheet would have to swap its two cards, and a
 * printer set to flip the other way would need a different swap. Stacked and
 * centred left to right, the mirror changes nothing: the top card's back
 * prints straight behind the top card. The two cards also sit the same
 * distance from the top and bottom edges, so a short-edge flip still lands
 * every back on a card (the wrong one, upside down), never across the gap.
 *
 * The cards themselves are the ones the deck already laid out: each card's
 * sheet (one card, its front and maybe its back) becomes one half of a
 * Letter page, in deck order. Nothing is re-measured.
 */
export interface TwoUpCard {
  slot: RecipeSheetSlot;
  /** The card's own sheet asked for a back side: real back content, or a
      blank that keeps a duplex job's sheets in step (see `backGroupNeeded`). */
  needsBack: boolean;
}

export interface TwoUpPage {
  /** Top half, then bottom half. `null` is an empty half: the last page of an
      odd number of cards (never a lone card, which fills both halves). */
  cards: [TwoUpCard | null, TwoUpCard | null];
  /** Print a back side for this sheet of paper. */
  hasBack: boolean;
}

export function pairCardsOnLetter(sheets: PageSheet[]): TwoUpPage[] {
  const cards: TwoUpCard[] = [];
  for (const sheet of sheets) {
    const slot = sheet.slots.find((candidate) => candidate?.kind === "recipe");
    if (!slot || slot.kind !== "recipe") continue;
    cards.push({ slot, needsBack: sheet.backGroupNeeded });
  }
  // A job of one card fills the sheet with it rather than leaving the bottom
  // half blank: printing copies of one recipe (the print dialog's Copies)
  // then gives two cards a sheet. A recipe long enough for two cards or more
  // pairs its own cards as usual.
  if (cards.length === 1) cards.push(cards[0]);

  const pages: TwoUpPage[] = [];
  for (let index = 0; index < cards.length; index += 2) {
    const top = cards[index];
    const bottom = cards[index + 1] ?? null;
    const isLast = index + 2 >= cards.length;
    const printsSomething = Boolean(top.slot.back || bottom?.slot.back);
    pages.push({
      cards: [top, bottom],
      // A duplex job gives every card but the last a back, blank or not,
      // which keeps page N's front from landing on page N-1's back. The last
      // sheet has nothing after it to keep in step, so it gets a back only to
      // print one: a card that was not last on its own can be last here.
      hasBack: isLast ? printsSomething : top.needsBack || Boolean(bottom?.needsBack),
    });
  }
  return pages;
}
