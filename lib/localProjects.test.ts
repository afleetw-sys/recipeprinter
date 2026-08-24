import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_LOCAL_PROJECTS,
  deleteLocalProject,
  fileProjectLocally,
  loadLocalProject,
  loadLocalProjects,
  pruneLocalProjects,
  saveLocalProject,
} from "@/lib/localProjects";
import type { ProjectMeta } from "@/lib/project";
import type { PrintProject, QueueItem } from "@/types/recipe";

// Same in-memory stand-in the unlock tests use — lib/storage resolves the
// storage area per call, so defining `window` is enough to make it usable.
class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const memory = new MemoryStorage();

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

function recipeItem(id: string, title: string): QueueItem {
  return {
    id,
    method: "text",
    source: "Pasted text",
    status: "ready",
    title,
    addedAt: 1,
    recipe: {
      title,
      ingredients: [{ raw: "1 cup flour", name: "flour" }],
      instructions: [{ step: 1, text: "Mix and bake." }],
    },
  };
}

function cookbookMeta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    projectId: "book-a",
    cookbookMode: true,
    cover: { title: "Nana’s Kitchen", template: "heirloom" },
    sections: [{ id: "sec-1", title: "Breads", itemIds: ["r1", "r2"] }],
    ...overrides,
  };
}

function project(overrides: Partial<PrintProject> = {}): PrintProject {
  return {
    id: "book-a",
    kind: "cookbook",
    revision: 0,
    ownerUid: "",
    title: "Nana’s Kitchen",
    sections: [],
    settings: {
      cardSize: "letter",
      template: "heirloom",
      doubleSided: true,
      showPhoto: true,
      showSourceUrl: false,
      showCutLines: false,
      cookbookMode: true,
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("the on-device project shelf", () => {
  it("files a cookbook and reads it back whole", () => {
    const items = [recipeItem("r1", "Sourdough"), recipeItem("r2", "Focaccia")];
    expect(fileProjectLocally(items, cookbookMeta())).toBe("book-a");

    const shelved = loadLocalProject("book-a");
    expect(shelved?.title).toBe("Nana’s Kitchen");
    expect(shelved?.kind).toBe("cookbook");
    expect(shelved?.sections.flatMap((section) => section.items)).toHaveLength(2);
    expect(shelved?.sections[0]?.title).toBe("Breads");
  });

  // The whole reason the shelf exists: leaving the workspace must not be able
  // to destroy a book, so filing has to actually report whether it worked.
  it("reports failure rather than silently dropping a book it cannot file", () => {
    expect(fileProjectLocally([], cookbookMeta())).toBeNull();
    expect(loadLocalProjects()).toHaveLength(0);
  });

  it("keeps only ready recipes, so a mid-parse import is never shelved as a page", () => {
    const items: QueueItem[] = [
      recipeItem("r1", "Sourdough"),
      { id: "r2", method: "url", source: "example.com", status: "parsing", title: "example.com", addedAt: 2 },
    ];
    fileProjectLocally(items, cookbookMeta());
    expect(loadLocalProject("book-a")?.sections.flatMap((s) => s.items)).toHaveLength(1);
  });

  // "Print as recipe cards instead" empties the live cookbook fields into
  // `stashedCookbook`. Filing from the live fields alone would shelve a book
  // with its cover missing.
  it("files a book that has been set aside as recipe cards, using its stash", () => {
    const meta = cookbookMeta({
      cover: undefined,
      stashedCookbook: {
        sections: [],
        cover: { title: "The Stashed Book", template: "keepsake" },
      },
    });
    expect(fileProjectLocally([recipeItem("r1", "Sourdough")], meta)).toBe("book-a");
    expect(loadLocalProject("book-a")?.cover?.title).toBe("The Stashed Book");
  });

  // The shelf used to take documents only, on the reasoning that nobody named
  // a plain card run. That inverted once leaving the workspace started clearing
  // the desk: an unfiled card job is now a DESTROYED card job.
  it("shelves a plain card run, which leaving the workspace would otherwise destroy", () => {
    expect(saveLocalProject(project({ kind: "printProject", stashedCookbook: undefined }))).toBe(true);
    expect(loadLocalProjects()).toHaveLength(1);
  });

  it("names a card run after its recipes, so it can be found again", () => {
    const items = [recipeItem("r1", "Sourdough"), recipeItem("r2", "Focaccia")];
    const meta = { ...cookbookMeta(), cookbookMode: false, cover: undefined, stashedCookbook: undefined };
    expect(fileProjectLocally(items, meta)).toBe("book-a");

    const shelved = loadLocalProject("book-a");
    expect(shelved?.kind).toBe("printProject");
    expect(shelved?.title).toBe("Sourdough + 1 more");
  });

  it("names a single-recipe card run after that recipe alone", () => {
    const meta = { ...cookbookMeta(), cookbookMode: false, cover: undefined, stashedCookbook: undefined };
    fileProjectLocally([recipeItem("r1", "Sourdough")], meta);
    expect(loadLocalProject("book-a")?.title).toBe("Sourdough");
  });

  it("returns books newest first", () => {
    saveLocalProject(project({ id: "old", updatedAt: 100 }));
    saveLocalProject(project({ id: "new", updatedAt: 900 }));
    expect(loadLocalProjects().map((entry) => entry.id)).toEqual(["new", "old"]);
  });

  it("replaces a book in place rather than accumulating copies of it", () => {
    saveLocalProject(project({ updatedAt: 100, title: "First name" }));
    saveLocalProject(project({ updatedAt: 200, title: "Renamed" }));
    expect(loadLocalProjects()).toHaveLength(1);
    expect(loadLocalProject("book-a")?.title).toBe("Renamed");
  });

  it("caps the shelf, dropping the oldest project", () => {
    const overflow = 3;
    for (let i = 0; i < MAX_LOCAL_PROJECTS + overflow; i++) {
      saveLocalProject(project({ id: `book-${i}`, updatedAt: i }));
    }
    const shelved = loadLocalProjects();
    expect(shelved).toHaveLength(MAX_LOCAL_PROJECTS);
    // Newest first, so the last survivor is the oldest one that fit.
    expect(shelved.at(-1)?.id).toBe(`book-${overflow}`);
    expect(loadLocalProject("book-0")).toBeNull();
  });

  // A book so old the cap would evict it must not report "filed" — the caller
  // clears the working copy on a true, so that would be the deletion this
  // whole module exists to prevent.
  it("reports failure when the cap would evict the very book being filed", () => {
    for (let i = 1; i <= MAX_LOCAL_PROJECTS; i++) {
      saveLocalProject(project({ id: `book-${i}`, updatedAt: 1000 + i }));
    }
    expect(saveLocalProject(project({ id: "ancient", updatedAt: 1 }))).toBe(false);
    expect(loadLocalProject("ancient")).toBeNull();
  });

  it("sweeps books the account already holds, and leaves the rest alone", () => {
    saveLocalProject(project({ id: "adopted" }));
    saveLocalProject(project({ id: "device-only" }));
    pruneLocalProjects(["adopted"]);
    expect(loadLocalProjects().map((entry) => entry.id)).toEqual(["device-only"]);
  });

  it("removes one book without disturbing its neighbours", () => {
    saveLocalProject(project({ id: "keep", updatedAt: 2 }));
    saveLocalProject(project({ id: "drop", updatedAt: 1 }));
    deleteLocalProject("drop");
    expect(loadLocalProjects().map((entry) => entry.id)).toEqual(["keep"]);
  });

  it("survives unusable storage without throwing", () => {
    Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
    expect(() => loadLocalProjects()).not.toThrow();
    expect(loadLocalProjects()).toEqual([]);
    expect(saveLocalProject(project())).toBe(false);
  });
});

describe("filing the same recipes twice", () => {
  /**
   * The behaviour this whole content key exists for. Printing the same dinner
   * again produces a fresh working copy with a fresh id, and filing it blindly
   * put a second identical project in the library every single time.
   */
  it("files back over the project those recipes already were", () => {
    const items = [recipeItem("r1", "Sourdough")];
    const cards = { ...cookbookMeta(), cookbookMode: false, cover: undefined, stashedCookbook: undefined };

    const first = fileProjectLocally(items, cards);
    // A second visit: same recipes, brand-new working copy id.
    const second = fileProjectLocally(items, { ...cards, projectId: "a-different-id" });

    expect(second).toBe(first);
    expect(loadLocalProjects()).toHaveLength(1);
  });

  it("still files a genuinely different set as its own project", () => {
    const cards = { ...cookbookMeta(), cookbookMode: false, cover: undefined, stashedCookbook: undefined };
    fileProjectLocally([recipeItem("r1", "Sourdough")], cards);
    fileProjectLocally([recipeItem("r2", "Focaccia")], { ...cards, projectId: "second-project" });
    expect(loadLocalProjects()).toHaveLength(2);
  });
});
