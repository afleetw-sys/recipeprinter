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

/**
 * A tool's label is never wider than its tile. The tiles were a fixed 92px with
 * no wrapping, sized to our English words, so a browser translating the page
 * ("Add more" became "Füge mehr hinzu" in German) ran the label out past both
 * edges of its tile. Translation swaps the words in place, which is what this
 * does, to every tile, at every phone width.
 */
test("every phone tool's label fits inside its tile, whatever its length", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await importLink(page);
  await expect(page.locator(".recipe-mobile-toolbar__btn").first()).toBeVisible();

  const overflowing = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>(".recipe-mobile-toolbar__btn")).flatMap((tile) => {
        const label = Array.from(tile.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
        if (!label) return [];
        const range = document.createRange();
        range.selectNodeContents(label);
        const words = range.getBoundingClientRect();
        const box = tile.getBoundingClientRect();
        return words.left < box.left || words.right > box.right ? [label.textContent!.trim()] : [];
      }),
    );

  await page.evaluate(() => {
    for (const tile of Array.from(document.querySelectorAll(".recipe-mobile-toolbar__btn"))) {
      const label = Array.from(tile.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent!.trim());
      if (label) label.textContent = "Füge mehr hinzu";
    }
  });

  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await overflowing(), `${width}px`).toEqual([]);
  }
});

/**
 * A phone's cookbook offers the settings a desktop's does. The desktop panel's
 * Page tab was hidden (PAGE_SETTINGS_TAB_ENABLED) but the phone kept its "This
 * page" tile, so the two showed different books' worth of settings. Whichever
 * way the flag is set, the phone's tile follows the desktop's tab.
 *
 * A book opened from session storage: no import, nothing billed.
 */
test("a phone offers a page's own settings only when the desktop panel does", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    const item = {
      id: "r1",
      method: "manual",
      source: "test",
      status: "ready",
      title: "Lemon Chicken",
      addedAt: 0,
      recipe: { title: "Lemon Chicken", ingredients: [{ raw: "1 cup flour" }], instructions: [{ step: 1, text: "Mix." }] },
    };
    sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify([item]));
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: ["r1"] }));
    sessionStorage.setItem(
      "recipeprinter:project-meta:v1",
      JSON.stringify({ cookbookIntent: true, sections: [{ id: "s1", title: "Dinners", itemIds: ["r1"] }] }),
    );
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/print");
  await expect(page.locator(".cookbook-welcome")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".recipe-config-panel").filter({ visible: true })).toBeVisible();
  const desktopHasPageTab = (await page.locator(".recipe-config-panel__tabs").filter({ visible: true }).count()) > 0;

  await page.setViewportSize({ width: 390, height: 800 });
  const tiles = page.locator('.recipe-mobile-toolbar__btn[aria-haspopup="dialog"]').filter({ visible: true });
  await expect(tiles.first()).toBeVisible();
  // Tap every tile that opens a sheet and see whether one is the page's own.
  let phoneHasPageSheet = false;
  for (let i = 0; i < (await tiles.count()); i++) {
    await tiles.nth(i).click();
    if (await page.locator(".recipe-page-sheet").filter({ visible: true }).count()) phoneHasPageSheet = true;
    await page.keyboard.press("Escape");
  }
  expect(phoneHasPageSheet).toBe(desktopHasPageTab);
});
