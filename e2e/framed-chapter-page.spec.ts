import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { deckSettled } from "./workspace";

/**
 * Heirloom and Keepsake open a chapter with a centered ornament over the
 * title, inside the card's frame. Two things were wrong on that page, seen on
 * a real book (Amelia, 2026-11-04):
 *
 * - Heirloom's ornament was a heavy closing quotation mark (❞, U+275E), not
 *   the leaf (❧, U+2767) its rule was written for.
 * - Keepsake drew a stray mark beside its star: its chapter frame, meant to be
 *   absolute, was made `position: relative` by the theme's rule for every
 *   child of the card, so with nothing in it the frame collapsed to a dot (or
 *   a line across the page without a photo).
 *
 * Desktop Chromium is enough: both are the same in every engine, and the book
 * is opened from session storage, so nothing is imported or billed.
 */
test.skip(({ isMobile }) => isMobile, "the theme picker and page rail are the desktop panels");

const FRAMED_THEMES: Array<{ theme: string; ornament: string }> = [
  { theme: "heirloom", ornament: "❧" },
  { theme: "keepsake", ornament: "✷" },
];

const recipe = (id: string, title: string) => ({
  id,
  method: "manual",
  source: "test",
  status: "ready",
  title,
  addedAt: 0,
  recipe: { title, ingredients: [{ raw: "1 cup flour" }], instructions: [{ step: 1, text: "Mix and bake." }] },
});

async function openChapterPage(page: Page, theme: string) {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript((items) => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    const queue = JSON.parse(items) as Array<{ id: string }>;
    sessionStorage.setItem("recipeprinter:queue:v1", items);
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: queue.map((item) => item.id) }));
    sessionStorage.setItem(
      "recipeprinter:project-meta:v1",
      JSON.stringify({ cookbookIntent: true, sections: [{ id: "s1", title: "Dinners", itemIds: queue.map((item) => item.id) }] }),
    );
  }, JSON.stringify([recipe("r1", "Lemon Chicken"), recipe("r2", "Banana Bread")]));
  await page.goto("/print");
  await expect(page.locator(".cookbook-welcome")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cookbook-welcome")).toHaveCount(0);

  await page.locator(".recipe-template-option").filter({ has: page.locator(`.recipe-template--${theme}`) }).click();
  await page.locator(".recipe-page-rail__item-main").filter({ hasText: "Dinners" }).first().click();
  await deckSettled(page);
  const chapter = page.locator(`.recipe-page-canvas .recipe-template--${theme} .recipe-card--chapter`).first();
  await expect(chapter).toBeVisible();
  return chapter;
}

for (const { theme, ornament } of FRAMED_THEMES) {
  test(`${theme}'s chapter ornament is its own, not a quotation mark`, async ({ page }) => {
    const chapter = await openChapterPage(page, theme);
    const drawn = await chapter
      .locator(".recipe-card__chapter-ornament")
      .evaluate((el) => getComputedStyle(el, "::before").content);
    expect(drawn).toBe(`"${ornament}"`);
  });

  test(`${theme}'s chapter frame is a frame or nothing, never a stray mark`, async ({ page }) => {
    const chapter = await openChapterPage(page, theme);
    const [card, frame] = await Promise.all([
      chapter.boundingBox(),
      chapter.locator(".recipe-card__chapter-frame").evaluate((el) => {
        if (getComputedStyle(el).display === "none") return null;
        const box = el.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    ]);
    if (frame === null) return;
    expect(card).not.toBeNull();
    // Drawn at all, it goes round the page: most of its width and height.
    expect(frame.width).toBeGreaterThan(card!.width / 2);
    expect(frame.height).toBeGreaterThan(card!.height / 2);
  });
}
