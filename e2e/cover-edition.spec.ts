import { expect, test } from "./guarded";
import { RECIPE_PRINT_TEMPLATE_OPTIONS } from "../lib/printTemplates";

/**
 * A cookbook cover's edition line ("2026 Family Edition") was too light to
 * read on almost every theme (Amelia, 2026-11-23). It had no colour of its
 * own, so it took the cover's white, set for words over a photo, and printed
 * white on the theme's paper.
 *
 * The rule: the edition reads in the author line's colour, on every theme,
 * with the words on paper and over a photo. One book opened from session
 * storage (nothing imported or billed); each theme is its class on the card
 * set and each cover kind its `data-cover-mode`, which is all the cover's
 * colours key on.
 */
test.skip(({ isMobile }) => isMobile, "a stylesheet rule, the same on every screen");

test("a cover's edition line reads like its author line on every theme", async ({ page }) => {
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
        cover: { title: "Our Recipes", author: "The Smiths", edition: "2026 Family Edition", template: "classic" },
        sections: [{ id: "s1", title: "Dinners", itemIds: ["r1"] }],
      }),
    );
  });
  await page.goto("/print");
  const cover = page.locator("#recipe-page-deck article.recipe-card--cover-front").first();
  await expect(cover.locator(".recipe-card__cover-edition")).toBeVisible();

  const mismatches = await cover.evaluate(
    (card, themes) => {
      const set = card.closest(".recipe-card-set") as HTMLElement;
      const original = set.className;
      const originalMode = card.getAttribute("data-cover-mode");
      const author = card.querySelector(".recipe-card__cover-author") as HTMLElement;
      const edition = card.querySelector(".recipe-card__cover-edition") as HTMLElement;
      const look = (el: HTMLElement) => {
        const style = getComputedStyle(el);
        return `${style.color} @ ${style.opacity}`;
      };
      const out: string[] = [];
      for (const theme of themes) {
        set.className = original.replace(/recipe-template--[\w-]+/, `recipe-template--${theme}`);
        for (const mode of ["none", "photo", "grid"]) {
          card.setAttribute("data-cover-mode", mode);
          if (look(edition) !== look(author)) out.push(`${theme} ${mode}: edition ${look(edition)}, author ${look(author)}`);
        }
      }
      set.className = original;
      if (originalMode) card.setAttribute("data-cover-mode", originalMode);
      return out;
    },
    RECIPE_PRINT_TEMPLATE_OPTIONS.map((option) => option.id),
  );
  expect(mismatches).toEqual([]);
});
