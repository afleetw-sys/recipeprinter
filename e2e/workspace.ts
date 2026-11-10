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
  // The Cookbook tab opens an empty book (no link field) under its welcome;
  // the recipe goes in from inside it, as a cook's first one does.
  await page.getByRole("button", { name: /Start a cookbook/ }).first().click();
  await expect(page).toHaveURL(/\/print$/);
  // Every new book opens with its welcome, the Cookbook tab's included, and
  // its Start adding recipes is the way into Add at every width (a phone's
  // cookbook Add asks recipe or chapter first).
  await page.getByRole("button", { name: "Start adding recipes" }).click();
  const field = page.getByPlaceholder("Paste a recipe link").filter({ visible: true }).first();
  await field.fill(LINK);
  await field.press("Enter");
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

/** The settings panel's Book settings, where the themes are. A cookbook's panel
    opens on them; with the Page tab hidden (PAGE_SETTINGS_TAB_ENABLED) there
    are no tabs at all, and a test that visited Page has to come back. */
export async function showBookSettings(page: Page) {
  await expect(page.getByRole("complementary", { name: "Recipe print settings" })).toBeVisible();
  const book = page.getByRole("button", { name: "Book", exact: true });
  if ((await book.count()) === 0) return;
  if ((await book.getAttribute("aria-pressed")) !== "true") await book.click();
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
