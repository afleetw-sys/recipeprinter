import { expect, test } from "./guarded";

/**
 * The welcome a new cookbook opens with ends on "Start adding recipes". It used
 * to just close itself, leaving a cook with an empty book and no idea where
 * adding happens. Pressing it has to put them in the Add recipes dialog.
 *
 * Started empty from the homepage's Cookbook tab, so nothing is imported.
 */
test("the new-cookbook welcome's Start adding recipes opens Add recipes", async ({ page }) => {
  await page.goto("/");
  const tab = page.getByRole("tab", { name: /Cookbook/ });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
  }).toPass();
  await page.getByRole("button", { name: /Start my cookbook/ }).first().click();
  await expect(page).toHaveURL(/\/print$/);

  await page.getByRole("button", { name: "Start adding recipes" }).click();

  // The Add dialog by its heading, not its words: from here it's titled for
  // the first recipe.
  await expect(page.locator("#recipe-add-dialog-title")).toBeVisible();
});

/**
 * A signed-out cook's way to keep a book is Save, which signs them in. The
 * phone's top bar offered it from the start, but the desktop header held it
 * back until the first recipe, so an empty book on a computer had no Save at
 * all. Every width offers it on a book that hasn't had a recipe yet.
 */
test("a new signed-out cookbook offers Save at every width", async ({ page }) => {
  const missing: string[] = [];
  for (const { name, width, height } of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const tab = page.getByRole("tab", { name: /Cookbook/ });
    await expect(async () => {
      await tab.click();
      await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 1_000 });
    }).toPass();
    await page.getByRole("button", { name: /Start my cookbook/ }).first().click();
    await expect(page).toHaveURL(/\/print$/);
    await page.getByRole("button", { name: "Look around first" }).click();

    await page
      .getByRole("button", { name: "Sign in to save cookbook" })
      .filter({ visible: true })
      .first()
      .waitFor({ state: "visible", timeout: 5_000 })
      .catch(() => missing.push(name));
  }
  expect(missing).toEqual([]);
});
