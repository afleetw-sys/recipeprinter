// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecipeCardFace } from "@/components/RecipeCardPrint";
import type { RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import type { Recipe } from "@/types/recipe";

afterEach(cleanup);

const noop = () => {};
function inlineEditFor(fields: Partial<RecipeCardInlineEdit>) {
  return new Proxy({ editingTarget: null, value: "", ...fields } as unknown as RecipeCardInlineEdit, {
    get: (target, key) => (key in target ? target[key as keyof RecipeCardInlineEdit] : noop),
  });
}

const base: Recipe = {
  title: "Blondies",
  ingredients: [{ name: "1 cup flour" }],
  instructions: [{ step: 1, text: "Bake." }],
};

/** The open field's classes: what decides how it is drawn. */
function openField(recipe: Recipe, cookbookMode: boolean, kind: "cookTime" | "servings", value: string) {
  const { container } = render(
    <RecipeCardFace
      recipe={recipe}
      ingredients={recipe.ingredients}
      instructions={recipe.instructions}
      side="front"
      showHeader
      layout="standard"
      hasBackFace={false}
      template="classic"
      cookbookMode={cookbookMode}
      inlineEdit={inlineEditFor({ editingTarget: { kind }, value })}
    />,
  );
  const label = kind === "cookTime" ? "Cook time" : "Servings";
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  const classes = input ? [...Array.from(input.classList)].sort().join(" ") : null;
  cleanup();
  return classes;
}

describe("an added cook time or servings", () => {
  // Added from the "+" menu, the field opened as a boxed prompt (a bordered
  // chip with its own padding, margin and minimum width), not the field you
  // get clicking a time or servings that is already there. Adding one is
  // that same field, empty.
  for (const cookbookMode of [false, true]) {
    for (const [kind, filled] of [
      ["cookTime", { ...base, totalTime: "PT30M" }],
      ["servings", { ...base, servings: 4 }],
    ] as const) {
      it(`opens as the edit field (${cookbookMode ? "cookbook" : "card"}, ${kind})`, () => {
        const editing = openField(filled, cookbookMode, kind, kind === "cookTime" ? "30 min" : "4");
        const adding = openField(base, cookbookMode, kind, "");
        expect(editing).not.toBeNull();
        expect(adding).toBe(editing);
      });
    }
  }
});
