import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * The bar over a deck page is one row at every width. Where its controls do
 * not fit, the ones that fall off the end go into a More menu instead of the
 * bar wrapping onto a second line (a phone showed the link and delete icons
 * sitting alone on a row of their own under the rest).
 *
 * Real layout, so a real browser: jsdom has no widths to run out of.
 */

const LINK = "https://www.wikipedia.org/recipes/lemon-herb-chicken";

/**
 * Imports a recipe with no time or servings, the state in the report: the
 * reveal button then names both ("Add time, servings"), and that label is what
 * pushed the icons beside it off a phone's row. Long enough to run onto the
 * card's back, so Front/Back is in the bar too.
 */
async function importLink(page: Page) {
  await page.route("**/api/parse", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const recipe of body.recipes ?? []) {
      for (const key of ["totalTime", "cookTime", "prepTime", "servings", "yield"]) delete recipe[key];
      recipe.instructions = Array.from({ length: 20 }, () => recipe.instructions ?? []).flat();
    }
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  const field = page.getByPlaceholder("Paste a recipe link");
  await expect(async () => {
    await field.fill(LINK);
    await field.press("Enter");
    await expect(page).toHaveURL(/\/print$/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

const bar = (page: Page) => page.locator(".recipe-page-toolbar").filter({ visible: true }).first();

/** Every shown group's box, relative to the bar. */
async function groupBoxes(page: Page) {
  return bar(page).evaluate((node) => {
    const outer = node.getBoundingClientRect();
    return (Array.from(node.children) as HTMLElement[])
      .filter((child) => child.getClientRects().length > 0 && getComputedStyle(child).visibility !== "hidden")
      .map((child) => {
        const rect = child.getBoundingClientRect();
        return {
          top: rect.top - outer.top,
          bottom: rect.bottom - outer.top,
          left: rect.left - outer.left,
          right: rect.right - outer.left,
          barWidth: outer.width,
        };
      });
  });
}

for (const width of [320, 360, 375, 390, 430, 600, 820, 1280]) {
  test(`the page toolbar is one row at ${width}px, with nothing lost`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await importLink(page);
    await expect(bar(page)).toBeVisible();
    // Let the bar settle after the deck finishes sizing itself.
    await expect(async () => {
      const boxes = await groupBoxes(page);
      expect(boxes.length).toBeGreaterThan(0);
      const firstBottom = Math.min(...boxes.map((box) => box.bottom));
      // One row: no group starts below another group's bottom edge.
      for (const box of boxes) expect(box.top).toBeLessThan(firstBottom);
      // And nothing is drawn outside the bar.
      for (const box of boxes) {
        expect(box.left).toBeGreaterThanOrEqual(-0.5);
        expect(box.right).toBeLessThanOrEqual(box.barWidth + 0.5);
      }
    }).toPass({ timeout: 10_000 });

    // Delete is on every page. Wherever the width put it, it is reachable:
    // in the bar, or in the More menu.
    const deleteInBar = bar(page).getByRole("button", { name: /^Delete / });
    if (await deleteInBar.isVisible()) return;
    await bar(page).getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  });
}

test("a desktop toolbar has room for everything and no More button", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await importLink(page);
  await expect(bar(page).getByRole("button", { name: /^Delete / })).toBeVisible();
  await expect(bar(page).getByRole("button", { name: "More" })).toHaveCount(0);
});

test("a control in the More menu still does its job", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await importLink(page);
  await bar(page).getByRole("button", { name: "More" }).click();
  // The photo control is the last to give up its place, so at 320px everything
  // after the reveal button is in here, the photo picker included.
  await page.getByRole("menuitem", { name: "Photo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

