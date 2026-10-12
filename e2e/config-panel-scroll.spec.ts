import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * On desktop the print settings scroll right to the panel's top and bottom
 * edges. The panel's own padding (and an empty footer's spacing) used to sit
 * outside the scroll, so the settings were cut off a band short of each edge
 * at every scroll position.
 *
 * Real layout, so a real browser: jsdom has no boxes to measure.
 */

test.skip(({ isMobile }) => isMobile, "phones get the settings as a sheet, not the side panel");

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

/** How far the scrolling area stops short of the panel's inner edges. */
async function bands(page: Page) {
  return page.locator(".recipe-config-panel").evaluate((panel) => {
    const scroll = panel.querySelector(".recipe-config-panel__scroll") as HTMLElement;
    const header = panel.querySelector(".recipe-config-panel__header") as HTMLElement;
    const style = getComputedStyle(panel);
    const outer = panel.getBoundingClientRect();
    const innerTop = outer.top + parseFloat(style.borderTopWidth);
    const innerBottom = outer.bottom - parseFloat(style.borderBottomWidth);
    const headerBox = header.getBoundingClientRect();
    // A header with nothing showing in it takes no room of its own.
    const above = headerBox.height > 0 ? headerBox.bottom : innerTop;
    const box = scroll.getBoundingClientRect();
    return {
      top: Math.round(box.top - above),
      bottom: Math.round(innerBottom - box.bottom),
      scrolls: scroll.scrollHeight > scroll.clientHeight,
    };
  });
}

test("the print settings scroll to the panel's edges on desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 });
  await importLink(page);
  await expect(page.locator(".recipe-config-panel__scroll")).toBeVisible();

  // Every desktop width, from the narrowest that keeps the side panel to a wide screen.
  for (const width of [821, 1024, 1280, 1600]) {
    await page.setViewportSize({ width, height: 640 });
    await expect
      .poll(() => bands(page), { message: `at ${width}px` })
      .toEqual({ top: 0, bottom: 0, scrolls: true });
  }
});
