// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectPrintJob } from "@/lib/queue";
import { useRailSelection } from "@/lib/useRailSelection";
import type { QueueItem, Section } from "@/types/recipe";

const ready = (id: string): QueueItem =>
  ({
    id,
    method: "manual",
    source: "fixture",
    status: "ready",
    title: id,
    recipe: { title: id, ingredients: [{ raw: "1 cup flour" }], instructions: [] },
  }) as unknown as QueueItem;

// /print crashed with "Maximum update depth exceeded" on entering a cookbook
// (2026-10-09). Updates set during hydration sat starved on React's idle lane,
// so every render re-ran `setJobIds((current) => [...current, id])` and got a
// new array holding the same id. Two effects re-ran on every one of those
// renders and each set state, which rendered again, forever: the layout effect
// keyed on `items` (via sections and sheets), and the rail's clear-selection
// effect, keyed on `items` and on a `clearRailSelection` that was a new function
// each render. The rule: what those effects watch keeps its identity across a
// render that changed nothing in it.
describe("the print page settles", () => {
  it("keeps the job's recipes and the rail's clear action the same across a render that changed nothing", () => {
    const queue = [ready("a"), ready("b"), ready("c")];
    const first = projectPrintJob(["a", "c"], queue, null);

    // Same ids in a new array: the replayed updater.
    expect(projectPrintJob(["a", "c"], queue, first)).toBe(first);
    // Same items in a new queue array, e.g. a write to an unrelated entry.
    expect(projectPrintJob(["a", "c"], [...queue], first)).toBe(first);
    // An id the projection drops anyway changes nothing either.
    expect(projectPrintJob(["a", "missing", "c"], queue, first)).toBe(first);

    // A real change is still a new projection, so edits and reorders flow.
    const edited = [queue[0], queue[1], { ...queue[2], title: "edited" } as QueueItem];
    expect(projectPrintJob(["a", "c"], edited, first)?.[1]).toBe(edited[2]);
    expect(projectPrintJob(["c", "a"], queue, first)?.map((it) => it.id)).toEqual(["c", "a"]);
    expect(projectPrintJob(["a"], queue, first)?.map((it) => it.id)).toEqual(["a"]);
    expect(projectPrintJob(null, queue, first)).toBeNull();

    const sections: Section[] = [{ id: "s", items: first ?? [] }];
    const { result, rerender } = renderHook(() =>
      useRailSelection({
        sections,
        organizeMode: false,
        enterOrganizeMode: () => {},
        activeSelectableRecipeId: null,
      }),
    );
    const clear = result.current.clearRailSelection;
    rerender();
    expect(result.current.clearRailSelection).toBe(clear);
  });
});
