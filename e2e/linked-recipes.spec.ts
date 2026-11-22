import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { untilHydrated } from "./hydrated";
import { firestoreRunning, returningUser, savedProjectIds, signIn } from "./account";
import { LINK, RECIPE_TITLE, deckSettled, openRecipePage, saved, selectedPage, startAddingRecipes } from "./workspace";

/**
 * Print as recipe cards, end to end: the one part of linked recipes that needs
 * a real browser, because it navigates (the book is set aside on the way to a
 * new card job) and then reopens the book. The merge rule, conflicts, removal
 * and purchase gates are unit tests (lib/linkedRecipe*.test.ts).
 *
 * Desktop only: a phone reaches pages through the structure sheet, and its
 * sign-in is a redirect.
 */

test.beforeEach(async ({ request }, testInfo) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
  test.skip(testInfo.project.name === "iphone", "desktop flow; phones reach pages through the structure sheet");
});

const FIRESTORE = "http://127.0.0.1:8180/v1/projects/demo-recipeprinter/databases/(default)/documents";

async function linkedRecordsText(request: APIRequestContext, uid: string): Promise<string> {
  const response = await request.get(`${FIRESTORE}/products/recipePrinter/users/${uid}/linkedRecipes`, {
    headers: { Authorization: "Bearer owner" },
  });
  return response.text();
}

const servings = (page: Page) => selectedPage(page).getByRole("textbox", { name: "Servings", exact: true });

test("a book's recipe printed as a card stays the same recipe, and the cards are kept in Projects", async ({
  page,
  request,
}) => {
  // A book with one recipe in it, started from Projects.
  const { email, uid } = await returningUser(request);
  await signIn(page, email);
  await page.goto("/projects");
  const newCookbook = page.getByRole("button", { name: "New cookbook" }).first();
  await untilHydrated(newCookbook);
  await newCookbook.click();
  await expect(page).toHaveURL(/\/print$/);
  await startAddingRecipes(page);
  const link = page.getByPlaceholder("Paste a recipe link").filter({ visible: true }).first();
  await link.fill(LINK);
  await link.press("Enter");
  await expect(page.getByText(RECIPE_TITLE).filter({ visible: true }).first()).toBeVisible();
  let projectId = "";
  await expect(async () => {
    [projectId = ""] = await savedProjectIds(request, uid);
    expect(projectId).toBeTruthy();
  }).toPass();
  await saved(page);

  await page.getByRole("banner").getByRole("button", { name: "More", exact: true }).click();
  await page.getByRole("menuitem", { name: /Print as recipe cards/ }).click();
  const dialog = page.getByRole("dialog", { name: "Print as recipe cards" });
  // Opens with the recipe on screen ticked; tick it if it wasn't.
  const row = dialog.getByRole("checkbox", { name: `Add ${RECIPE_TITLE}`, exact: true });
  if (await row.count()) await row.click();
  await expect(dialog.getByRole("checkbox", { name: `Don't add ${RECIPE_TITLE}`, exact: true })).toBeVisible();
  // Kept in step with the book unless the cook unticks it.
  await expect(dialog.getByRole("checkbox", { name: /Recipe edits update both the cards and the cookbook/ })).toBeChecked();
  await dialog.getByRole("button", { name: /Print as a recipe card/ }).click();

  // A card job of that recipe, saying where else it is.
  await expect(page).toHaveURL(/\/print$/);
  await deckSettled(page);
  const rail = page.getByRole("navigation", { name: "Pages" });
  await expect(rail.getByText(RECIPE_TITLE).first()).toBeVisible();
  await expect(rail.getByText(/^Also in /)).toBeVisible();

  // An edit on the card reaches the shared recipe.
  await openRecipePage(page);
  await servings(page).fill("7");
  await servings(page).press("Tab");
  await expect
    .poll(async () => /"servings":\s*\{\s*"(stringValue|integerValue)":\s*"7"/.test(await linkedRecordsText(request, uid)))
    .toBe(true);

  // The cards are saved as their own project, beside the book, with one recipe.
  await expect.poll(async () => (await savedProjectIds(request, uid)).length).toBe(2);

  // The book, reopened, has the card's edit.
  await page.goto("/projects");
  await page.locator(`a[href="/print?project=${projectId}"]`).click();
  await expect(page).toHaveURL(/\/print/);
  await deckSettled(page);
  await openRecipePage(page);
  await expect(servings(page)).toHaveValue("7");
  expect(await savedProjectIds(request, uid)).toHaveLength(2);
});
