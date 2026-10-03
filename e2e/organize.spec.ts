import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * The cookbook organizer's search, readiness filter and pictures switch, on a
 * book opened straight from session storage (no import, nothing billed).
 *
 * The wide organizer is a desktop layout; phones reorder in their own sheet.
 */
test.skip(({ isMobile }) => isMobile, "the organizer is the desktop rail");

const recipe = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  id,
  method: "manual",
  source: "test",
  status: "ready",
  title,
  addedAt: 0,
  recipe: {
    title,
    ingredients: [{ raw: "1 cup flour" }],
    instructions: [{ step: 1, text: "Mix and bake." }],
    image: "/images/tomatoes.svg",
    ...extra,
  },
});

const BOOK = [
  recipe("r1", "Lemon Chicken"),
  recipe("r2", "Banana Bread", { image: undefined }),
  recipe("r3", "Oregano Potatoes", { note: "Grandma's version" }),
];

async function openOrganizer(page: Page) {
  await page.addInitScript((items) => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    const queue = JSON.parse(items) as Array<{ id: string }>;
    sessionStorage.setItem("recipeprinter:queue:v1", items);
    sessionStorage.setItem(
      "recipeprinter:print-job:current:v1",
      JSON.stringify({ ids: queue.map((item) => item.id) }),
    );
    sessionStorage.setItem(
      "recipeprinter:project-meta:v1",
      JSON.stringify({
        cookbookIntent: true,
        sections: [{ id: "s1", title: "Dinners", itemIds: queue.map((item) => item.id) }],
      }),
    );
  }, JSON.stringify(BOOK));
  await page.goto("/print");
  await page.locator(".recipe-page-rail__organize").click();
  await expect(page.locator(".recipe-organize-bar")).toBeVisible();
}

const tiles = (page: Page) => page.locator(".recipe-print-shell--organizing [data-rail-recipe]");

test("search finds a recipe by more than its title, and leaving clears it", async ({ page }) => {
  await openOrganizer(page);
  await expect(tiles(page)).toHaveCount(3);

  await page.getByRole("button", { name: "Search recipes" }).click();
  await page.getByRole("searchbox", { name: "Search recipes" }).fill("grandma");
  await expect(tiles(page)).toHaveCount(1);
  await expect(tiles(page)).toContainText("Oregano Potatoes");

  await page.getByRole("button", { name: "Back to pages" }).click();
  await page.locator(".recipe-page-rail__organize").click();
  await expect(tiles(page)).toHaveCount(3);
});

test("the filter shows only what still needs work, and the toolbar shows it is on", async ({ page }) => {
  await openOrganizer(page);
  const filter = page.getByRole("button", { name: "Filter recipes" });
  const sort = page.getByRole("button", { name: "Sort recipes" });
  const look = (locator: typeof filter) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.borderColor} ${style.backgroundColor}`;
    });
  const idle = await look(sort);

  await filter.click();
  await page.getByRole("menuitemradio", { name: /No photo/ }).click();
  await expect(tiles(page)).toHaveCount(1);
  await expect(tiles(page)).toContainText("Banana Bread");

  // Every selectable toolbar button, not only Filter: an active one has to look it.
  await page.mouse.move(0, 0);
  expect(await look(filter)).not.toBe(idle);
  await sort.click();
  await page.getByRole("menuitemradio", { name: /A–Z/ }).click();
  await page.mouse.move(0, 0);
  expect(await look(sort)).not.toBe(idle);
});

test("pictures can be switched off, and the choice is remembered", async ({ page }) => {
  await openOrganizer(page);
  const thumbs = tiles(page).locator(".recipe-page-rail__thumb");
  await expect(thumbs).toHaveCount(3);

  await page.getByRole("button", { name: "Show page pictures" }).click();
  await expect(thumbs).toHaveCount(0);
  await expect(tiles(page)).toHaveCount(3);

  await page.reload();
  await page.locator(".recipe-page-rail__organize").click();
  await expect(tiles(page)).toHaveCount(3);
  await expect(thumbs).toHaveCount(0);
});
