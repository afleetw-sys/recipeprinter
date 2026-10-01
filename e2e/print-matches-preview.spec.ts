import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * What prints is what the preview shows. Every card, front and back, in every
 * engine — including the cards nobody scrolled to.
 *
 * Each of these broke on 2026-10-01, and each looked fine on screen:
 * - the back of a card printed in one column where the preview had two;
 * - cards far down the deck, never drawn until Print was pressed, printed
 *   with a different layout the first time than the second;
 * - in Safari, a card's steps landed at its bottom under an empty gap.
 *
 * So this compares where every ingredient, step and section title sits inside
 * its card three ways: the settled preview; the deck at the instant a print
 * starts (`beforeprint`, straight after the page loads, the far cards still
 * undrawn); and the deck in print media. Positions are fractions of the card,
 * so the preview's on-screen scaling drops out.
 *
 * What this can't reach: the print engine's own page splitting. Playwright
 * only prints to PDF in Chromium, so the page count is checked there (below);
 * WebKit's real pagination — the Safari bug above — needs a person and a
 * printer (docs/print-checklist.md).
 */

const sectioned = {
  title: "Buckeyes",
  servings: "60",
  ingredients: [
    ...["peanut butter", "softened butter", "vanilla extract", "sifted confectioner's sugar"].map((raw) => ({
      raw,
      section: "Peanut Butter Filling",
    })),
    { raw: "semi sweet chocolate chips", section: "Chocolate Coating" },
  ],
  // Long enough to continue on the back, which is where the one-column bug was.
  instructions: [
    "Beat the peanut butter, softened butter and vanilla extract with an electric mixer until light and fluffy.",
    "Gradually beat in the sifted confectioner's sugar until the mixture forms a stiff, dry dough with no lumps.",
    "Roll the mixture into balls and place them on prepared baking sheets.",
    "Insert a toothpick into the top of each ball and freeze until firm.",
    "Melt the semi sweet chocolate chips in a double boiler.",
    "Dip each frozen peanut butter ball into the melted chocolate and refrigerate until the chocolate is firm.",
    ...Array.from({ length: 10 }, (_, i) => `Finishing step ${i + 1}: smooth over the toothpick hole with a fingertip, then chill again briefly.`),
  ].map((text, i) => ({ step: i + 1, text, section: i < 4 ? "Peanut Butter Filling" : "Chocolate Coating" })),
};

const short = (n: number) => ({
  title: `Weeknight Dish ${n}`,
  servings: "4",
  ingredients: Array.from({ length: 5 }, (_, i) => ({ raw: `${i + 1} cup ingredient ${i + 1}` })),
  instructions: Array.from({ length: 4 }, (_, i) => ({ step: i + 1, text: `Step ${i + 1}: stir the pot and wait.` })),
});

// The long recipe sits far down the deck, outside the pages drawn on load.
const recipes = [...Array.from({ length: 6 }, (_, i) => short(i + 1)), sectioned, short(7)].map((recipe, i) => ({
  id: `match-${i}`,
  method: "text",
  source: "test",
  status: "ready",
  title: recipe.title,
  recipe,
}));

async function openPrint(page: Page, size: string) {
  await page.addInitScript((items) => {
    sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify(items));
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: items.map((item) => item.id) }));
  }, recipes);
  await page.goto(`/print?ids=${recipes.map((r) => r.id).join(",")}&size=${size}&template=classic`);
  await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible();
  await expect(page.locator(".recipe-print-shell--measuring")).toHaveCount(0);
}

type Placed = { card: number; text: string; x: number; y: number };

/**
 * Every ingredient, step and section title, placed as a fraction of its card.
 *
 * One synchronous call, like a print snapshot: `startPrint` dispatches
 * `beforeprint` first and nothing (no effect, no observer) runs between that
 * and the reading. Faces hidden on screen are revealed for the reading only,
 * since print shows every face.
 */
function layout(page: Page, { startPrint = false } = {}) {
  return page.evaluate((startPrint) => {
    if (startPrint) window.dispatchEvent(new Event("beforeprint"));
    const hidden = Array.from(document.querySelectorAll('[data-preview-hidden="true"]'));
    hidden.forEach((el) => el.removeAttribute("data-preview-hidden"));
    try {
      const cards = Array.from(document.querySelectorAll<HTMLElement>("#recipe-page-deck .recipe-card"));
      return cards.flatMap((card, index) => {
        const box = card.getBoundingClientRect();
        return Array.from(card.querySelectorAll<HTMLElement>("li, .recipe-card__section-title"))
          .filter((el) => !el.closest(".recipe-card__section-groups--probe") && el.getBoundingClientRect().height > 0)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              card: index,
              text: (el.textContent ?? "").trim().slice(0, 48),
              x: (r.left - box.left) / box.width,
              y: (r.top - box.top) / box.height,
            };
          });
      });
    } finally {
      hidden.forEach((el) => el.setAttribute("data-preview-hidden", "true"));
    }
  }, startPrint);
}

/** Readable differences: anything missing, extra, or more than 1% of the card
    away from where the preview put it. */
function differences(actual: Placed[], preview: Placed[]) {
  const key = (p: Placed) => `card ${p.card + 1} "${p.text}"`;
  const want = new Map(preview.map((p) => [key(p), p]));
  const got = new Map(actual.map((p) => [key(p), p]));
  const out: string[] = [];
  for (const [k, p] of Array.from(want)) {
    const q = got.get(k);
    if (!q) out.push(`${k} missing`);
    else if (Math.abs(q.x - p.x) > 0.01 || Math.abs(q.y - p.y) > 0.01) {
      out.push(`${k} moved (${p.x.toFixed(2)},${p.y.toFixed(2)}) -> (${q.x.toFixed(2)},${q.y.toFixed(2)})`);
    }
  }
  for (const k of Array.from(got.keys())) if (!want.has(k)) out.push(`${k} not in the preview`);
  return out;
}

for (const size of ["card-6x4", "letter"]) {
  test(`every ${size} card prints laid out as its preview, the far ones included`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "iphone", "phones print through the share sheet, not this layout");
    await openPrint(page, size);

    // Print pressed the moment the deck is ready, before the far cards were
    // ever drawn — the case that came out different from a second print.
    const atPrintStart = await layout(page, { startPrint: true });

    await page.emulateMedia({ media: "print" });
    const printed = await layout(page);

    // Back to the screen, the print over, and the deck left to settle.
    await page.emulateMedia({ media: "screen" });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.waitForTimeout(1500);
    const preview = await layout(page);

    // The long recipe's back really is on the deck, in two columns.
    expect(preview.some((p) => p.text.includes("Finishing step 10"))).toBe(true);
    expect(differences(atPrintStart, preview), "at the moment Print was pressed").toEqual([]);
    expect(differences(printed, preview), "in print media").toEqual([]);
  });
}

test("Chromium's PDF has exactly one sheet per printed page box", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "only Chromium prints to PDF under Playwright");
  await openPrint(page, "card-6x4");
  await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  await page.emulateMedia({ media: "print" });
  const boxes = await page.$$eval(
    "#recipe-page-deck .recipe-card-page",
    (pages) => pages.filter((p) => getComputedStyle(p).display !== "none" && p.getBoundingClientRect().height > 0).length,
  );
  const pdf = await page.pdf({ width: "6in", height: "4in", printBackground: true });
  // Page objects, not the /Pages tree root.
  const sheets = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  // A card spilling past its sheet (the reason for every extra page reported)
  // shows up here as more sheets than page boxes.
  expect(sheets).toBe(boxes);
});
