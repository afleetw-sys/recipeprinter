// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecipeCardFace } from "@/components/RecipeCardPrint";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import type { Recipe } from "@/types/recipe";

afterEach(cleanup);

const noop = () => {};
const inlineEdit = new Proxy({ editingTarget: null, value: "" } as unknown as RecipeCardInlineEdit, {
  get: (target, key) => (key in target ? target[key as keyof RecipeCardInlineEdit] : noop),
});

function sourceLine(recipe: Recipe, { editable, cookbookMode }: { editable: boolean; cookbookMode: boolean }) {
  const { container } = render(
    <RecipeCardFace
      recipe={recipe}
      ingredients={recipe.ingredients}
      instructions={recipe.instructions}
      side="front"
      showHeader
      layout="standard"
      hasBackFace={false}
      showSourceUrl
      template="classic"
      cookbookMode={cookbookMode}
      inlineEdit={editable ? inlineEdit : undefined}
    />,
  );
  const el = container.querySelector<HTMLElement>(".recipe-card__footer-source, .recipe-card__source-line");
  cleanup();
  if (!el) return null;
  return el instanceof HTMLInputElement ? el.value : el.textContent;
}

describe("RecipeCardFace source line", () => {
  // The off-screen measurer lays out the read-only card; the deck shows the
  // editable one. A source that isn't a web address used to show up only on the
  // editable card, so the footer there was a line taller than the one the
  // pagination measured, and the last ingredient ran into it.
  for (const cookbookMode of [false, true]) {
    for (const sourceUrl of [
      "https://www.lifeloveandsugar.com/caramel-pumpkin-spice-blondie-streusel-cheesecake/",
      "*".repeat(60),
      "Grandma's notebook",
      "",
      undefined,
    ]) {
      it(`matches the measured card (${cookbookMode ? "cookbook" : "card"}, ${JSON.stringify(sourceUrl)})`, () => {
        const recipe: Recipe = {
          title: "Blondies",
          sourceUrl,
          ingredients: [{ name: "1 cup flour" }],
          instructions: [{ step: 1, text: "Bake." }],
        };
        expect(sourceLine(recipe, { editable: true, cookbookMode })).toBe(
          sourceLine(recipe, { editable: false, cookbookMode }),
        );
      });
    }
  }
});
