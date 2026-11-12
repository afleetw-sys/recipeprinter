import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import {
  PASSWORD,
  enterPassword,
  firestoreRunning,
  grantCookbookUnlock,
  returningUser,
  savedProjectIds,
  signedIn,
} from "./account";
import { startCookbook } from "./workspace";

/**
 * The paid cookbook, for a signed-in cook: it is kept without asking, it can't
 * be exported until it's paid for, and once the webhook's unlock is on the
 * account it exports. Checkout itself is RevenueCat's page and can't run here
 * (see e2e/account.ts); these cover everything either side of it.
 */

test.beforeEach(async ({ request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
});

// "Buy & download" until the book is paid for, on a desktop and a phone alike.
const printButton = (page: Page) =>
  page.getByRole("button", { name: /^(Buy & download|Download)$/ }).filter({ visible: true });
const printDialog = (page: Page) => page.getByRole("heading", { name: "Print your cookbook" });

test("a signed-in cook's new cookbook is saved to their account without pressing Save", async ({ page, request }) => {
  const { uid } = await startCookbook(page, request);

  expect(await savedProjectIds(request, uid)).toHaveLength(1);
});

test("a cookbook that hasn't been paid for can't be exported for free", async ({ page, request }) => {
  await startCookbook(page, request);

  await expect(printButton(page)).toHaveText("Buy & download");
  await printButton(page).click();

  // Pressing it starts checkout, which has no RevenueCat to reach here and
  // fails. What matters is that it stops there instead of exporting. The
  // app's own toast, not any alert: after an in-app navigation Next's route
  // announcer is an alert too, and the bare role matched both.
  await expect(page.getByRole("alert").and(page.locator(".recipe-toast"))).toBeVisible();
  await expect(printDialog(page)).toHaveCount(0);
});

test("a cookbook the account has paid for exports", async ({ page, request }) => {
  const { uid, projectId } = await startCookbook(page, request);
  await grantCookbookUnlock(request, uid, projectId);

  await page.reload();

  await expect(printButton(page)).toHaveText("Download");
  await printButton(page).click();
  await expect(printDialog(page)).toBeVisible();
});

/* A brand-new book has no recipes yet, and Buy & download span forever on it
   (2026-11-08): it waited for every recipe to be measured, and with none
   there was nothing to wait for, so it never got as far as sign-in or
   checkout. Buying comes first; recipes can be added after. */
test("an empty cookbook can be bought before it has any recipes, signed out or in", async ({ page, request }) => {
  await page.goto("/");
  const tab = page.getByRole("tab", { name: /Cookbook/ });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: /Start a cookbook/ }).first().click();
  await expect(page).toHaveURL(/\/print$/);
  // Every new book opens with its welcome, the Cookbook tab's included.
  await expect(page.locator(".cookbook-welcome")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cookbook-welcome")).toHaveCount(0);

  // Signed out, pressing it asks for an account before checkout.
  await expect(printButton(page)).toHaveText("Buy & download");
  await printButton(page).click();
  const signInDialog = page.getByRole("dialog", { name: "Save your cookbook and purchase" });
  await expect(signInDialog).toBeVisible({ timeout: 10_000 });

  // Signed in, the same press goes on to checkout, which has no RevenueCat to
  // reach here and says so with the app's own toast.
  const { email } = await returningUser(request);
  const emailField = signInDialog.locator('input[type="email"]').first();
  await emailField.fill(email);
  await emailField.press("Enter");
  await enterPassword(page, PASSWORD);
  await expect(signedIn(page)).toBeVisible();
  await printButton(page).click();
  await expect(page.getByRole("alert").and(page.locator(".recipe-toast"))).toBeVisible({ timeout: 10_000 });
  await expect(printDialog(page)).toHaveCount(0);
});
