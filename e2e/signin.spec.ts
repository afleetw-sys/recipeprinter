import { expect, test } from "./guarded";
import { PASSWORD, enterEmail, enterPassword, returningUser, signedIn } from "./account";

/**
 * Email sign-in, end to end in the browser: the real sign-in dialog, the real
 * Firebase Auth SDK, against the Auth emulator. CookPilot's emailed-code
 * callables are the local stand-in (stubs/emailCode.mjs), which reads the
 * account from the emulator, so a password account is offered "Use my
 * password instead". Google and Apple redirect sign-in need real providers and
 * are not covered here.
 */

test("a returning user signs in with their password", async ({ page, request }) => {
  const { email } = await returningUser(request);
  await enterEmail(page, email);
  await expect(page.getByText(`Enter the 6-digit code we sent to ${email}`)).toBeVisible();

  await enterPassword(page, PASSWORD);

  await expect(signedIn(page)).toBeVisible();
  await expect(page.getByText("Create an account or sign in")).toHaveCount(0);
});

test("the sign-in survives a reload", async ({ page, request }) => {
  const { email } = await returningUser(request);
  await enterEmail(page, email);
  await enterPassword(page, PASSWORD);
  await expect(signedIn(page)).toBeVisible();

  await page.reload();

  await expect(signedIn(page)).toBeVisible();
});

test("a wrong password is refused with a message that doesn't blame anyone", async ({ page, request }) => {
  const { email } = await returningUser(request);
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
