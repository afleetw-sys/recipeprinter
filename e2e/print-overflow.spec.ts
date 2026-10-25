import { expect, test } from "./guarded";
import { deckFontScale, openPrint, overflowAsPrinted } from "./printOverflow";

/**
 * A recipe long enough to need a back, and a second card, at the sizes people
 * print it at. The back of a card is `display: none` on screen until the cook
 * flips to it, and it still prints. It used to come out of print laid out in
 * one column while the pagination had planned two, so the footer sat on
 * step 2 and the later steps fell off the card. Identical in every browser.
 *
 * And at both ends of the text size (lib/fontScale.ts): Biggest is the same
 * recipe on a card with less room, Smallest the same with more.
 */

for (const size of ["card-6x4", "letter"]) {
  test(`a long recipe prints inside every card at ${size}, backs included`, async ({ page }) => {
    await openPrint(page, size);
    await expect(page.locator("#recipe-page-deck").getByText(/Step 30: stir the pot/).first()).toBeAttached();
    expect(await overflowAsPrinted(page)).toEqual([]);
  });
}

for (const fontScale of [0.85, 1.2]) {
  for (const size of ["card-6x4", "letter"]) {
    test(`a long recipe prints inside every card at ${size}, text size ${fontScale}, backs included`, async ({ page }) => {
      await openPrint(page, size, undefined, undefined, fontScale);
      expect(await deckFontScale(page)).toBe(fontScale);
      await expect(page.locator("#recipe-page-deck").getByText(/Step 30: stir the pot/).first()).toBeAttached();
      expect(await overflowAsPrinted(page)).toEqual([]);
    });
  }
}
