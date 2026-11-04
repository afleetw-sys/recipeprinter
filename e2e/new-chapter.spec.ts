import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { deckSettled } from "./workspace";

/**
 * A chapter made from anywhere opens on its own page with its name ready to
 * type over: the page is the one in view, its title is the field with focus,
 * and "New chapter" is selected, so the first key replaces it. The name used
 * to open with the caret at its start, so typing "Soups" made
 * "SoupsNew chapter" (Amelia, 2026-11-03), and a chapter made from the move
 * menu didn't go to its page at all.
 *
 * Desktop: both ways in live in the page rail and the page toolbar. The book
 * is opened from session storage, so nothing is imported or billed.
 */
test.skip(({ isMobile }) => isMobile, "the add and move menus are the desktop rail and toolbar");

const recipe = (id: string, title: string) => ({
  id,
  method: "manual",
  source: "test",
  status: "ready",
  title,
  addedAt: 0,
  recipe: { title, ingredients: [{ raw: "1 cup flour" }], instructions: [{ step: 1, text: "Mix and bake." }] },
});

async function openBook(page: Page) {
  // Wide enough that the page toolbar holds Move itself rather than under More.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.addInitScript((items) => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    const queue = JSON.parse(items) as Array<{ id: string }>;
    sessionStorage.setItem("recipeprinter:queue:v1", items);
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: queue.map((item) => item.id) }));
    sessionStorage.setItem(
      "recipeprinter:project-meta:v1",
      JSON.stringify({ cookbookIntent: true, sections: [{ id: "s1", title: "Dinners", itemIds: queue.map((item) => item.id) }] }),
    );
  }, JSON.stringify([recipe("r1", "Lemon Chicken"), recipe("r2", "Banana Bread")]));
  await page.goto("/print");
  await expect(page.locator(".cookbook-welcome")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cookbook-welcome")).toHaveCount(0);
}

const WAYS: Array<{ name: string; add: (page: Page) => Promise<void> }> = [
  {
    name: "the rail's add menu",
    add: async (page) => {
      await page.getByRole("button", { name: "More add options" }).click();
      await page.getByRole("menuitem", { name: "Add chapter" }).click();
    },
  },
  {
    name: "a recipe's move menu",
    add: async (page) => {
      await page.getByRole("button", { name: /^\d+ Lemon Chicken$/ }).click();
      await deckSettled(page);
      await page.getByRole("button", { name: "Move to another chapter" }).click();
      await page.getByRole("menu").getByRole("menuitem", { name: "Add chapter" }).click();
    },
  },
];

for (const way of WAYS) {
  test(`a chapter made from ${way.name} opens with its name selected on its page`, async ({ page }) => {
    await openBook(page);
    await way.add(page);

    const title = page.locator(".recipe-page-canvas textarea.recipe-card__divider-title");
    await expect(title).toBeFocused();
    await expect
      .poll(() =>
        title.evaluate((field: HTMLTextAreaElement) => [field.selectionStart, field.selectionEnd, field.value.length]),
      )
      .toEqual([0, "New chapter".length, "New chapter".length]);

    await page.keyboard.type("Soups");
    await expect(title).toHaveValue("Soups");
  });
}
