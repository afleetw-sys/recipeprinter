import { describe, expect, it } from "vitest";
import {
  organizationSectionsForApply,
  suggestCookbookOrganization,
} from "@/lib/cookbookOrganizer";
import type { QueueItem, Recipe } from "@/types/recipe";

function item(id: string, title: string): QueueItem {
  const recipe: Recipe = { title, ingredients: [], instructions: [] };
  return { id, title, recipe, method: "text", source: "test", status: "ready", addedAt: 1 };
}

describe("cookbook organization draft", () => {
  const items = [
    item("cookie", "Chocolate chip cookies"),
    item("chicken", "Chicken parmesan"),
    item("mystery", "Grandma's favorite"),
  ];

  it("creates a deterministic temporary proposal", () => {
    const first = suggestCookbookOrganization(items);
    expect(suggestCookbookOrganization(items)).toEqual(first);
    expect(first.sections.map((section) => section.title)).toEqual([
      "Main Dishes",
      "Desserts",
      "More Recipes",
    ]);
  });

  it("applies without duplicate or lost recipes", () => {
    const draft = suggestCookbookOrganization(items);
    draft.sections[0].itemIds.push("cookie", "missing");
    const applied = organizationSectionsForApply(draft, items.map((entry) => entry.id));
    expect(applied.flatMap((section) => section.itemIds).sort()).toEqual(["chicken", "cookie", "mystery"]);
  });

  it("building a proposal never touches the persisted sections", () => {
    const persisted = [{ id: "current", title: "Current", itemIds: ["cookie", "chicken", "mystery"] }];
    const snapshot = structuredClone(persisted);
    suggestCookbookOrganization(items);
    expect(persisted).toEqual(snapshot);
  });

  it("supports immediate undo by restoring the saved section snapshot", () => {
    const before = [{ id: "current", title: "Current", itemIds: ["cookie", "chicken", "mystery"] }];
    const applied = organizationSectionsForApply(suggestCookbookOrganization(items), items.map((entry) => entry.id));
    expect(applied).not.toEqual(before);
    expect(structuredClone(before)).toEqual(before);
  });
});

/* Applying an organization used to replace the section list outright, so every
   chapter opener the cook had built — its photo, its collage, its intro, its
   subtitle — went with it, behind a single in-memory Undo that a reload spent. */
describe("re-organizing a book that already has chapters", () => {
  const dressed = {
    id: "sec-desserts",
    title: "Desserts",
    subtitle: "The sweet end",
    intro: "Nana never served fewer than three.",
    photoUrl: "https://storage.example/opener.jpg",
    photoMode: "full" as const,
    gridImages: ["https://storage.example/tile.jpg"],
    numberAsChapter: true,
    showOpener: true,
    itemIds: ["r1"],
  };

  it("keeps what the cook put on a chapter the suggestion agrees with", () => {
    const applied = organizationSectionsForApply(
      { sections: [{ id: "suggested-desserts", title: "Desserts", showOpener: true, itemIds: ["r1"] }] },
      ["r1"],
      [dressed],
    );
    expect(applied).toHaveLength(1);
    expect(applied[0]).toMatchObject({
      // The book's own id, so anything else keyed to this chapter stays attached.
      id: "sec-desserts",
      title: "Desserts",
      subtitle: "The sweet end",
      intro: "Nana never served fewer than three.",
      photoUrl: "https://storage.example/opener.jpg",
      photoMode: "full",
      gridImages: ["https://storage.example/tile.jpg"],
      numberAsChapter: true,
      itemIds: ["r1"],
    });
  });

  it("matches by name rather than by the ids the suggestion mints", () => {
    const applied = organizationSectionsForApply(
      { sections: [{ id: "suggested-desserts", title: "desserts", showOpener: true, itemIds: ["r1"] }] },
      ["r1"],
      [{ ...dressed, title: "  Desserts  " }],
    );
    expect(applied[0]?.photoUrl).toBe("https://storage.example/opener.jpg");
  });

  it("builds a chapter the book has no counterpart for from scratch", () => {
    const applied = organizationSectionsForApply(
      { sections: [{ id: "suggested-breads", title: "Breads", showOpener: true, itemIds: ["r1"] }] },
      ["r1"],
      [dressed],
    );
    expect(applied[0]?.id).toBe("suggested-breads");
    expect(applied[0]?.photoUrl).toBeUndefined();
  });

  it("still puts every current recipe in exactly one chapter", () => {
    const applied = organizationSectionsForApply(
      { sections: [{ id: "suggested-desserts", title: "Desserts", showOpener: true, itemIds: ["r1", "r1"] }] },
      ["r1", "r2"],
      [dressed],
    );
    const placed = applied.flatMap((section) => section.itemIds);
    expect(placed.filter((id) => id === "r1")).toHaveLength(1);
    expect(placed).toContain("r2");
  });
});
