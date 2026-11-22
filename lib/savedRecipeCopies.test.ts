import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintProject, QueueItem } from "@/types/recipe";

const shareRecipe = vi.fn();
vi.mock("@/lib/linkedRecipeStore", () => ({ shareRecipe: (...args: unknown[]) => shareRecipe(...args) }));

import { copiesOfPickedRecipes } from "@/lib/savedRecipeCopies";

function picked(projectId: string, cookbook: boolean, linked: boolean): { project: PrintProject; item: QueueItem } {
  const item = {
    id: `${projectId}-item`,
    method: "manual",
    source: "test",
    status: "ready",
    title: "Lemon Chicken",
    addedAt: 0,
    recipe: { title: "Lemon Chicken", ingredients: [{ raw: "1 cup flour" }], instructions: [{ step: 1, text: "Mix." }] },
    ...(linked ? { link: { id: "shared-record", base: {} } } : {}),
  } as unknown as QueueItem;
  const project = {
    id: projectId,
    sections: [{ id: "s1", title: "", items: [item] }],
    settings: { cookbookMode: cookbook, ownPhotosOnly: cookbook },
  } as unknown as PrintProject;
  return { project, item };
}

beforeEach(() => {
  shareRecipe.mockReset();
  shareRecipe.mockImplementation(async (_uid: string, input: { shared: unknown }) => ({
    recipe: input.shared,
    link: { id: "shared-record", base: {} },
  }));
});

describe("copiesOfPickedRecipes", () => {
  it("adds recipes from other projects as separate copies, never linked to where they came from", async () => {
    // Amelia, 2026-11-22: recipes added from "Your recipes" were linked, so an
    // edit here said "Updated in 2 projects too" and changed the projects they
    // came from. Whatever the source (cards or a cookbook, a recipe that is
    // itself linked there or not), the copy here is its own.
    const sources = [
      picked("cards", false, false),
      picked("cards-linked", false, true),
      picked("book", true, false),
      picked("book-linked", true, true),
    ];
    const copies = copiesOfPickedRecipes(sources);

    expect(shareRecipe).not.toHaveBeenCalled();
    expect(copies).toHaveLength(sources.length);
    copies.forEach((copy, index) => {
      expect(copy.link).toBeUndefined();
      expect(copy.status).toBe("ready");
      expect(copy.recipe?.title).toBe("Lemon Chicken");
      expect(copy.recipe?.ingredients).toEqual(sources[index]!.item.recipe!.ingredients);
      expect(copy.id).not.toBe(sources[index]!.item.id);
    });
  });
});
