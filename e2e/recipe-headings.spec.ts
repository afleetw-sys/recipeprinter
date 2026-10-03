import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { openPrint, overflowAsPrinted } from "./printOverflow";

/**
 * The "Ingredients" / "Steps" headings can be renamed or removed on a recipe,
 * and a removed one comes back through the toolbar's reveal button.
 *
 * Here rather than in a unit test because what matters is the layout: a
 * heading that grows to three lines, or a line given back by removing one,
 * has to be re-measured and re-paginated, or the card prints with its last
 * lines cut off under the footer. The card's own behaviour is covered in
 * components/RecipeCardHeadings.test.tsx.
 */

const label = (page: Page) =>
  page.locator("#recipe-page-deck .recipe-card__ingredients .recipe-card__label").filter({ visible: true }).first();
const field = (page: Page) => page.getByRole("textbox", { name: "Ingredients heading" });
const settled = (page: Page) => expect(page.locator(".recipe-print-shell--measuring")).toHaveCount(0);

async function setHeading(page: Page, text: string) {
  await label(page).click();
  await field(page).fill(text);
  await field(page).press("Enter");
  await expect(field(page)).toHaveCount(0);
  await settled(page);
}

// Long enough to wrap onto more lines than any card keeps spare, so a stale
// layout would print the bottom of the list under the footer.
const LONG =
  "For the slow-cooked base, prepared the night before, kept cold until the morning you cook, " +
  "then brought back to room temperature on the counter for an hour while the oven heats and the pot warms through";

for (const size of ["card-6x4", "letter"]) {
  test(`a renamed or removed heading is re-measured at ${size}, and comes back`, async ({ page }) => {
    await openPrint(page, size);

    // Several lines of heading where there was one: the card has to repaginate.
    await setHeading(page, LONG);
    await expect(label(page)).toContainText(LONG, { ignoreCase: true });
    await expect(async () => expect(await overflowAsPrinted(page)).toEqual([])).toPass();

    // Kept across a reload.
    await page.reload();
    await settled(page);
    await expect(label(page)).toContainText(LONG, { ignoreCase: true });

    // Removed: no label, and still nothing printed past a card.
    await setHeading(page, "");
    await expect(page.locator("#recipe-page-deck .recipe-card__ingredients .recipe-card__label").filter({ visible: true })).toHaveCount(0);
    await expect(async () => expect(await overflowAsPrinted(page)).toEqual([])).toPass();

    // Back through the reveal button, as the default.
    await page.getByRole("button", { name: /^Add .*heading/ }).filter({ visible: true }).first().click();
    await label(page).click();
    await expect(field(page)).toHaveValue("Ingredients");
    await field(page).press("Enter");
    await settled(page);
    await expect(label(page)).toHaveText(/^Ingredients/i);
    await expect(async () => expect(await overflowAsPrinted(page)).toEqual([])).toPass();
  });
}
