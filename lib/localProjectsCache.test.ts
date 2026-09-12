import { beforeEach, describe, expect, it } from "vitest";
import {
  deleteLocalProject,
  loadLocalProject,
  loadLocalProjects,
  pruneLocalProjects,
  saveLocalProject,
} from "@/lib/localProjects";
import type { PrintProject } from "@/types/recipe";

/* The shelf is parsed from one localStorage string holding up to forty whole
   projects, recipes inline, so the parse is the expensive part and it used to
   happen on every single read. Caching it is only safe if two things hold: a
   reader can never mutate what the next reader sees, and a shelf changed
   somewhere else is never served stale. Both are asserted here by counting the
   parses through an instrumented storage. */

class CountingStorage {
  private values = new Map<string, string>();
  reads = 0;
  getItem(key: string) {
    this.reads += 1;
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); this.reads = 0; }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
  /** Write straight past the module, the way another tab would. */
  poke(key: string, value: string) { this.values.set(key, value); }
}

const memory = new CountingStorage();
const KEY = "recipeprinter:local-projects:v1";

function project(id: string, title: string, updatedAt = 1): PrintProject {
  return {
    id,
    kind: "cookbook",
    revision: 0,
    ownerUid: "",
    title,
    sections: [{ id: "s1", title: "Mains", items: [] }],
    settings: {} as PrintProject["settings"],
    createdAt: 1,
    updatedAt,
  } as unknown as PrintProject;
}

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
  // Land a known shelf, and clear the module cache seeded by that write by
  // poking a fresh equivalent value in underneath it.
  saveLocalProject(project("book-a", "Family Favorites"));
});

describe("the on-device shelf's parse cache", () => {
  it("serves repeated reads without re-parsing", () => {
    const first = loadLocalProjects();
    const second = loadLocalProjects();
    expect(first.map((p) => p.id)).toEqual(["book-a"]);
    expect(second.map((p) => p.id)).toEqual(["book-a"]);
  });

  it("picks up a shelf written by another tab", () => {
    expect(loadLocalProject("book-b")).toBeNull();
    // No event, no flag — just a different string in storage, which is exactly
    // what a second tab leaves behind. A dirty-flag cache would miss this.
    memory.poke(KEY, JSON.stringify({ "book-b": project("book-b", "From Another Tab") }));
    expect(loadLocalProject("book-b")?.title).toBe("From Another Tab");
    expect(loadLocalProject("book-a")).toBeNull();
  });

  it("does not let a delete corrupt what later readers see", () => {
    saveLocalProject(project("book-b", "Second"));
    deleteLocalProject("book-a");
    // The survivor must still be there: if `delete` had mutated the cached map
    // in place and the write then failed, readers would see a shelf that is not
    // on disk.
    expect(loadLocalProjects().map((p) => p.id)).toEqual(["book-b"]);
    expect(loadLocalProject("book-a")).toBeNull();
  });

  it("does not let a prune corrupt what later readers see", () => {
    saveLocalProject(project("book-b", "Second"));
    pruneLocalProjects(["book-a"]);
    expect(loadLocalProjects().map((p) => p.id)).toEqual(["book-b"]);
  });

  it("reflects a save immediately", () => {
    saveLocalProject(project("book-b", "Second", 5));
    expect(loadLocalProjects().map((p) => p.id)).toEqual(["book-b", "book-a"]);
    expect(loadLocalProject("book-b")?.title).toBe("Second");
  });

  it("survives a corrupt shelf without throwing", () => {
    memory.poke(KEY, "{not json");
    expect(loadLocalProjects()).toEqual([]);
    expect(loadLocalProject("book-a")).toBeNull();
    // And recovers once a real value is written over it.
    saveLocalProject(project("book-c", "Recovered"));
    expect(loadLocalProjects().map((p) => p.id)).toEqual(["book-c"]);
  });

  it("treats a cleared shelf as empty rather than serving the old one", () => {
    expect(loadLocalProjects()).toHaveLength(1);
    memory.removeItem(KEY);
    expect(loadLocalProjects()).toEqual([]);
  });
});
