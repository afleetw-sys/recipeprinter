import { expect, test } from "./guarded";
import reply from "./fixtures/cookpilot-reply.json";

/**
 * Importing a recipe by link, through the real /api/parse route. The route's
 * CookPilot parser is the local stand-in (e2e/stubs/cookpilot.mjs), whose
 * answer was produced by CookPilot's real parser, so nothing is fetched and no
 * scraper is billed. The link has to be a real public address to get past the
 * route's own checks; the stand-in answers before anything would fetch it.
 */

const LINK = "https://www.wikipedia.org/recipes/lemon-herb-chicken";
const ingredients = reply.recipe.ingredientSections.flatMap((section) => section.ingredients);
const steps = reply.recipe.instructionSections.flatMap((section) => section.instructions);

async function importLink(page: import("@playwright/test").Page, link: string) {
  await page.goto("/");
  const field = page.getByPlaceholder("Paste a recipe link");
  await field.fill(link);
  await field.press("Enter");
  await expect(page).toHaveURL(/\/print$/);
}

test("a pasted link becomes a printable recipe with every ingredient and step", async ({ page }) => {
  await importLink(page, LINK);

  const card = page.locator(".recipe-card").filter({ hasText: reply.recipe.title }).first();
  await expect(card).toBeVisible();
  for (const ingredient of ingredients) {
    await expect(card.getByText(ingredient.name, { exact: false }).first()).toBeVisible();
  }
  for (const step of steps) {
    await expect(card.getByText(step.text, { exact: false }).first()).toBeVisible();
  }
});

test("a link with nothing behind it says so, and offers another way in", async ({ page }) => {
  await importLink(page, "https://example.com/recipes/anything");

  await expect(page.getByText("That recipe didn't import")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try another way" })).toBeVisible();
});
