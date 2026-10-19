import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * On a phone the deck runs right down to the bottom bar. The room kept for the
 * bar was a guessed height (132px, or 156 with the tip line in it) and the bar
 * was 143, so a padded band of empty grey sat between the page and the bar,
 * cutting the page off above it. Checked idle and with a line open (the tip
 * changes then), at every phone width.
 *
 * Real layout, so a real browser: jsdom has no boxes to measure.
 */

const LINK = "https://www.wikipedia.org/recipes/lemon-herb-chicken";

async function importLink(page: Page) {
  await page.goto("/");
  const field = page.getByPlaceholder("Paste a recipe link");
  await expect(async () => {
    await field.fill(LINK);
    await field.press("Enter");
    await expect(page).toHaveURL(/\/print$/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

/** How far the deck stops short of the bar (negative: it runs under it). */
async function gapAboveBar(page: Page) {
  return page.evaluate(() => {
    const deck = document.querySelector("#recipe-page-deck")!.getBoundingClientRect();
    const bar = document.querySelector(".recipe-mobile-actions")!.getBoundingClientRect();
    return bar.top - deck.bottom;
  });
}

test("the deck reaches the phone's bottom bar, with no band between them", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await importLink(page);
  await expect(page.locator(".recipe-mobile-actions")).toBeVisible();

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await expect.poll(() => gapAboveBar(page), { message: `${width}px, idle` }).toBeCloseTo(0, 0);

    // Open a line: the tip above the tools switches to the editing one.
    await page.locator(".recipe-card__inline-rich, .recipe-card__inline-input").filter({ visible: true }).first().click();
    await expect(page.locator(".recipe-edit-tips")).toBeVisible();
    await expect.poll(() => gapAboveBar(page), { message: `${width}px, editing` }).toBeCloseTo(0, 0);
    await page.keyboard.press("Escape");
  }
});
