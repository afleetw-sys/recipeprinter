import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLocalProjects } from "@/lib/localProjects";
import { releaseWorkingProject } from "@/lib/releaseWorkingProject";
import type { ProjectMeta } from "@/lib/project";
import type { QueueItem } from "@/types/recipe";

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

const bookMeta: ProjectMeta = {
  projectId: "book-a",
  cookbookMode: true,
  cover: { title: "Nana’s Kitchen", template: "heirloom" },
  sections: [{ id: "sec-1", title: "Breads", itemIds: ["r1", "r2"] }],
};

describe("releaseWorkingProject", () => {
  it("files the open book to the shelf, then empties the queue", () => {
    const clear = vi.fn();
    const released = releaseWorkingProject(
      [recipeItem("r1", "Sourdough"), recipeItem("r2", "Focaccia")],
      bookMeta,
      clear,
    );

    expect(released).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    const shelved = loadLocalProjects();
    expect(shelved).toHaveLength(1);
    expect(shelved[0].id).toBe("book-a");
  });

  it("leaves the queue alone when the shelf cannot be written to", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          ...memory,
          getItem: () => null,
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
          removeItem: () => {},
        },
      },
    });
    const clear = vi.fn();

    const released = releaseWorkingProject([recipeItem("r1", "Sourdough")], bookMeta, clear);

    expect(released).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });

  it("does nothing to an empty queue beyond reporting it is clear", () => {
    const clear = vi.fn();

    expect(releaseWorkingProject([], { sections: [] }, clear)).toBe(true);
    expect(clear).not.toHaveBeenCalled();
    expect(loadLocalProjects()).toHaveLength(0);
  });

  it("clears items that are not printable without filing anything", () => {
    const clear = vi.fn();
    const failed: QueueItem = { ...recipeItem("r1", "Broken"), status: "error", recipe: undefined };

    expect(releaseWorkingProject([failed], { sections: [] }, clear)).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(loadLocalProjects()).toHaveLength(0);
  });
});
