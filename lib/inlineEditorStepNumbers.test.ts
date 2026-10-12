// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import type { QueueItem, Recipe } from "@/types/recipe";

// The card prints each step's stored `step` field as its number
// (RecipeCardPrint's renderInstructionItem), so every edit that adds, splits
// or reshapes a step has to leave the method numbered 1..n. Turning a heading
// back into a step once printed it as step 0. The hook renumbers in four
// separate places; this drives each of them.

const recipe: Recipe = {
  title: "Soup",
  ingredients: [],
  instructions: [
    { step: 1, text: "Chop the onions." },
    { step: 2, text: "Soften them in butter." },
    { step: 3, text: "Add the stock.", section: "Simmer" },
    { step: 4, text: "Season and serve.", section: "Simmer" },
  ],
};

function setup() {
  let item = { id: "r1", status: "ready", title: "Soup", recipe } as unknown as QueueItem;
  const hook = renderHook(() =>
    useRecipeInlineEditor({
      items: [item],
      updateRecipe: (id, next) => {
        item = { ...item, recipe: next } as QueueItem;
        hook.rerender();
      },
      activeRecipeId: item.id,
      activeRecipeItem: item,
    }),
  );
  const edit = () => {
    const current = hook.result.current.activeInlineEdit;
    if (!current) throw new Error("no active edit");
    return current;
  };
  const numbers = () => (item.recipe?.instructions ?? []).map((step) => step.step);
  const expected = () => (item.recipe?.instructions ?? []).map((_, i) => i + 1);
  return { edit, numbers, expected };
}

describe("step numbers after an edit", () => {
  it("run 1..n after every way of adding, splitting or reshaping a step", () => {
    const actions: Array<[string, (edit: ReturnType<ReturnType<typeof setup>["edit"]>) => void]> = [
      ["add below", (edit) => edit.onInsertStep(2)],
      ["Enter splitting a step", (edit) => edit.onSplitLine({ kind: "step", index: 1 }, "Soften them", " in butter.")],
      ["a step made into a heading", (edit) => edit.onSetLineKind({ kind: "step", index: 1 }, "heading", "Soften them in butter.")],
      ["a heading made back into a step", (edit) => edit.onSetLineKind({ kind: "instructionSection", index: 2 }, "body", "Simmer")],
    ];
    for (const [name, run] of actions) {
      const { edit, numbers, expected } = setup();
      act(() => run(edit()));
      expect(numbers(), name).toEqual(expected());
    }
  });
});
