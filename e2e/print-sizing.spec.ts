import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * A printed recipe card's page box must be the SHEET's size, in inches, in
 * every engine — never something derived from the browser window.
 *
 * Safari resolves print `vh` against the on-screen window, not the paper. A 6x4
 * page box of `100vh` came out ~8in tall there, so every card was centered
 * across a sheet break: title and photo at the bottom of one 4x6 sheet, the
 * ingredients on the next (customer report, 2026-10-01). Chrome resolves `vh`
 * against the paper, which is why it never showed there and why this runs in
 * the WebKit project too.
 *
 * Safari also prints CSS inches at a scale set by the document's WIDTH (the
 * wider of the content and 1.25x the paper width in points), so the box has to
 * be exactly sheet-wide as well: a box narrower than the paper made the card
 * the widest thing on the page, it printed ~4% large, and spilled a blank sheet
 * after every card.
 *
 * Playwright cannot print to PDF in WebKit, so this checks the layout that
 * print produces: print media, two very different window heights, and the
 * same answer from both. The real WebKit print path was verified with a
 * WKWebView printOperation harness against these same numbers.
 */

const DPI = 96;
const SHEETS = {
  "card-6x4": { width: 6 * DPI, height: 4 * DPI },
  letter: { width: 8.5 * DPI, height: 11 * DPI },
} as const;

const recipes = ["Buckeyes", "Chicken Parm Pasta"].map((title, index) => ({
  id: `print-sizing-${index}`,
  method: "text",
  source: "test",
  status: "ready",
  title,
  recipe: {
    title,
    servings: "4",
    ingredients: Array.from({ length: 6 }, (_, i) => ({ raw: `${i + 1} cup ingredient ${i + 1}` })),
    instructions: Array.from({ length: 4 }, (_, i) => ({ step: i + 1, text: `Step ${i + 1}: stir.` })),
  },
}));

async function openPrint(page: Page, size: keyof typeof SHEETS) {
  await page.addInitScript((items) => {
    sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify(items));
    sessionStorage.setItem(
      "recipeprinter:print-job:current:v1",
      JSON.stringify({ ids: items.map((item) => item.id) }),
    );
  }, recipes);
  await page.goto(`/print?ids=${recipes.map((r) => r.id).join(",")}&size=${size}`);
  await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible();
  // What `beforeprint` does: draw every page, not just the window around the reader.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
}

/** Each printed page box, and the card inside it, in CSS px. */
function pageBoxes(page: Page) {
  return page.$$eval("#recipe-page-deck .recipe-card-page", (boxes) =>
    boxes.map((box) => {
      const outer = box.getBoundingClientRect();
      const card = box.querySelector(".recipe-card")!.getBoundingClientRect();
      return {
        width: Math.round(outer.width),
        height: Math.round(outer.height),
        cardTop: Math.round(card.top - outer.top),
        cardBottom: Math.round(card.bottom - outer.top),
      };
    }),
  );
}

for (const size of Object.keys(SHEETS) as (keyof typeof SHEETS)[]) {
  test(`a ${size} card's printed page is sheet-sized whatever the window height`, async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "iphone", "phones print through the share sheet, not this layout");
    const sheet = SHEETS[size];
    // The 6x4 box is 0.5in wider than the card, not sheet-wide, so it still
    // fits one sheet once a printer's margins shrink it (see the "PRINTABLE
    // area" rule in print.css).
    const expectedWidth = size === "card-6x4" ? 6.25 * DPI : sheet.width;
    const measured = [];
    for (const height of [600, 1400]) {
      await page.setViewportSize({ width: 1280, height });
      await openPrint(page, size);
      measured.push(await pageBoxes(page));
    }
    const [short, tall] = measured;
    expect(short.length).toBe(recipes.length);
    // The window must not move the page box at all.
    expect(tall).toEqual(short);
    for (const box of short) {
      // Exactly sheet-wide (Safari's print scale), no taller than the sheet,
      // and the whole card inside it.
      expect(box.width).toBe(expectedWidth);
      expect(box.height).toBeLessThanOrEqual(sheet.height);
      expect(box.cardTop).toBeGreaterThanOrEqual(0);
      expect(box.cardBottom).toBeLessThanOrEqual(box.height);
    }
  });
}
