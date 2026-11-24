import { expect, test } from "./guarded";

/**
 * "Family Edition" on a new cover looked and behaved like placeholder text
 * (Amelia, 2026-11-23): clicking it put the caret at its very start, the way
 * a hint behaves, so typing went in front of words that print. A recipe's
 * lines already put the caret where you click; a book's own pages' lines
 * didn't.
 *
 * The rule, for every written line on the front cover and a chapter opener:
 * clicked in its middle, the field opens with the caret there, not at the
 * start. A book opened from session storage: nothing imported or billed.
 */
test.skip(({ isMobile }) => isMobile, "clicking into a line is the desktop deck");

test("clicking a book page's line puts the caret where it was clicked", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(() => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
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
    sessionStorage.setItem(
      "recipeprinter:project-meta:v1",
      JSON.stringify({
        cookbookMode: true,
        cookbookWelcomeCompleted: true,
        optionalLinesExplicit: true,
        // A new book: its unwritten lines show their sample words.
        sampleLines: true,
        sectionDividers: true,
        cover: { title: "Our Favorite Recipes", template: "classic", layout: "typographic" },
        sections: [{ id: "s1", title: "Dinners", itemIds: ["r1"] }],
      }),
    );
  });
  await page.goto("/print");

  const lines: Array<[string, string]> = [
    ["article.recipe-card--cover-front", "cover-kicker"],
    ["article.recipe-card--cover-front", "cover-byline"],
    ["article.recipe-card--cover-front", "cover-edition"],
    ["article.recipe-card--divider", "subtitle"],
  ];
  for (const [pageSelector, name] of lines) {
    const card = page.locator(`#recipe-page-deck ${pageSelector}`).first();
    await card.scrollIntoViewIfNeeded();
    const line = card.locator(`[data-field-line="${name}"]`);
    await expect(line, name).toBeVisible();
    const text = (await line.innerText()).trim();
    await line.click();
    const field = page.locator("textarea:focus");
    await expect(field, name).toBeVisible();
    const caret = await field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd, el.value.length]);
    // The middle of the line: somewhere inside the words, never their start.
    expect(caret[0], `${name} "${text}" caret ${caret.join("/")}`).toBeGreaterThan(0);
    expect(caret[0], `${name} "${text}" caret ${caret.join("/")}`).toBeLessThan(caret[2]!);
    await page.keyboard.press("Escape");
    await expect(page.locator("textarea:focus")).toHaveCount(0);
  }
});
