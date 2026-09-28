import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { firestoreRunning, grantPro, returningUser, signIn } from "./account";

/**
 * RecipePrinter Pro, as the app sees it: printing more than one recipe in a
 * job is Pro, so a free account asking to add a second one gets the upgrade
 * dialog, and an account whose subscription the webhook has mirrored goes
 * straight through. Pro is read from that mirror here because the live
 * RevenueCat check can't run (see e2e/account.ts), which is also exactly the
 * path a subscriber takes whenever RevenueCat is unreachable.
 */

const LINK = "https://www.wikipedia.org/recipes/lemon-herb-chicken";

test.beforeEach(async ({ request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
});

async function printOneRecipe(page: Page) {
  const field = page.getByPlaceholder("Paste a recipe link");
  await field.fill(LINK);
  await field.press("Enter");
  await expect(page).toHaveURL(/\/print$/);
}

async function askForAnotherRecipe(page: Page) {
  // "Add more recipes" in the desktop rail (a free account's name also carries
  // its "is Pro" badge), "Add more" in the phone toolbar.
  await page.getByRole("button", { name: /^Add more\b/ }).filter({ visible: true }).first().click();
}

const proDialog = (page: Page) => page.getByRole("dialog", { name: "Print multiple recipes at once" });
const addRecipeDialog = (page: Page) => page.getByRole("dialog").getByPlaceholder("Paste a recipe link");

test("a free account asking for a second recipe is offered Pro", async ({ page, request }) => {
  const { email } = await returningUser(request);
  await signIn(page, email);
  await printOneRecipe(page);

  await askForAnotherRecipe(page);

  await expect(proDialog(page)).toBeVisible();
  await expect(addRecipeDialog(page)).toHaveCount(0);
});

test("a Pro subscriber adds a second recipe without being asked to pay", async ({ page, request }) => {
  const { email, uid } = await returningUser(request);
  await grantPro(request, uid);
  await signIn(page, email);
  await printOneRecipe(page);

  await askForAnotherRecipe(page);

  await expect(addRecipeDialog(page)).toBeVisible();
  await expect(proDialog(page)).toHaveCount(0);
});
