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
