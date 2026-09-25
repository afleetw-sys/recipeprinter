import { expect, test, type Page } from "@playwright/test";
import fixture from "../monitoring/export-fixture.json";

/**
 * The cookbook export page, driven exactly as the PDF renderer drives it: the
 * book is injected before navigation (`window.__RP_EXPORT__`), and the page
 * raises `data-export-ready` once layout, fonts and images have settled, or
 * `data-export-error` if it cannot. What a customer pays for is whatever this
 * page lays out, so this is where the pagination and clipping bugs live.
 */

type Payload = typeof fixture;

async function openExport(page: Page, payload: Payload) {
  await page.addInitScript((injected) => {
    (window as unknown as { __RP_EXPORT__: unknown }).__RP_EXPORT__ = injected;
  }, payload);
  await page.goto("/export");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-export-ready", "true");
  expect(await root.getAttribute("data-export-error")).toBeNull();
}

/** Every element inside a page that reaches past that page's bottom edge. */
async function overflowingContent(page: Page) {
  return page.$$eval(".recipe-card-page", (pages) =>
    pages.flatMap((sheet, index) => {
      const bottom = sheet.getBoundingClientRect().bottom;
      return Array.from(sheet.querySelectorAll<HTMLElement>("*"))
        .filter((el) => el.textContent?.trim() && el.children.length === 0)
        .filter((el) => el.getBoundingClientRect().bottom > bottom + 1)
        .map((el) => `page ${index + 1}: "${el.textContent!.trim().slice(0, 40)}"`);
    }),
  );
}

test("the monitor's fixture book lays out every recipe, inside its pages", async ({ page }) => {
  await openExport(page, fixture);

  const pages = page.locator(".recipe-card-page");
  expect(await pages.count()).toBeGreaterThanOrEqual(2);
  for (const item of fixture.project.sections.flatMap((section) => section.items)) {
    await expect(page.getByText(item.recipe.title, { exact: true }).first()).toBeAttached();
  }
  expect(await overflowingContent(page)).toEqual([]);
});

test("a recipe too long for one page continues onto the next instead of being cut off", async ({ page }) => {
  const long = structuredClone(fixture);
  const recipe = long.project.sections[0].items[0].recipe;
  recipe.title = "A Very Long Stew";
  recipe.ingredients = Array.from({ length: 40 }, (_, i) => ({ raw: `${i + 1} cups of ingredient number ${i + 1}, chopped` }));
  recipe.instructions = Array.from({ length: 30 }, (_, i) => ({
    step: i + 1,
    text: `Step ${i + 1}: stir the pot slowly and keep going until everything is thoroughly combined and hot.`,
  }));
  await openExport(page, long);

  // The last step must be on the book somewhere, and nothing may hang off a page.
  await expect(page.getByText(/Step 30: stir the pot/).first()).toBeAttached();
  expect(await overflowingContent(page)).toEqual([]);
  expect(await page.locator(".recipe-card-page").count()).toBeGreaterThan(
    await (async () => {
      const short = await page.context().newPage();
      await openExport(short, fixture);
      const count = await short.locator(".recipe-card-page").count();
      await short.close();
      return count;
    })(),
  );
});
