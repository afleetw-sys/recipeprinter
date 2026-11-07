import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { firestoreRunning, grantPro, returningUser, signIn } from "./account";
import { deckSettled } from "./workspace";

/**
 * "Try another way" on a failed import is the same recipe asked for again, so
 * it lands where the failed card stood. It used to go to the top of the job:
 * the loading card waited at the failed card's place, at the bottom, and the
 * deck then jumped up to the first page when the recipe arrived.
 *
 * The CookPilot stand-in (e2e/stubs/cookpilot.mjs) answers a wikipedia.org
 * link with a recipe and an example.com one with nothing, so nothing is
 * fetched and no scraper is billed.
 */

const GOOD = "https://www.wikipedia.org/recipes/lemon-herb-chicken";
const BAD = "https://example.com/recipes/anything";

test.beforeEach(async ({ request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
});

async function submitLink(page: Page, link: string) {
  const field = page.getByRole("dialog").getByPlaceholder("Paste a recipe link");
  await field.fill(link);
  await field.press("Enter");
}

async function addRecipe(page: Page, link: string) {
  await page.getByRole("button", { name: /^Add more\b/ }).filter({ visible: true }).first().click();
  await submitLink(page, link);
}

test("a failed import's replacement lands in its place, and the deck stays there", async ({ page, request }) => {
  const { email, uid } = await returningUser(request);
  await grantPro(request, uid);
  await signIn(page, email);
  const field = page.getByPlaceholder("Paste a recipe link");
  await field.fill(GOOD);
  await field.press("Enter");
  await expect(page).toHaveURL(/\/print$/);
  for (const n of [2, 3]) {
    await addRecipe(page, `${GOOD}-${n}`);
    await expect(page.locator("[data-pending-page]")).toHaveCount(0);
  }
  await addRecipe(page, BAD);
  const failed = page.getByText("That recipe didn't import");
  await expect(failed).toBeVisible();
  await deckSettled(page);

  const deck = page.locator("#recipe-page-deck");
  const cards = page.locator("#recipe-page-deck .recipe-card");
  const before = await cards.count();
  await page.getByRole("button", { name: "Try another way" }).click();
  await submitLink(page, `${GOOD}-4`);
  await expect(cards).toHaveCount(before + 1);
  await deckSettled(page);

  // The deck is still at the end of the job, where the failed card was...
  const { top, max } = await deck.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  expect(max).toBeGreaterThan(0);
  expect(top).toBeGreaterThan(max - 40);
  // ...and the recipe that arrived is the last one in it, not the first.
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("button").filter({ hasText: /Lemon/i }).last())
    .toHaveAttribute("aria-current", "true");
});
