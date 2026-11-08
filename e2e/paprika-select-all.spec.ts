import type { Page } from "@playwright/test";
import { gzipSync, strToU8, zipSync } from "fflate";
import { expect, test } from "./guarded";
import { firestoreRunning, grantPro, returningUser, signIn } from "./account";

/**
 * A Pro member who ticked "Select all" in their Paprika library got only the
 * first recipe, from the home page and from /print's Add more recipes alike.
 * Pro prints any number of recipes, so every one ticked has to arrive.
 *
 * A Paprika export made here, three recipes, read from disk by the real
 * picker: no import, nothing billed.
 */

test.beforeEach(async ({ request }) => {
  test.skip(!(await firestoreRunning(request)), "needs the Firestore emulator, which needs Java");
});

const TITLES = ["Borscht", "Kasha", "Pierogi"];

function paprikaExport() {
  const files: Record<string, Uint8Array> = {};
  TITLES.forEach((name, index) => {
    const record = {
      uid: `0000000${index}-2222-3333-4444-555555555555`,
      name,
      ingredients: `2 beets\n1 onion\n${index + 1} cups water`,
      directions: "Simmer the beets.\nAdd the onion.",
    };
    files[`${name}.paprikarecipe`] = gzipSync(strToU8(JSON.stringify(record)));
  });
  return { name: "Export All Recipes.paprikarecipes", mimeType: "application/octet-stream", buffer: Buffer.from(zipSync(files)) };
}

/** Opens Recipe apps, reads the export, ticks Select all and adds them: with
    the picker's own button on the home page, with Done in /print's dialog. */
async function addEveryPaprikaRecipe(page: Page, finish: "picker" | "done") {
  await page.getByRole("button", { name: "Recipe apps" }).filter({ visible: true }).first().click();
  await page.locator('input[type="file"][accept*="paprika"]').first().setInputFiles(paprikaExport());
  await expect(page.getByText("Kasha").filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Select all" }).filter({ visible: true }).click();
  if (finish === "done") {
    await page.getByRole("button", { name: "Done", exact: true }).filter({ visible: true }).click();
  } else {
    await page.locator(".import-source-commit .btn-primary").filter({ visible: true }).click();
  }
}

/** Every recipe in the print job, by the titles on its pages. */
async function expectEveryRecipeOnPrint(page: Page) {
  await expect(page).toHaveURL(/\/print/);
  for (const title of TITLES) {
    await expect(page.locator("#recipe-page-deck").getByText(title, { exact: true }).first(), title).toBeAttached({
      timeout: 30_000,
    });
  }
}

test("a Pro member's Select all brings every Paprika recipe, from the home page and from /print", async ({
  page,
  request,
  browserName,
}) => {
  // The lost recipes were app logic, the same in every browser. In WebKit the
  // dev server also throws a ChunkLoadError for the (hidden) referral chunk as
  // the home page hands over to /print, which fails the page-error guard for
  // a reason that isn't this one.
  test.skip(browserName !== "chromium", "browser-independent logic; WebKit trips an unrelated dev chunk error");
  test.setTimeout(180_000);
  const { email, uid } = await returningUser(request);
  await grantPro(request, uid);
  await signIn(page, email);

  // From /print, into a job that already holds one recipe: Add more recipes.
  // Seeded once, before the page loads; the home page run below starts clean.
  await page.addInitScript(() => {
    if (location.pathname !== "/print" || localStorage.getItem("e2e:seeded")) return;
    localStorage.setItem("e2e:seeded", "1");
    const item = {
      id: "r1",
      method: "manual",
      source: "test",
      status: "ready",
      title: "Lemon Chicken",
      addedAt: 0,
      recipe: { title: "Lemon Chicken", ingredients: [{ raw: "1 cup flour" }], instructions: [{ step: 1, text: "Mix." }] },
    };
    sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify([item]));
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: ["r1"] }));
  });
  await page.goto("/print");
  await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible({ timeout: 60_000 });
  // Pro has reached this page (from the account's server record) once it
  // stops offering it.
  await expect(page.getByRole("button", { name: /Upgrade to Pro/ })).toHaveCount(0, { timeout: 30_000 });
  await page.getByRole("button", { name: /^Add more\b/ }).filter({ visible: true }).first().click();
  await addEveryPaprikaRecipe(page, "done");
  await expectEveryRecipeOnPrint(page);

  // From the home page, into a fresh job.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto("/");
  await addEveryPaprikaRecipe(page, "picker");
  await expectEveryRecipeOnPrint(page);
});
