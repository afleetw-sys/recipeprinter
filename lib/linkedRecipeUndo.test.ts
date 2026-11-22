// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { QueueItem, Recipe, RecipeLink } from "@/types/recipe";
import {
  noteHistoryCommit,
  rebaseRecipeFields,
  redoEdit,
  undoEdit,
  useEditHistory,
  withoutHistory,
} from "@/lib/editHistory";

/* Undo in a card job printed from a cookbook. Its edits reach the book, so
   Undo there has to be exactly right: it takes back what was done HERE, and
   never quietly reverts a change that came in from the book (which would then
   sync back out as if the cook had made it), or roll a recipe's link back to a
   version it has already moved past. */

let clock = 0;
let queue: QueueItem[] = [];

function commit(next: QueueItem[]) {
  queue = next;
  noteHistoryCommit("queue", next);
}

const pie: Recipe = { title: "Pie", ingredients: [], instructions: [], servings: 8 };
const linkV1: RecipeLink = { id: "book_b1", rev: 1, base: { title: "a" } };
const linkV2: RecipeLink = { id: "book_b1", rev: 2, base: { title: "b" } };

function withRecipe(changes: Partial<Recipe>, link: RecipeLink): QueueItem {
  const recipe = { ...(queue[0]?.recipe ?? pie), ...changes };
  return { id: "c1", method: "url", source: "x", status: "ready", title: recipe.title, recipe, link, addedAt: 1 };
}

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  queue = [{ id: "c1", method: "url", source: "x", status: "ready", title: "Pie", recipe: pie, link: linkV1, addedAt: 1 }];
  const adapter = (read: () => unknown, write: (next: unknown) => void) => ({ read, write });
  renderHook(() =>
    useEditHistory({
      ready: true,
      adapters: {
        queue: adapter(() => queue, (next) => commit(next as QueueItem[])),
        meta: adapter(() => ({}), () => {}),
        job: adapter(() => [], () => {}),
        settings: adapter(() => ({}), () => {}),
      },
      job: [],
      settings: {},
    }),
  );
  // Past the quiet spell after the project opens.
  clock = 5_000;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("undo in a linked card job", () => {
  it("undoes the edit made here, keeps what came in from the book, and keeps the current link", () => {
    // The cook retitles the card.
    commit([withRecipe({ title: "Grandma's pie" }, linkV1)]);
    clock += 5_000;
    // The book changed the servings; the sync brings that in, outside history,
    // and moves the link on.
    withoutHistory(() => commit([withRecipe({ servings: 6 }, linkV2)]));
    rebaseRecipeFields("c1", { servings: 6 });

    expect(undoEdit()).toBe(true);
    expect(queue[0]!.recipe).toMatchObject({ title: "Pie", servings: 6 });
    expect(queue[0]!.link).toEqual(linkV2);

    // Redo puts the cook's edit back, still on top of the book's change.
    expect(redoEdit()).toBe(true);
    expect(queue[0]!.recipe).toMatchObject({ title: "Grandma's pie", servings: 6 });
    expect(queue[0]!.link).toEqual(linkV2);
  });

  it("a change that came in from the book is not itself an undo step", () => {
    withoutHistory(() => commit([withRecipe({ servings: 6 }, linkV2)]));
    rebaseRecipeFields("c1", { servings: 6 });
    expect(undoEdit()).toBe(false);
    expect(queue[0]!.recipe!.servings).toBe(6);
  });
});
