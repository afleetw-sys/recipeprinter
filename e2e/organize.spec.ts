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
  recipe("r4", "Plain Toast", { instructions: [] }),
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
  await expect(tiles(page)).toHaveCount(4);

  await page.getByRole("button", { name: "Search recipes" }).click();
  await page.getByRole("searchbox", { name: "Search recipes" }).fill("grandma");
  await expect(tiles(page)).toHaveCount(1);
  await expect(tiles(page)).toContainText("Oregano Potatoes");

  await page.getByRole("button", { name: "Back to pages" }).click();
  await page.locator(".recipe-page-rail__organize").click();
  await expect(tiles(page)).toHaveCount(4);
});

test("filters stack, the button counts them, and they clear from the menu", async ({ page }) => {
  await openOrganizer(page);
  const filter = page.getByRole("button", { name: /^Filter recipes/ });
  const badge = page.locator(".recipe-organize-bar__filter-badge");
  await expect(badge).toHaveCount(0);

  await filter.click();
  await page.getByRole("menuitemcheckbox", { name: /No photo/ }).click();
  await expect(tiles(page)).toHaveCount(1);
  await expect(tiles(page)).toContainText("Banana Bread");
  await expect(badge).toHaveText("1");

  // The menu stays open for a second tick, and a recipe with EITHER problem shows.
  await page.getByRole("menuitemcheckbox", { name: /No steps/ }).click();
  await expect(tiles(page)).toHaveCount(2);
  await expect(badge).toHaveText("2");

  await page.getByRole("menuitem", { name: "Clear filters" }).click();
  await expect(tiles(page)).toHaveCount(4);
  await expect(badge).toHaveCount(0);
});

test("an active toolbar button looks active", async ({ page }) => {
  await openOrganizer(page);
  const filter = page.getByRole("button", { name: /^Filter recipes/ });
  const sort = page.getByRole("button", { name: "Sort recipes" });
  const look = (locator: typeof filter) =>
    locator.evaluate((el) => {
      const style = getComputedStyle(el);
      return `${style.borderColor} ${style.backgroundColor}`;
    });
  const idle = await look(sort);

  await filter.click();
  await page.getByRole("menuitemcheckbox", { name: /No photo/ }).click();
  await page.keyboard.press("Escape");
  await page.mouse.move(0, 0);
  expect(await look(filter)).not.toBe(idle);

  await sort.click();
  await page.getByRole("menuitemradio", { name: /A–Z/ }).click();
  await page.mouse.move(0, 0);
  expect(await look(sort)).not.toBe(idle);
});

test("the preview and settings stay usable beside the organizer", async ({ page }) => {
  await openOrganizer(page);
  for (const panel of [".recipe-page-canvas", ".recipe-config-panel"]) {
    const style = await page.locator(`.recipe-print-shell > ${panel}`).evaluate((el) => {
      const computed = getComputedStyle(el);
      return { opacity: computed.opacity, pointerEvents: computed.pointerEvents };
    });
    expect(style, panel).toEqual({ opacity: "1", pointerEvents: "auto" });
  }
});

test("the rail can be dragged narrower, separately in each mode, and stays that way", async ({ page }) => {
  await openOrganizer(page);
  const rail = page.locator(".recipe-print-shell > .recipe-page-rail");
  const width = async () => (await rail.boundingBox())!.width;
  const drag = async (name: string, by: number) => {
    const box = (await page.getByRole("separator", { name }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + by / 2, y);
    await page.mouse.move(x + by, y);
    await page.mouse.up();
  };

  const organizeBefore = await width();
  await drag("Resize organizer", -200);
  const organizeAfter = await width();
  expect(organizeAfter).toBeLessThan(organizeBefore - 150);

  // The page rail keeps its own width.
  await page.getByRole("button", { name: "Back to pages" }).click();
  await expect.poll(width).toBeLessThan(300);
  const pagesBefore = await width();
  await drag("Resize pages panel", 60);
  await expect.poll(width).toBeGreaterThan(pagesBefore + 40);

  await page.reload();
  await page.locator(".recipe-page-rail__organize").click();
  await expect.poll(width).toBeLessThan(organizeAfter + 2);
  await expect.poll(width).toBeGreaterThan(organizeAfter - 2);
});

test("the organizer lists recipes by name, without page pictures", async ({ page }) => {
  await openOrganizer(page);
  await expect(tiles(page)).toHaveCount(4);
  await expect(tiles(page).locator(".recipe-page-rail__thumb")).toHaveCount(0);

  // The page rail keeps its pictures.
  await page.getByRole("button", { name: "Back to pages" }).click();
  await expect(page.locator("[data-rail-recipe] .recipe-page-rail__thumb").first()).toBeVisible();
});
