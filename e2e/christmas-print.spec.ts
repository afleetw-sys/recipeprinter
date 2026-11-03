import { expect, test } from "./guarded";

/**
 * Christmas's Santa hats printed as blurry blocks from Chrome. The hats were an
 * SVG that drew each hat as a pattern fill, and Chrome's PDF turns a pattern
 * into a low-resolution bitmap of its own. The hats now go into the PDF as
 * the image itself, at its own resolution.
 *
 * Checked on the PDF Chrome makes: the hats are an image in it at least 2000px
 * wide (the art is 3000), on a recipe card and on a Full Page sheet. A card
 * opened from session storage: no import, nothing billed.
 */

test("Christmas's hats go into Chrome's PDF at full resolution", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "only Chromium makes a PDF");

  for (const cardSize of ["card-6x4", "letter"]) {
    await page.addInitScript((cardSize) => {
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
      localStorage.setItem("recipeprinter:print-settings:v1", JSON.stringify({ cardSize }));
    }, cardSize);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/print");
    await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible({ timeout: 60_000 });

    const christmas = page.locator(".recipe-template-option--christmas").filter({ visible: true });
    if ((await christmas.count()) === 0) await page.getByRole("button", { name: /seasonal themes/i }).click();
    await christmas.first().click();
    await expect(page.locator("#recipe-page-deck .recipe-template--christmas").first()).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll<HTMLImageElement>("#recipe-page-deck .recipe-card__christmas-hats")).every(
            (img) => img.complete && img.naturalWidth > 0,
          ),
        ),
      )
      .toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event("beforeprint")));

    const pdf = (await page.pdf({ preferCSSPageSize: true, printBackground: true })).toString("latin1");
    const widths = Array.from(pdf.matchAll(/\/Subtype\s*\/Image[^>]*?\/Width\s+(\d+)/g), (m) => Number(m[1]));
    const widthsFirst = Array.from(pdf.matchAll(/\/Width\s+(\d+)[^>]*?\/Subtype\s*\/Image/g), (m) => Number(m[1]));
    expect(Math.max(0, ...widths, ...widthsFirst), cardSize).toBeGreaterThanOrEqual(2000);
  }
});
