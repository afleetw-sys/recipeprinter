import type { APIRequestContext, Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * Email sign-in, end to end in the browser: the real sign-in dialog, the real
 * Firebase Auth SDK, against the Auth emulator. CookPilot's `checkUserProviders`
 * callable (which decides between "sign in" and "create an account") is the
 * local stand-in, which treats any email starting "returning" as an existing
 * password account. Google and Apple redirect sign-in need real providers and
 * are not covered here.
 */

const PASSWORD = "correct-horse-battery-staple";

/** A password account in the Auth emulator, unique per test so tests can run in parallel. */
async function returningUser(request: APIRequestContext): Promise<string> {
  const email = `returning-${crypto.randomUUID()}@example.test`;
  const response = await request.post(
    "http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1/accounts:signUp?key=e2e-fake-api-key",
    { data: { email, password: PASSWORD, returnSecureToken: true } },
  );
  expect(response.ok()).toBe(true);
  return email;
}

async function enterEmail(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open account or sign in" }).click();
  const field = page.locator('input[type="email"]').first();
  await field.fill(email);
  await field.press("Enter");
}

async function enterPassword(page: Page, password: string) {
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

const signedIn = (page: Page) => page.getByRole("button", { name: "Open account menu" });

test("a returning user signs in with their password", async ({ page, request }) => {
  const email = await returningUser(request);
  await enterEmail(page, email);
  await expect(page.getByText(`Password for ${email}`)).toBeVisible();

  await enterPassword(page, PASSWORD);

  await expect(signedIn(page)).toBeVisible();
  await expect(page.getByText("Create an account or sign in")).toHaveCount(0);
});

test("the sign-in survives a reload", async ({ page, request }) => {
  const email = await returningUser(request);
  await enterEmail(page, email);
  await enterPassword(page, PASSWORD);
  await expect(signedIn(page)).toBeVisible();

  await page.reload();

  await expect(signedIn(page)).toBeVisible();
});

test("a wrong password is refused with a message that doesn't blame anyone", async ({ page, request }) => {
  const email = await returningUser(request);
  await enterEmail(page, email);
  await enterPassword(page, "not-the-password");

  // Not the only role="alert" on the page (Next's route announcer is one too).
  await expect(
    page.getByRole("alert").filter({ hasText: /That email or password didn.t match an account\./ }),
  ).toBeVisible();
  // Still signed out. (The page behind the open dialog is hidden from queries,
  // so "no account menu" is the check, not "a sign-in button".)
  await expect(signedIn(page)).toHaveCount(0);
});
