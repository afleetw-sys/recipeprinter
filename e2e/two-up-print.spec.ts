import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { firestoreRunning, grantPro, returningUser, signIn } from "./account";

/**
 * Two 4x6 cards on a Letter sheet get cut out, and a duplex printer never puts
 * the back exactly where the front is: it shrinks or shifts it by a millimetre
 * or so. When a card's colour stopped at the cut line, that millimetre showed
 * as a white sliver down the back's left and right edges. Every face, front
 * and back, now carries its edge out past the cut line, so the cut lands in
 * colour on both sides.
 *
 * Checked on every theme, with cut lines on (the bleed comes with them):
 * wherever a face is coloured just inside its edge, it is coloured just
 * outside it too. Real paint, so a real browser.
 *
 * Two-per-sheet is Pro with two recipes, so a Pro account (see e2e/account.ts)
 * with two recipes opened from session storage: no import, nothing billed.
 */

test.beforeEach(async ({ request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
});

const recipe = (id: string, title: string) => ({
  id,
  method: "manual",
  source: "test",
  status: "ready",
  title,
  addedAt: 0,
  recipe: {
    title,
    // Long enough to run onto the back of its card.
    ingredients: Array.from({ length: 26 }, (_, i) => ({ raw: `${i + 1} cup ingredient number ${i + 1}, chopped` })),
    instructions: Array.from({ length: 13 }, (_, i) => ({ step: i + 1, text: `Stir the pot well and keep it at a low simmer, step ${i + 1}.` })),
  },
});

/** Every face that misses its bleed: a point just inside its edge in colour
    with the point as far outside it left as paper. */
async function facesMissingBleed(page: Page): Promise<string[]> {
  const misses: string[] = [];
  const pages = page.locator(".rp-twoup__page");
  for (let p = 0; p < (await pages.count()); p++) {
    const sheet = pages.nth(p);
    const png = await sheet.screenshot();
    const sheetBox = (await sheet.boundingBox())!;
    const cards = await sheet.locator(".rp-twoup__slot > .recipe-card").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }),
    );
    const found = await page.evaluate(
      async ({ data, cards, origin, sheetIndex }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const scale = img.width / origin.width;
        const at = (x: number, y: number) => {
          const d = ctx.getImageData(Math.round((x - origin.x) * scale), Math.round((y - origin.y) * scale), 1, 1).data;
          return [d[0], d[1], d[2]];
        };
        const paper = (c: number[]) => Math.min(...c) > 250;
        // A sliver you would see: colour inside, paper outside, and far enough
        // apart to tell (Heirloom's top is 250 against paper's 255).
        const sliver = (inside: number[], outside: number[]) =>
          paper(outside) && !paper(inside) && Math.max(...inside.map((v, i) => Math.abs(v - outside[i]))) > 12;
        const out: string[] = [];
        const IN = 7; // px inside the cut, the same distance as outside
        const OUT = 7; // px outside it, past the cut line (a printer off by up to ~2mm)
        cards.forEach((card, cardIndex) => {
          const sides: [string, (t: number) => [number, number], (t: number) => [number, number]][] = [
            ["left", (t) => [card.left + IN, t], (t) => [card.left - OUT, t]],
            ["right", (t) => [card.right - IN, t], (t) => [card.right + OUT, t]],
            ["top", (t) => [t, card.top + IN], (t) => [t, card.top - OUT]],
            ["bottom", (t) => [t, card.bottom - IN], (t) => [t, card.bottom + OUT]],
          ];
          for (const [side, inside, outside] of sides) {
            const vertical = side === "left" || side === "right";
            const [from, to] = vertical ? [card.top, card.bottom] : [card.left, card.right];
            for (let i = 1; i < 10; i++) {
              const t = from + ((to - from) * i) / 10;
              if (sliver(at(...inside(t)), at(...outside(t)))) {
                out.push(`sheet ${sheetIndex + 1} card ${cardIndex + 1} ${side}`);
                break;
              }
            }
          }
        });
        return out;
      },
      { data: png.toString("base64"), cards, origin: sheetBox, sheetIndex: p },
    );
    misses.push(...found);
  }
  return misses;
}

test("two cards on a sheet carry every theme's edge past the cut line, front and back", async ({ page, request }) => {
  test.setTimeout(240_000);
  const { email, uid } = await returningUser(request);
  await grantPro(request, uid);
  await signIn(page, email);

  await page.addInitScript((items) => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify(items));
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: items.map((item) => item.id) }));
    localStorage.setItem(
      "recipeprinter:print-settings:v1",
      JSON.stringify({ cardSize: "card-6x4", doubleSided: true, twoPerSheet: true, showCutLines: true, showPhoto: false, showRecipeLink: false }),
    );
  }, [recipe("r1", "Lemon Chicken"), recipe("r2", "Pea Soup")]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/print");
  await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible({ timeout: 60_000 });

  // The seasonal themes sit behind their own toggle.
  const seasonal = page.getByRole("button", { name: /seasonal/i }).filter({ visible: true });
  if (await seasonal.count()) await seasonal.first().click();
  const themes = await page
    .locator(".recipe-template-option")
    .filter({ visible: true })
    .evaluateAll((tiles) => Array.from(new Set(tiles.map((tile) => /recipe-template-option--([a-z]+)/.exec(tile.className)![1]))));
  expect(themes.length).toBeGreaterThan(10);

  const missing: string[] = [];
  for (const theme of themes) {
    await page.emulateMedia({ media: "screen" });
    await page.locator(`.recipe-template-option--${theme}`).filter({ visible: true }).first().click();
    await expect(page.locator(`#recipe-page-deck .recipe-template--${theme}`).first()).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
    await expect(page.locator(".rp-twoup__page--back .recipe-card").first()).toBeAttached();
    await page.emulateMedia({ media: "print" });
    await expect(page.locator(".rp-twoup__page").first()).toBeVisible();
    missing.push(...(await facesMissingBleed(page)).map((miss) => `${theme}: ${miss}`));
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  }
  expect(missing).toEqual([]);
});
