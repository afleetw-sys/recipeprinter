import { expect, test } from "./guarded";

/**
 * Print calls `window.print()` inside the click that asked for it.
 *
 * Safari only opens its print sheet straight away from inside the cook's own
 * click. Called anywhere later — after an `await`, a frame, a timer — it is
 * "automatic printing": Safari's "this webpage is trying to print" alert, or
 * nothing at all. The Print button once awaited two frames (to paint a
 * spinner) before printing, and on Safari it took three clicks and a reload to
 * get a dialog (2026-10-01). This fails if anything is ever put back between
 * the click and `print()`.
 */

const recipe = {
  title: "Tomato Soup",
  servings: "4",
  ingredients: [{ raw: "6 tomatoes" }, { raw: "1 onion" }],
  instructions: [{ step: 1, text: "Simmer everything for twenty minutes, then blend." }],
};

test("Print calls window.print() inside the click", async ({ page }) => {
  await page.addInitScript(
    ({ item }) => {
      sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify([item]));
      sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: [item.id] }));
      // True from a click until the next macrotask: any frame, timer or await
      // on one between the click and print() lands after it has reset.
      let inClick = false;
      document.addEventListener(
        "click",
        () => {
          inClick = true;
          setTimeout(() => (inClick = false), 0);
        },
        true,
      );
      const calls: boolean[] = [];
      (window as unknown as { __printCalls: boolean[] }).__printCalls = calls;
      window.print = () => {
        calls.push(inClick);
      };
    },
    { item: { id: "button-1", method: "text", source: "test", status: "ready", title: recipe.title, recipe } },
  );
  // Letter, a free theme, one recipe: nothing between this click and printing.
  await page.goto("/print?ids=button-1&size=letter&template=classic");
  await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible();
  await expect(page.locator(".recipe-print-shell--measuring")).toHaveCount(0);

  await page.locator(".recipe-print-topbar").getByRole("button", { name: /^Print$/ }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __printCalls: boolean[] }).__printCalls)).toEqual([true]);
});
