import type { APIRequestContext, Locator, Page } from "@playwright/test";
import { expect } from "./guarded";
import reply from "./fixtures/cookpilot-reply.json";
import { returningUser, savedProjectIds, signIn } from "./account";

/**
 * Driving the print workspace: starting a book, reaching a page, and waiting
 * for it to hold still. Shared by every spec that builds something.
 */

export const LINK = "https://www.wikipedia.org/recipes/lemon-herb-chicken";
export const RECIPE_TITLE = reply.recipe.title;

/** Signs in, starts a cookbook from one link, and returns the project's id once it is on the account. */
export async function startCookbook(
  page: Page,
  request: APIRequestContext,
  account?: { email: string; uid: string },
): Promise<{ uid: string; email: string; projectId: string }> {
  const { email, uid } = account ?? (await returningUser(request));
  if (!account) await signIn(page, email);
  else await page.goto("/");
  const before = await savedProjectIds(request, uid);

  const tab = page.getByRole("tab", { name: /Cookbook/ });
  // A tab pressed while the page is still settling after sign-in can be lost.
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();
  const field = page.getByPlaceholder("Paste a recipe link");
  await field.fill(LINK);
  await field.press("Enter");
  await expect(page).toHaveURL(/\/print$/);
  await page.getByRole("button", { name: "Take a look" }).click();
  // This book already has its recipe, so Start lands on the book rather than
  // asking for a first recipe.
  await expect(page.locator("#recipe-add-dialog-title")).toHaveCount(0);
  // The first match can be the page rail, which a phone keeps hidden.
  await expect(page.getByText(RECIPE_TITLE).filter({ visible: true }).first()).toBeVisible();

  let projectId = "";
  await expect(async () => {
    projectId = (await savedProjectIds(request, uid)).find((id) => !before.includes(id)) ?? "";
    expect(projectId).toBeTruthy();
  }).toPass();
  return { uid, email, projectId };
}

/** The page the deck is showing, where its editable fields are. */
export const selectedPage = (page: Page): Locator => page.getByRole("region", { name: "Selected page" });

/** Picking a page smooth-scrolls the deck to it; a click during the scroll
    lands on whatever passes under it. Wait until it has stopped. */
export async function deckSettled(page: Page) {
  await expect(page.locator(".recipe-print-shell--measuring")).toHaveCount(0);
  const deck = page.locator("#recipe-page-deck");
  let last = -1;
  await expect
    .poll(async () => {
      const now = await deck.evaluate((el) => el.scrollTop + el.scrollLeft).catch(() => 0);
      const still = now === last;
      last = now;
      return still;
    }, { intervals: [150] })
    .toBe(true);
}

/** Opens the recipe's own page from the page rail (desktop). */
export async function openRecipePage(page: Page) {
  await page.getByRole("navigation", { name: "Pages" }).getByRole("button", { name: new RegExp(RECIPE_TITLE) }).click();
  await deckSettled(page);
}

/** The header's save state once everything has been written. */
export async function saved(page: Page) {
  await expect(page.getByRole("banner").getByRole("status")).toHaveText("Saved");
}
