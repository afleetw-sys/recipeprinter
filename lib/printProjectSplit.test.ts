import { describe, expect, it } from "vitest";
import { summarizePrintProject, __splitForTest, __summaryOfForTest } from "@/lib/printProjects";
import type { PrintProject, QueueItem, Section } from "@/types/recipe";

function item(id: string, image?: string): QueueItem {
  return {
    id,
    method: "url",
    status: "ready",
    title: `Recipe ${id}`,
    recipe: {
      title: `Recipe ${id}`,
      ingredients: [{ raw: "2 cups flour" }],
      instructions: [{ text: "Mix it." }],
      ...(image ? { image } : {}),
    },
  } as unknown as QueueItem;
}

function book(items: QueueItem[]): PrintProject {
  const sections: Section[] = [{ id: "s1", title: "Mains", items }];
  return {
    id: "book-1",
    kind: "cookbook",
    revision: 4,
    ownerUid: "user-1",
    title: "Family Favorites",
    sections,
    settings: {} as PrintProject["settings"],
    createdAt: 1,
    updatedAt: 2,
  };
}

describe("splitting a project into parent and content", () => {
  it("keeps recipes out of the listed document", () => {
    const { parent, content } = __splitForTest(book([item("r1"), item("r2")]));
    // The whole point: nothing in the parent grows with the recipe text.
    expect(JSON.stringify(parent)).not.toContain("2 cups flour");
    expect(JSON.stringify(parent)).not.toContain("Mix it.");
    expect(content.sections[0].items).toHaveLength(2);
    expect(content.sections[0].items[0].recipe?.ingredients[0].raw).toBe("2 cups flour");
  });

  it("denormalizes exactly what the projects grid draws", () => {
    const { parent } = __splitForTest(book([item("r1", "a.jpg"), item("r2", "b.jpg"), item("r3")]));
    expect(parent.recipeCount).toBe(3);
    expect(parent.coverThumbs).toEqual(["a.jpg", "b.jpg"]);
    expect(parent.contentVersion).toBe(2);
  });

  it("caps the cover mosaic at four and dedupes, in book order", () => {
    const items = ["a.jpg", "b.jpg", "a.jpg", "c.jpg", "d.jpg", "e.jpg"].map((img, i) =>
      item(`r${i}`, img),
    );
    const { parent } = __splitForTest(book(items));
    expect(parent.coverThumbs).toEqual(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
  });

  it("keeps section ids and membership on the parent, for the duplicate sweeper", () => {
    const { parent } = __splitForTest(book([item("r1"), item("r2")]));
    const sections = parent.sections as Array<{ id: string; itemIds: string[] }>;
    expect(sections[0].id).toBe("s1");
    expect(sections[0].itemIds).toEqual(["r1", "r2"]);
  });
});

describe("reading a document whichever way it was written", () => {
  it("summarizes a pre-split document that still has recipes inline", () => {
    // What every already-saved book looks like until it is next saved.
    const legacy = book([item("r1", "a.jpg"), item("r2")]) as unknown as Record<string, unknown>;
    const summary = __summaryOfForTest(legacy);
    expect(summary.recipeCount).toBe(2);
    expect(summary.coverThumbs).toEqual(["a.jpg"]);
    expect(summary.sections[0].itemIds).toEqual(["r1", "r2"]);
    expect(summary.contentVersion).toBe(1);
    expect(summary.title).toBe("Family Favorites");
  });

  it("passes a post-split parent straight through", () => {
    const { parent } = __splitForTest(book([item("r1", "a.jpg")]));
    const summary = __summaryOfForTest(parent);
    expect(summary.contentVersion).toBe(2);
    expect(summary.recipeCount).toBe(1);
    expect(summary.coverThumbs).toEqual(["a.jpg"]);
  });

  it("treats an empty book as inline rather than guessing", () => {
    // A project with no sections carries no evidence either way; the safe read
    // is the old shape, which needs no second document to be complete.
    const summary = __summaryOfForTest({ ...book([]), sections: [] } as unknown as Record<string, unknown>);
    expect(summary.contentVersion).toBe(1);
    expect(summary.recipeCount).toBe(0);
    expect(summary.coverThumbs).toEqual([]);
  });
});

describe("summarizePrintProject", () => {
  it("matches what the split writes, so both list paths agree", () => {
    const project = book([item("r1", "a.jpg"), item("r2", "b.jpg")]);
    const { parent } = __splitForTest(project);
    const summary = summarizePrintProject(project);
    expect(summary.recipeCount).toBe(parent.recipeCount);
    expect(summary.coverThumbs).toEqual(parent.coverThumbs);
    expect(summary.sections).toEqual(parent.sections);
  });
});
