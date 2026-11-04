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

/** What the details line reads as on screen: its text, with each field's
    value where the field is. */
function detailsLine(recipe: Recipe, cookbookMode: boolean, inlineEdit: RecipeCardInlineEdit) {
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
      inlineEdit={inlineEdit}
    />,
  );
  const line = container.querySelector<HTMLElement>(".recipe-card__meta, .recipe-card__facts");
  if (!line) return "";
  const copy = line.cloneNode(true) as HTMLElement;
  for (const input of Array.from(copy.querySelectorAll("input"))) {
    input.replaceWith(document.createTextNode(` ${input.value} `));
  }
  return copy.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("Serves on the details line", () => {
  // A recipe card's servings field held "Serves 4" as its value and swapped it
  // for the bare "4" the moment it was clicked, so "Serves" vanished while
  // typing. A cookbook's has always kept "Serves" as a label beside the
  // field. Both keep it now, before, during and after typing.
  const recipe: Recipe = {
    title: "Blondies",
    servings: 4,
    ingredients: [{ name: "1 cup flour" }],
    instructions: [{ step: 1, text: "Bake." }],
  };
  for (const cookbookMode of [false, true]) {
    for (const [state, edit] of [
      ["not editing", inlineEditFor({})],
      ["typing", inlineEditFor({ editingTarget: { kind: "servings" }, value: "6" })],
      ["cleared", inlineEditFor({ editingTarget: { kind: "servings" }, value: "" })],
    ] as const) {
      it(`keeps "Serves" (${cookbookMode ? "cookbook" : "card"}, ${state})`, () => {
        const line = detailsLine(recipe, cookbookMode, edit);
        expect(line).toMatch(/\bServes\b/);
        expect(line).not.toMatch(/Serves.*Serves/);
        expect(line).toContain(state === "typing" ? "6" : state === "cleared" ? "Serves" : "4");
      });
    }
  }
});
