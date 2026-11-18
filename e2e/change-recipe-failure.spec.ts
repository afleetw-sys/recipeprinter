import { expect, test } from "./guarded";
import reply from "./fixtures/cookpilot-reply.json";

/**
 * Change recipe swaps the recipe on screen for the one the cook brings in. When
 * that import fails, the failure still takes the recipe's place: the cook asked
 * for the old one to go. It used to stay, with the failed card added below it.
 *
 * The CookPilot stand-in (e2e/stubs/cookpilot.mjs) answers the wikipedia.org
 * link with a recipe; the example.com one has nothing behind it. Nothing is
 * fetched and no scraper is billed.
 */

const GOOD = "https://www.wikipedia.org/recipes/lemon-herb-chicken";
const BAD = "https://example.com/recipes/anything";

test("a Change recipe that fails replaces the recipe with the failure", async ({ page }) => {
  await page.goto("/");
  const field = page.getByPlaceholder("Paste a recipe link").first();
  const oldCard = page.locator(".recipe-card").filter({ hasText: reply.recipe.title });
  // Typed before hydration the link is wiped, so retry until the recipe lands.
  await expect(async () => {
    await field.fill(GOOD);
    await field.press("Enter");
    await expect(oldCard.first()).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 40_000 });

  await page.getByRole("button", { name: /Change recipe/ }).filter({ visible: true }).first().click();
  const link = page.getByRole("dialog").getByPlaceholder("Paste a recipe link");
  await link.fill(BAD);
  await link.press("Enter");

  await expect(page.locator("[data-failed-import-id]")).toHaveCount(1);
  await expect(oldCard).toHaveCount(0);
});
