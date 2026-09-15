import { describe, expect, it } from "vitest";
import { copyCardsToNewCookbook, copyCookbookToNewCards } from "@/lib/projectCopy";
import type { ProjectMeta } from "@/lib/project";
import type { QueueItem } from "@/types/recipe";

function item(id: string, title: string, localPhotoId?: string): QueueItem {
  return {
    id,
    method: "url",
    source: "example.com",
    status: "ready",
    title,
    recipe: { title, ingredients: [], instructions: [] },
    addedAt: 1,
    ...(localPhotoId ? { localPhotoId } : {}),
  };
}

const BLANK_SCAFFOLD = {
  template: "classic" as const,
  tableOfContents: true,
  sectionDividers: false,
};

describe("copying recipes into a brand-new cookbook", () => {
  it("mints a fresh project id, distinct from the source", () => {
    const source = {
      meta: { projectId: "cards-1", sections: [] } as ProjectMeta,
      items: [item("r1", "Banana Bread")],
    };
    const result = copyCardsToNewCookbook(source, BLANK_SCAFFOLD);
    expect(result.meta.projectId).toBeTruthy();
    expect(result.meta.projectId).not.toBe("cards-1");
    expect(result.meta.sourceProjectId).toBe("cards-1");
  });

  it("gives every copied recipe a fresh id, never reusing the source's", () => {
    const source = {
      meta: { projectId: "cards-1", sections: [{ id: "s1", itemIds: ["r1", "r2"] }] } as ProjectMeta,
      items: [item("r1", "Banana Bread"), item("r2", "Chili")],
    };
    const result = copyCardsToNewCookbook(source, BLANK_SCAFFOLD);
    const newIds = result.items.map((i) => i.id);
    expect(newIds).toHaveLength(2);
    expect(newIds).not.toContain("r1");
    expect(newIds).not.toContain("r2");
    expect(new Set(newIds).size).toBe(2);
    // Content survives the id change.
    expect(result.items.map((i) => i.recipe?.title)).toEqual(["Banana Bread", "Chili"]);
    // The section's own membership follows the new ids.
    expect(result.meta.sections[0].itemIds).toEqual(newIds);
  });

  it("drops a dangling localPhotoId, which pointed at the old id", () => {
    const source = {
      meta: { projectId: "cards-1", sections: [] } as ProjectMeta,
      items: [item("r1", "Banana Bread", "local-blob-1")],
    };
    const result = copyCardsToNewCookbook(source, BLANK_SCAFFOLD);
    expect(result.items[0].localPhotoId).toBeUndefined();
  });

  it("turns cookbookMode on and clears any cookbookIntent/stash", () => {
    const source = {
      meta: { projectId: "cards-1", sections: [], cookbookIntent: true } as ProjectMeta,
      items: [item("r1", "Banana Bread")],
    };
    const result = copyCardsToNewCookbook(source, BLANK_SCAFFOLD);
    expect(result.meta.cookbookMode).toBe(true);
    expect(result.meta.cookbookIntent).toBeUndefined();
    expect(result.meta.stashedCookbook).toBeUndefined();
  });

  it("falls back to the source's own cover when the scaffold left it unset", () => {
    // buildCookbookScaffoldPatch (app/print/page.tsx) only returns a `cover`
    // when the source had none — mirroring that contract here: a scaffold
    // with no cover of its own must not blank out one the source already had.
    const source = {
      meta: {
        projectId: "cards-1",
        sections: [],
        cover: { title: "Already mine", template: "classic" as const },
      } as ProjectMeta,
      items: [item("r1", "Banana Bread")],
    };
    const result = copyCardsToNewCookbook(source, BLANK_SCAFFOLD);
    expect(result.meta.cover?.title).toBe("Already mine");
  });

  it("takes the scaffold's cover when the source had none", () => {
    const source = {
      meta: { projectId: "cards-1", sections: [] } as ProjectMeta,
      items: [item("r1", "Banana Bread")],
    };
    const result = copyCardsToNewCookbook(source, {
      ...BLANK_SCAFFOLD,
      cover: { title: "Our Favorite Recipes", template: "classic" },
    });
    expect(result.meta.cover?.title).toBe("Our Favorite Recipes");
  });
});

describe("copying a book's recipes into brand-new recipe cards", () => {
  it("mints a fresh project id and drops every cookbook-only field", () => {
    const source = {
      meta: {
        projectId: "book-1",
        cookbookMode: true,
        cookbookWelcomeCompleted: true,
        sections: [{ id: "s1", title: "Mains", itemIds: ["r1"] }],
        cover: { title: "Our Book", template: "classic" as const },
        backCover: { title: "", template: "classic" as const },
        tableOfContents: true,
        itemPlacements: { r1: { pageLayout: "image-spread" as const } },
      } as ProjectMeta,
      items: [item("r1", "Banana Bread")],
    };
    const result = copyCookbookToNewCards(source);
    expect(result.meta.projectId).not.toBe("book-1");
    expect(result.meta.sourceProjectId).toBe("book-1");
    expect(result.meta.cookbookMode).toBe(false);
    expect(result.meta.cover).toBeUndefined();
    expect(result.meta.backCover).toBeUndefined();
    expect(result.meta.tableOfContents).toBeUndefined();
    expect(result.meta.itemPlacements).toBeUndefined();
    expect(result.meta.stashedCookbook).toBeUndefined();
    // Chapter structure collapses, matching exitCookbook's "sections: []".
    expect(result.meta.sections).toEqual([]);
    // The recipe itself still comes along, on a fresh id.
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).not.toBe("r1");
    expect(result.items[0].recipe?.title).toBe("Banana Bread");
  });
});

describe("the two directions never reuse an id", () => {
  it("a cookbook made from cards, then cards made from that cookbook, share no item ids", () => {
    const cardsSource = {
      meta: { projectId: "cards-1", sections: [{ id: "s1", itemIds: ["r1"] }] } as ProjectMeta,
      items: [item("r1", "Banana Bread")],
    };
    const cookbook = copyCardsToNewCookbook(cardsSource, BLANK_SCAFFOLD);
    const cardsAgain = copyCookbookToNewCards({ meta: cookbook.meta, items: cookbook.items });

    const cardsIds = new Set(cardsSource.items.map((i) => i.id));
    const cookbookIds = new Set(cookbook.items.map((i) => i.id));
    const cardsAgainIds = new Set(cardsAgain.items.map((i) => i.id));

    expect(Array.from(cookbookIds).some((id) => cardsIds.has(id))).toBe(false);
    expect(Array.from(cardsAgainIds).some((id) => cardsIds.has(id) || cookbookIds.has(id))).toBe(false);
  });
});
