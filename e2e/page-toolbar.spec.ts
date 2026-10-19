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

/**
 * Zoomed in, the card is taller (and wider) than the deck, and scrolling down
 * it carried the bar off the top with the card's top edge: the photo, link and
 * Done buttons were gone until you scrolled all the way back. The bar stays in
 * view for as long as any of its page is, and no wider than the deck. Desktop
 * and phone share the deck zoom, so both are checked (and a desktop window
 * narrow enough to squeeze the deck), at both ends of the page and both sides.
 */
test("the page toolbar stays on screen while a zoomed-in page is scrolled", async ({ page, isMobile }) => {
  // The widths are set here; the phone project's emulated device has no wheel.
  test.skip(isMobile, "covered at phone width by the desktop projects");
  await page.setViewportSize({ width: 1280, height: 800 });
  await importLink(page);
  // With the empty fields showing, so the bar carries its widest content (the
  // hint naming them), which is what ran off the side of a narrow deck.
  await bar(page).locator(".recipe-page-toolbar__btn--fields").click();
  await expect(bar(page).locator(".recipe-page-toolbar__hint")).toBeVisible();
  for (const width of [1280, 900, 390]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(bar(page)).toBeVisible();
    const deck = page.locator("#recipe-page-deck");
    const box = await deck.boundingBox();
    if (!box) throw new Error("no deck");

    // Pinch in (ctrl+wheel is the trackpad pinch) until the page is well past
    // the deck in both directions.
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.keyboard.down("Control");
    for (let i = 0; i < 12; i += 1) await page.mouse.wheel(0, -100);
    await page.keyboard.up("Control");
    await expect
      .poll(() => deck.evaluate((el) => el.scrollHeight > el.clientHeight * 2 && el.scrollWidth > el.clientWidth))
      .toBe(true);

    const where = [
      { label: "start", top: 0.25, left: 0 },
      { label: "middle", top: 0.5, left: 0.5 },
      { label: "end", top: 0.75, left: 1 },
    ];
    for (const spot of where) {
      // Into the page itself, not the padding above or below it.
      await deck.evaluate((el, { top, left }) => {
        const slide = el.querySelector<HTMLElement>(".recipe-page-slide.is-active")!;
        el.scrollTop = slide.offsetTop + (slide.offsetHeight - el.clientHeight) * top;
        el.scrollLeft = (el.scrollWidth - el.clientWidth) * left;
      }, spot);
      await expect(async () => {
        const [deckRect, barRect] = await Promise.all([
          deck.evaluate((el) => el.getBoundingClientRect().toJSON()),
          bar(page).evaluate((el) => el.getBoundingClientRect().toJSON()),
        ]);
        const where = `${width}px, ${spot.label}`;
        expect(barRect.top, where).toBeGreaterThanOrEqual(deckRect.top - 0.5);
        expect(barRect.bottom, where).toBeLessThanOrEqual(deckRect.bottom + 0.5);
        expect(barRect.left, where).toBeGreaterThanOrEqual(deckRect.left - 0.5);
        expect(barRect.right, where).toBeLessThanOrEqual(deckRect.right + 0.5);
      }).toPass({ timeout: 5_000 });
    }
  }
});

/**
 * The bar belongs to the deck, not the page's edges. It was boxed to the page's
 * own width, so a small or zoomed-out page squeezed it: the tip wrapped and
 * buttons went into More with empty canvas either side. Wherever the deck has
 * the room, the bar is one row however small the page, and never past the
 * deck's edges.
 */
test("the page toolbar can be wider than a small page", async ({ page, isMobile }) => {
  test.skip(isMobile, "a phone's bar is already the screen's width");
  await page.setViewportSize({ width: 1440, height: 900 });
  await importLink(page);
  await bar(page).locator(".recipe-page-toolbar__btn--fields").click();
  await expect(bar(page).locator(".recipe-page-toolbar__hint")).toBeVisible();
  const deck = page.locator("#recipe-page-deck");
  const box = await deck.boundingBox();
  if (!box) throw new Error("no deck");

  // Pinch out, a step at a time, down to the smallest page.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let step = 0; step < 4; step += 1) {
    await page.keyboard.down("Control");
    for (let i = 0; i < 3; i += 1) await page.mouse.wheel(0, 100);
    await page.keyboard.up("Control");
    await expect(async () => {
      const m = await page.evaluate(() => {
        const toolbar = document.querySelector<HTMLElement>(".recipe-page-slide.is-active .recipe-page-toolbar")!;
        const card = document.querySelector(".recipe-page-slide.is-active .recipe-page-scaler")!.getBoundingClientRect();
        const deckRect = document.querySelector("#recipe-page-deck")!.getBoundingClientRect();
        const groups = (Array.from(toolbar.children) as HTMLElement[]).filter(
          (child) => child.getClientRects().length > 0 && getComputedStyle(child).visibility !== "hidden",
        );
        return {
          card: card.width,
          bar: toolbar.getBoundingClientRect().toJSON(),
          deck: deckRect.toJSON(),
          // One row: no group starts below another group's bottom edge.
          rows:
            groups.some((group) =>
              groups.some((other) => group.getBoundingClientRect().top >= other.getBoundingClientRect().bottom - 0.5),
            )
              ? 2
              : 1,
          collapsed: toolbar.querySelector("[data-overflowed]") !== null,
        };
      });
      // The deck has room for everything on one row at this width.
      expect(m.rows, `one row beside a ${Math.round(m.card)}px page`).toBe(1);
      expect(m.collapsed).toBe(false);
      expect(m.bar.left).toBeGreaterThanOrEqual(m.deck.left - 0.5);
      expect(m.bar.right).toBeLessThanOrEqual(m.deck.right + 0.5);
    }).toPass({ timeout: 5_000 });
  }
});
