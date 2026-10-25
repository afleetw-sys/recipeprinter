import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import fixture from "../monitoring/export-fixture.json";
import { RECIPE_PRINT_TEMPLATE_OPTIONS } from "../lib/printTemplates";

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

// A cover's accent band runs along its top edge. Fall's leaves sit in that
// corner, and the band was drawn over them. Every theme's front and back
// cover: wherever the band shows, none of the theme's art is under it.
test("a cover's band never lies over its theme's art", async ({ page }) => {
  const covered: string[] = [];
  for (const { id: template } of RECIPE_PRINT_TEMPLATE_OPTIONS) {
    const book = structuredClone(fixture);
    book.project.settings.template = template;
    (book.project as { backCover?: unknown }).backCover = { title: "The end" };
    await openExport(page, book);
    covered.push(
      ...(await page.$$eval(".recipe-card--cover", (covers) =>
        covers.flatMap((cover) => {
          const band = cover.querySelector(".recipe-card__cover-band");
          const bandBox = band?.getBoundingClientRect();
          if (!bandBox || bandBox.width === 0 || bandBox.height === 0) return [];
          return Array.from(cover.querySelectorAll<HTMLImageElement>("img[aria-hidden]"))
            .filter((art) => {
              const box = art.getBoundingClientRect();
              return (
                box.width > 0 &&
                box.left < bandBox.right &&
                box.right > bandBox.left &&
                box.top < bandBox.bottom &&
                box.bottom > bandBox.top
              );
            })
            .map((art) => `${cover.className.match(/cover-(front|back)/)?.[0]}: ${art.className}`);
        }),
      )).map((hit) => `${template} ${hit}`),
    );
  }
  expect(covered).toEqual([]);
});

// The contents page set its heading at a fixed 0.8in / 0.85in while a recipe
// page uses its theme's own padding, so turning from the contents to a recipe
// the heading jumped down and in. In every theme, the contents heading starts
// where a recipe's title does. Left out: Poster, whose title sits in a block of
// its own, and Counter, whose photo-less titles drop 0.5in to clear a band the
// contents page doesn't draw.
test("the contents heading starts where a recipe title does, in every theme", async ({ page }) => {
  const misplaced: string[] = [];
  for (const { id: template } of RECIPE_PRINT_TEMPLATE_OPTIONS) {
    if (template === "poster" || template === "counter") continue;
    const book = structuredClone(fixture);
    book.project.settings.template = template;
    await openExport(page, book);
    const [toc, title] = await page.evaluate(() => {
      const fromPage = (el: Element) => {
        const sheet = el.closest(".recipe-card-page")!.getBoundingClientRect();
        const box = el.getBoundingClientRect();
        return { top: (box.top - sheet.top) / 96, left: (box.left - sheet.left) / 96 };
      };
      return [
        fromPage(document.querySelector(".recipe-card__toc-kicker")!),
        fromPage(document.querySelector(".recipe-card__title")!),
      ];
    });
    if (Math.abs(toc.top - title.top) > 0.06 || Math.abs(toc.left - title.left) > 0.06) {
      misplaced.push(
        `${template}: contents at ${toc.top.toFixed(2)}in down, ${toc.left.toFixed(2)}in in; ` +
          `recipe title at ${title.top.toFixed(2)}in, ${title.left.toFixed(2)}in`,
      );
    }
  }
  expect(misplaced).toEqual([]);
});

/** The fixture book with a first recipe that runs over several pages, at a
    text size. */
function bookAt(fontScale: number) {
  const book = structuredClone(fixture);
  (book.project.settings as { fontScale?: number }).fontScale = fontScale;
  const recipe = book.project.sections[0].items[0].recipe;
  recipe.title = "A Very Long Stew";
  recipe.ingredients = Array.from({ length: 30 }, (_, i) => ({ raw: `${i + 1} cups of ingredient number ${i + 1}, chopped` }));
  recipe.instructions = Array.from({ length: 24 }, (_, i) => ({
    step: i + 1,
    text: `Step ${i + 1}: stir the pot slowly and keep going until everything is thoroughly combined and hot.`,
  }));
  return book;
}

const recipeFaceCount = (page: Page, within = "body") =>
  page.$$eval(`${within} article.recipe-card[data-in-book]`, (faces) =>
    faces.filter((face) => !face.closest(".recipe-face-measurer, .recipe-card__section-groups--probe")).length,
  );

const stepsOnFirstRecipePage = (page: Page) =>
  page.$$eval("article.recipe-card[data-in-book]", (faces) => {
    const first = faces.find((face) => !face.closest(".recipe-face-measurer"));
    return first
      ? Array.from(first.querySelectorAll(".recipe-card__method li")).filter(
          (li) => !li.closest(".recipe-card__section-groups--probe"),
        ).length
      : 0;
  });

/** The same book in the print page's preview, opened from session storage. */
async function openPreview(page: Page, book: Payload) {
  const items = book.project.sections.flatMap((section) => section.items);
  const settings = book.project.settings as Record<string, unknown>;
  await page.addInitScript(
    ({ items, meta, settings }) => {
      if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
      sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify(items));
      sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: items.map((i) => i.id) }));
      sessionStorage.setItem("recipeprinter:project-meta:v1", JSON.stringify(meta));
      localStorage.setItem("recipeprinter:print-settings:v1", JSON.stringify(settings));
    },
    {
      items,
      meta: {
        cookbookIntent: true,
        cookbookWelcomeCompleted: true,
        cover: book.project.cover,
        tableOfContents: settings.tableOfContents,
        sections: book.project.sections.map((section) => ({
          id: section.id,
          title: section.title,
          itemIds: section.items.map((item) => item.id),
        })),
      },
      settings: {
        cardSize: settings.cardSize,
        template: settings.template,
        doubleSided: settings.doubleSided,
        showPhoto: settings.showPhoto,
        showRecipeLink: settings.showSourceUrl,
        fontScale: settings.fontScale,
      },
    },
  );
  await page.goto("/print");
  await expect(page.locator("#recipe-page-deck article.recipe-card[data-in-book]").first()).toBeAttached();
  await expect(page.locator(".recipe-print-shell--measuring")).toHaveCount(0);
}

// The renderer measures the book again in its own browser. Handed the text
// size only for drawing, it would paginate at Normal and print bigger text
// into those pages, off their bottoms. So: the book at Biggest stays inside
// its pages, has the pages the preview gave it, and its first recipe page
// holds fewer steps than at Normal (or the size never reached the measurement).
test("a cookbook at the biggest text size exports the pages its preview shows, inside them", async ({ page, browser }) => {
  await openExport(page, bookAt(1.2));
  expect(await overflowingContent(page)).toEqual([]);
  expect(
    await page
      .locator(".recipe-print-preview:not(.recipe-face-measurer):has(article.recipe-card[data-in-book])")
      .first()
      .evaluate((el) => getComputedStyle(el).getPropertyValue("--recipe-font-scale")),
  ).toBe("1.2");
  const exported = await recipeFaceCount(page);

  const normal = await browser.newPage();
  await openExport(normal, bookAt(1));
  expect(await stepsOnFirstRecipePage(page), "steps on page one, Biggest against Normal").toBeLessThan(
    await stepsOnFirstRecipePage(normal),
  );
  await normal.close();

  const preview = await browser.newPage();
  await openPreview(preview, bookAt(1.2));
  // The deck draws only the pages near the reader; asked to print, all of them.
  await preview.evaluate(() => window.dispatchEvent(new Event("beforeprint")));
  expect(await recipeFaceCount(preview, "#recipe-page-deck")).toBe(exported);
  await preview.close();
});
