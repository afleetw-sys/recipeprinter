import { beforeEach, describe, expect, it, vi } from "vitest";

/* The device keeps ONE snapshot of the working copy (lib/workingDraft): the
   recipes, the book around them and the saved version it was edited from,
   written together. These assert what the three separate backups it replaced
   had to be stamped and paired to get right: a fresh tab gets one book back
   whole, two tabs never mix, and backups left by the previous release still
   come back. */

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const local = new MemoryStorage();

function book(projectId: string, coverTitle: string) {
  return JSON.stringify({
    projectId,
    cookbookMode: true,
    cover: { title: coverTitle, template: "heirloom" },
    sections: [{ id: "s1", title: "Breads", itemIds: ["r1"] }],
  });
}

const recipes = (title: string) => JSON.stringify([{ id: "r1", status: "ready", title, recipe: { title } }]);

/** A tab: its own sessionStorage and its own copy of the modules, on the shared device storage. */
async function tab() {
  const session = new MemoryStorage();
  const use = () =>
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: local, sessionStorage: session },
    });
  use();
  vi.resetModules();
  const draft = await import("@/lib/workingDraft");
  const queue = await import("@/lib/queue");
  const project = await import("@/lib/project");
  const base = await import("@/lib/workingBase");
  return {
    /** Runs `fn` as this tab, since storage is resolved per call. */
    as<T>(fn: () => T): T {
      use();
      return fn();
    },
    readQueue: () => (use(), queue.readQueue()),
    readMeta: () => (use(), project.readMeta()),
    unsavedEditsBase: (id: string) => (use(), base.unsavedEditsBase(id)),
    /** A write through the queue and meta stores, as the hooks make them. */
    work(projectId: string, title: string) {
      use();
      session.setItem(draft.QUEUE_SESSION_KEY, recipes(title));
      session.setItem(draft.META_SESSION_KEY, book(projectId, title));
      draft.saveWorkingDraft();
    },
    editedFrom(projectId: string, revision: number) {
      use();
      base.rememberWorkingBase(projectId, revision);
      base.markWorkingCopyEdited();
    },
  };
}

beforeEach(() => {
  local.clear();
});

describe("the device snapshot", () => {
  it("brings a book back whole, with the saved version it was edited from", async () => {
    const a = await tab();
    a.work("book-a", "Nana’s Kitchen");
    a.editedFrom("book-a", 7);

    const fresh = await tab();
    expect(fresh.readQueue().map((it) => it.title)).toEqual(["Nana’s Kitchen"]);
    const meta = fresh.readMeta();
    expect(meta.projectId).toBe("book-a");
    expect(meta.cover?.title).toBe("Nana’s Kitchen");
    expect(fresh.unsavedEditsBase("book-a")).toBe(7);
  });

  it("never pairs one tab's recipes with another tab's book", async () => {
    const a = await tab();
    const b = await tab();
    a.work("book-a", "From A");
    b.work("book-b", "From B");
    // A writes again after B: the snapshot is all A, never A's recipes in B's book.
    a.work("book-a", "From A again");

    const fresh = await tab();
    expect(fresh.readMeta().projectId).toBe("book-a");
    expect(fresh.readQueue().map((it) => it.title)).toEqual(["From A again"]);
  });

  it("is taken once per tab, so a later save from another tab never lands in this one", async () => {
    const a = await tab();
    a.work("book-a", "From A");
    const fresh = await tab();
    expect(fresh.readMeta().projectId).toBe("book-a");

    const b = await tab();
    b.work("book-b", "From B");

    expect(fresh.readMeta().projectId).toBe("book-a");
    expect(fresh.readQueue().map((it) => it.title)).toEqual(["From A"]);
  });
});

describe("backups left by the previous release", () => {
  const OLD = {
    queue: "recipeprinter:queue:recovery:v1",
    meta: "recipeprinter:project-meta:recovery:v1",
    queueOwner: "recipeprinter:queue:recovery:owner:v1",
    metaOwner: "recipeprinter:project-meta:recovery:owner:v1",
  };

  it.each([
    { name: "one tab wrote both", queue: true, queueOwner: "t1", metaOwner: "t1", keepsBook: true },
    { name: "a cookbook with no recipes yet", queue: false, queueOwner: null, metaOwner: "t1", keepsBook: true },
    { name: "two tabs wrote them", queue: true, queueOwner: "t2", metaOwner: "t1", keepsBook: false },
  ])("$name", async (c) => {
    if (c.queue) local.setItem(OLD.queue, recipes("Rye"));
    local.setItem(OLD.meta, book("book-a", "Nana’s Kitchen"));
    if (c.queueOwner) local.setItem(OLD.queueOwner, c.queueOwner);
    if (c.metaOwner) local.setItem(OLD.metaOwner, c.metaOwner);

    const fresh = await tab();
    expect(fresh.readQueue()).toHaveLength(c.queue ? 1 : 0);
    // Mismatched halves keep the recipes under a fresh identity, so nothing
    // autosaves over the book those chapters name.
    expect(fresh.readMeta().projectId === "book-a").toBe(c.keepsBook);
  });
});
