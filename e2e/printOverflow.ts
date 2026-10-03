import type { Page } from "@playwright/test";
import { expect } from "./guarded";

/**
 * A recipe long enough to need a back, opened straight onto /print from
 * session storage (no import, so nothing is fetched or billed), and a check
 * for any card content that would print past its card. Shared by the specs
 * that care whether a card's layout still fits after something changes it.
 */

export const longRecipe = {
  title: "A Very Long Stew",
  servings: "8",
  ingredients: Array.from({ length: 40 }, (_, i) => ({ raw: `${i + 1} cups of ingredient number ${i + 1}, chopped` })),
  instructions: Array.from({ length: 30 }, (_, i) => ({
    step: i + 1,
    text: `Step ${i + 1}: stir the pot slowly and keep going until everything is thoroughly combined and hot.`,
  })),
};

export async function openPrint(page: Page, size: string, recipe: { title: string } = longRecipe) {
  const queue = [{ id: "r1", method: "text", source: "test", status: "ready", title: recipe.title, recipe }];
  // Only into a fresh tab, so a reload reads back what the page saved.
  await page.addInitScript((items) => {
    if (sessionStorage.getItem("recipeprinter:queue:v1")) return;
    sessionStorage.setItem("recipeprinter:queue:v1", items);
    sessionStorage.setItem("recipeprinter:print-job:current:v1", JSON.stringify({ ids: ["r1"] }));
  }, JSON.stringify(queue));
  await page.goto(`/print?ids=r1&size=${size}&template=classic`);
  await expect(page.locator("#recipe-page-deck .recipe-card").first()).toBeVisible();
  await expect(page.locator(".recipe-print-shell--measuring")).toHaveCount(0);
}

/**
 * Every card's content that reaches past the card's bottom edge or under its
 * footer, as print would draw it.
 *
 * All in one synchronous call on purpose. A print is a snapshot taken right
 * after `beforeprint`: no script or ResizeObserver runs between the hidden
 * side being revealed and the page being drawn. Revealing it from the test
 * and measuring later would let the page fix itself first and hide the bug.
 */
export async function overflowAsPrinted(page: Page) {
  return page.evaluate(() => {
    window.dispatchEvent(new Event("beforeprint"));
    // `[data-preview-hidden]` is screen-only; print media shows every face.
    const hidden = Array.from(document.querySelectorAll('[data-preview-hidden="true"]'));
    hidden.forEach((el) => el.removeAttribute("data-preview-hidden"));
    try {
      const outside = (el: Element) => Boolean(el.closest(".recipe-card__section-groups--probe"));
      const cards = Array.from(document.querySelectorAll<HTMLElement>("#recipe-page-deck .recipe-card"));
      return cards.flatMap((card, index) => {
        const { bottom } = card.getBoundingClientRect();
        const footer = card.querySelector<HTMLElement>(".recipe-card__footer");
        const footerTop = footer && footer.offsetHeight > 0 ? footer.getBoundingClientRect().top : bottom;
        const pastBottom = Array.from(card.querySelectorAll("*"))
          .filter((el) => !outside(el) && el.textContent?.trim() && el.children.length === 0)
          .filter((el) => el.getBoundingClientRect().bottom > bottom + 1)
          .map((el) => `card ${index + 1}: "${el.textContent!.trim().slice(0, 40)}" past the bottom`);
        const underFooter = Array.from(card.querySelectorAll("li"))
          .filter((el) => !outside(el) && el.getBoundingClientRect().height > 0)
          .filter((el) => el.getBoundingClientRect().bottom > footerTop + 1)
          .map((el) => `card ${index + 1}: "${el.textContent!.trim().slice(0, 40)}" under the footer`);
        return [...pastBottom, ...underFooter];
      });
    } finally {
      hidden.forEach((el) => el.setAttribute("data-preview-hidden", "true"));
    }
  });
}
