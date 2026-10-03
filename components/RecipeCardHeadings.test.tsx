// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { RecipeCardFace } from "@/components/RecipeCardPrint";
import { DEFAULT_RECIPE_HEADINGS, type RecipeHeadingKind } from "@/lib/recipeHeadings";
import type { RecipeCardEditTarget, RecipeCardInlineEdit } from "@/lib/recipeCardLayout";
import type { Recipe } from "@/types/recipe";

beforeAll(() => {
  // The card's column split watches its own size; jsdom has neither.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

const base: Recipe = {
  title: "Soup",
  ingredients: [{ raw: "1 onion" }],
  instructions: [{ step: 1, text: "Cook it." }],
};

const kinds: RecipeHeadingKind[] = ["ingredientsHeading", "stepsHeading"];
const section = { ingredientsHeading: ".recipe-card__ingredients", stepsHeading: ".recipe-card__method" };
const other = (kind: RecipeHeadingKind): RecipeHeadingKind =>
  kind === "ingredientsHeading" ? "stepsHeading" : "ingredientsHeading";

function editor(overrides: Partial<RecipeCardInlineEdit> = {}): RecipeCardInlineEdit {
  return {
    editingTarget: null,
    value: "",
    onFocusTarget: vi.fn(),
    onValueChange: vi.fn(),
    onCommit: vi.fn(),
    onSetLineKind: vi.fn(),
    onCancel: vi.fn(),
    onInsertIngredient: vi.fn(),
    onInsertStep: vi.fn(),
    onSplitLine: vi.fn(),
    onDeleteLines: vi.fn(),
    ...overrides,
  };
}

function card(
  recipe: Recipe,
  { inlineEdit, showEmptyFields = false, hasBackFace = false }: {
    inlineEdit?: RecipeCardInlineEdit;
    showEmptyFields?: boolean;
    hasBackFace?: boolean;
  } = {},
) {
  const { container } = render(
    <RecipeCardFace
      recipe={recipe}
      ingredients={recipe.ingredients}
      instructions={recipe.instructions}
      side="front"
      showHeader
      layout="standard"
      hasBackFace={hasBackFace}
      template="classic"
      showDecoration={false}
      inlineEdit={inlineEdit}
      showEmptyFields={showEmptyFields}
    />,
  );
  const label = (kind: RecipeHeadingKind) =>
    container.querySelector<HTMLElement>(`${section[kind]} .recipe-card__label`);
  return { container, label };
}

describe.each(kinds)("the %s on a card", (kind) => {
  it("prints the cook's own words, and the other heading stays the default", () => {
    const { label } = card({ ...base, [kind]: "For the dough" });
    expect(label(kind)?.textContent).toContain("For the dough");
    expect(label(other(kind))?.textContent).toContain(DEFAULT_RECIPE_HEADINGS[other(kind)]);
  });

  it("takes no room once removed, while its list and the other heading stay", () => {
    const { container, label } = card({ ...base, [kind]: "" });
    expect(label(kind)).toBeNull();
    expect(container.querySelector(`${section[kind]} li`)).not.toBeNull();
    expect(label(other(kind))).not.toBeNull();
  });

  it("opens for editing with its current words when clicked", () => {
    const inlineEdit = editor();
    const { label } = card({ ...base, [kind]: "Method" }, { inlineEdit });
    fireEvent.click(label(kind)!);
    expect(inlineEdit.onFocusTarget).toHaveBeenCalledWith({ kind } satisfies RecipeCardEditTarget, "Method");
  });

  it("is a labelled field while it is being edited, and commits on blur", () => {
    const inlineEdit = editor({ editingTarget: { kind }, value: "Method" });
    card(base, { inlineEdit });
    const field = screen.getByRole("textbox", { name: new RegExp(`${DEFAULT_RECIPE_HEADINGS[kind]} heading`, "i") });
    expect((field as HTMLTextAreaElement).value).toBe("Method");
    fireEvent.blur(field);
    expect(inlineEdit.onCommit).toHaveBeenCalled();
  });

  it("comes back from the reveal as the default, ready to keep or retype", () => {
    const inlineEdit = editor();
    const { container } = card({ ...base, [kind]: "" }, { inlineEdit, showEmptyFields: true });
    const slot = container.querySelector<HTMLElement>(`${section[kind]} .recipe-card__label--empty`);
    expect(slot).not.toBeNull();
    fireEvent.click(slot!);
    expect(inlineEdit.onFocusTarget).toHaveBeenCalledWith({ kind }, DEFAULT_RECIPE_HEADINGS[kind]);
  });

  it("stays hidden on a card nobody is editing, reveal or not", () => {
    const { container } = card({ ...base, [kind]: "" }, { showEmptyFields: true });
    expect(container.querySelector(`${section[kind]} .recipe-card__label`)).toBeNull();
  });
});

describe("a removed Steps heading on a card that runs onto its back", () => {
  it("still says the steps continue overleaf", () => {
    const { label } = card({ ...base, stepsHeading: "" }, { hasBackFace: true });
    expect(label("stepsHeading")?.textContent).toMatch(/continued/i);
    expect(label("stepsHeading")?.textContent).not.toContain(DEFAULT_RECIPE_HEADINGS.stepsHeading);
  });
});
