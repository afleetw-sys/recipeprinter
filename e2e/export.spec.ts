import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
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

/** The fixture book in `template`, its chapter opener carrying a photo, and its
    first recipe long enough to run onto a second page. */
function themedBook(template: string) {
  const book = structuredClone(fixture);
  book.project.settings.template = template;
  (book.project.sections[0] as { cardPhotoUrl?: string }).cardPhotoUrl = "/images/chapter-photo-fixture.png";
  const recipe = book.project.sections[0].items[0].recipe;
  recipe.ingredients = Array.from({ length: 30 }, (_, i) => ({ raw: `${i + 1} cups of ingredient ${i + 1}` }));
  recipe.instructions = Array.from({ length: 26 }, (_, i) => ({
    step: i + 1,
    text: `Step ${i + 1}: stir the pot slowly and keep going until everything is combined.`,
  }));
  return book;
}

/** A 1x1 photo, so the chapter opener has an image without the network. */
async function servePhoto(page: Page) {
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYGAAAAAEAAH2FzhVAAAAAElFTkSuQmCC",
    "base64",
  );
  await page.route("**/images/chapter-photo-fixture.png", (route) =>
    route.fulfill({ contentType: "image/png", body: png }),
  );
}

// A chapter opener draws none of its theme's decoration, so it must not keep
// the gutter a theme reserves for one either. Bistro, Pantry and Quilt kept
// their spine's gutter, and the photo sat off-centre with a grey strip of text
// scrim beside it. Heirloom and Keepsake frame a small photo on purpose, so
// they are left out.
test("a chapter opener's photo sits centred on the page in every band theme", async ({ page }) => {
  await servePhoto(page);
  const misplaced: string[] = [];
  for (const template of [
    "classic", "pantry", "typewriter", "bistro", "diner", "supper", "poster",
    "market", "garden", "counter", "quilt", "christmas",
  ]) {
    await openExport(page, themedBook(template));
    const [left, right] = await page.$eval(".recipe-card--chapter-with-photo", (card) => {
      const photo = card.querySelector(".recipe-card__chapter-photo")!.getBoundingClientRect();
      const sheet = card.closest(".recipe-card-page")!.getBoundingClientRect();
      return [photo.left - sheet.left, sheet.right - photo.right];
    });
    if (Math.abs(left - right) > 1) misplaced.push(`${template}: ${left.toFixed(1)}px left, ${right.toFixed(1)}px right`);
  }
  expect(misplaced).toEqual([]);
});
