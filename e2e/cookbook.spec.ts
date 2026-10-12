import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { firestoreRunning, grantCookbookUnlock, savedProjectIds } from "./account";
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

// "Buy & Print" until the book is paid for, on a desktop and a phone alike.
const printButton = (page: Page) =>
  page.getByRole("button", { name: /^(Buy & )?Print$/ }).filter({ visible: true });
const printDialog = (page: Page) => page.getByRole("heading", { name: "Print your cookbook" });

test("a signed-in cook's new cookbook is saved to their account without pressing Save", async ({ page, request }) => {
  const { uid } = await startCookbook(page, request);

  expect(await savedProjectIds(request, uid)).toHaveLength(1);
});

test("a cookbook that hasn't been paid for can't be exported for free", async ({ page, request }) => {
  await startCookbook(page, request);

  await expect(printButton(page)).toHaveText("Buy & Print");
  await printButton(page).click();

  // Pressing it starts checkout, which has no RevenueCat to reach here and
  // says so. What matters is that it stops there instead of exporting.
  await expect(page.getByText("Purchases aren't ready yet. Wait a moment, then try again.")).toBeVisible();
  await expect(printDialog(page)).toHaveCount(0);
});

test("a cookbook the account has paid for exports", async ({ page, request }) => {
  const { uid, projectId } = await startCookbook(page, request);
  await grantCookbookUnlock(request, uid, projectId);

  await page.reload();

  await expect(printButton(page)).toHaveText("Print");
  await printButton(page).click();
  await expect(printDialog(page)).toBeVisible();
});
