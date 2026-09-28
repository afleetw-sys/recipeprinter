import type { APIRequestContext, Page } from "@playwright/test";
import { expect } from "./guarded";

/**
 * Accounts and their server-owned records, made directly in the emulators.
 *
 * What a purchase leaves behind is written by CookPilot's RevenueCat webhook
 * with the admin SDK, never by the browser (firestore.rules denies it). Real
 * checkout can't run here, since it lives on RevenueCat's servers and every
 * test fails if the browser leaves localhost. So these helpers write exactly
 * what the webhook writes, through the emulator's rule-bypassing `owner`
 * token, and the tests check how the app treats an account that has paid.
 */

export const PASSWORD = "correct-horse-battery-staple";
const AUTH = "http://127.0.0.1:9199/identitytoolkit.googleapis.com/v1";
const FIRESTORE = "http://127.0.0.1:8180/v1/projects/demo-recipeprinter/databases/(default)/documents";
const AS_OWNER = { Authorization: "Bearer owner" };
/** Where every RecipePrinter record lives (lib/firebase/recipePrinterPaths.ts). */
const PRODUCT = "products/recipePrinter/users";

/** A password account in the Auth emulator, unique per test so tests can run in parallel. */
export async function returningUser(request: APIRequestContext): Promise<{ email: string; uid: string }> {
  // The CookPilot stand-in treats an email starting "returning" as an existing account.
  const email = `returning-${crypto.randomUUID()}@example.test`;
  const response = await request.post(`${AUTH}/accounts:signUp?key=e2e-fake-api-key`, {
    data: { email, password: PASSWORD, returnSecureToken: true },
  });
  expect(response.ok()).toBe(true);
  return { email, uid: (await response.json()).localId };
}

export async function enterEmail(page: Page, email: string) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open account or sign in" }).click();
  const field = page.locator('input[type="email"]').first();
  await field.fill(email);
  await field.press("Enter");
}

export async function enterPassword(page: Page, password: string) {
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

export const signedIn = (page: Page) => page.getByRole("button", { name: "Open account menu" });

export async function signIn(page: Page, email: string) {
  await enterEmail(page, email);
  await enterPassword(page, PASSWORD);
  await expect(signedIn(page)).toBeVisible();
}

/** Firestore runs on the JVM, so a laptop without Java starts only the Auth
    emulator (playwright.config.ts). CI always has it. */
export async function firestoreRunning(request: APIRequestContext): Promise<boolean> {
  return request
    .get("http://127.0.0.1:8180/")
    .then((response) => response.ok())
    .catch(() => false);
}

/** The ids of every print project saved to this account. */
export async function savedProjectIds(request: APIRequestContext, uid: string): Promise<string[]> {
  const response = await request.get(`${FIRESTORE}/${PRODUCT}/${uid}/printProjects`, { headers: AS_OWNER });
  expect(response.ok()).toBe(true);
  const { documents = [] } = (await response.json()) as { documents?: { name: string }[] };
  return documents.map((document) => document.name.split("/").pop()!);
}

/** What the webhook writes when a cookbook is bought: one unlock per project. */
export async function grantCookbookUnlock(request: APIRequestContext, uid: string, projectId: string) {
  const response = await request.patch(`${FIRESTORE}/${PRODUCT}/${uid}/cookbookUnlocks/${projectId}`, {
    headers: AS_OWNER,
    data: {
      fields: {
        projectId: { stringValue: projectId },
        source: { stringValue: "revenuecat" },
        unlockedAt: { integerValue: String(Date.now()) },
      },
    },
  });
  expect(response.ok()).toBe(true);
}

/** What the webhook mirrors onto the account for an active Pro subscription. */
export async function grantPro(request: APIRequestContext, uid: string) {
  const now = Date.now();
  const response = await request.patch(`${FIRESTORE}/${PRODUCT}/${uid}`, {
    headers: AS_OWNER,
    data: {
      fields: {
        recipePrinterRevenueCatSyncedAt: { timestampValue: new Date(now).toISOString() },
        recipePrinterEntitlements: {
          mapValue: {
            fields: {
              pro: {
                mapValue: {
                  fields: {
                    active: { booleanValue: true },
                    expiresAt: { timestampValue: new Date(now + 30 * 86_400_000).toISOString() },
                    productIdentifier: { stringValue: "recipeprinter_pro_monthly" },
                    willRenew: { booleanValue: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  expect(response.ok()).toBe(true);
}
