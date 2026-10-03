import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * The cookbook organizer, on a book opened straight from session storage (no
 * import, nothing billed).
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
