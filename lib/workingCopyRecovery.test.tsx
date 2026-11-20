// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QueueItem } from "@/types/recipe";

/* A phone throws away a background tab, and the cook comes back to a fresh one:
   new sessionStorage, same localStorage. Whatever the cook had in the tab they
   left must come back whole in the new one.

   On 2026-11-19 a cook started a cookbook, left for Pinterest to fetch a link,
   and came back to an empty Recipe cards page. The book's settings and its
   recipes were backed up separately, and an empty book never backed up its
   (empty) recipes, so the new tab refused the settings as unmatched.

   Tab A runs the real hooks; tab B is fresh modules over a cleared
   sessionStorage, which is what a new tab is. */

function recipe(id: string, title: string): QueueItem {
  return { id, method: "url", source: `https://example.com/${id}`, status: "ready", title, recipe: { title, ingredients: [{ raw: "1 egg" }], instructions: [{ text: "Cook" }] }, addedAt: 1 } as unknown as QueueItem;
}

type Case = { name: string; cookbook: boolean; recipes: QueueItem[] };
const CASES: Case[] = [
  { name: "a new cookbook with no recipes yet", cookbook: true, recipes: [] },
  { name: "a cookbook with recipes", cookbook: true, recipes: [recipe("r1", "Rye"), recipe("r2", "Soda bread")] },
  { name: "recipe cards", cookbook: false, recipes: [recipe("r3", "Scones")] },
];

/** Tab A: the cook works in a tab with the real hooks, then the tab goes away. */
async function workInATab(c: Case): Promise<string | undefined> {
  const { useQueue } = await import("@/lib/queue");
  const { useProjectMeta } = await import("@/lib/project");
  const hook = renderHook(() => ({ queue: useQueue(), meta: useProjectMeta() }));
  act(() => {
    if (c.cookbook) hook.result.current.meta.setCookbookMode(true);
  });
  act(() => {
    if (c.recipes.length > 0) hook.result.current.queue.addReadyRecipes(c.recipes);
  });
  const projectId = hook.result.current.meta.meta.projectId;
  // Backgrounded, then thrown away: the page gets its teardown events.
  act(() => {
    window.dispatchEvent(new Event("pagehide"));
  });
  hook.unmount();
  return projectId;
}

/** Tab B: a fresh tab on the same device. */
async function openAFreshTab() {
  sessionStorage.clear();
  vi.resetModules();
  const { readQueue } = await import("@/lib/queue");
  const { readMeta } = await import("@/lib/project");
  return { readQueue, readMeta };
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.resetModules();
});

describe("a fresh tab gets back the work from the tab the phone threw away", () => {
  it.each(CASES)("$name", async (c) => {
    const projectId = await workInATab(c);

    const tab = await openAFreshTab();
    const items = tab.readQueue();
    const meta = tab.readMeta();

    expect(Boolean(meta.cookbookMode)).toBe(c.cookbook);
    expect(meta.projectId).toBe(projectId);
    expect(items.map((item) => item.id)).toEqual(c.recipes.map((r) => r.id));
  });
});
