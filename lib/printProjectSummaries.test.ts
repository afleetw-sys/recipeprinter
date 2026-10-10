import { beforeEach, describe, expect, it, vi } from "vitest";

/* Reading the saved-projects list, and what happens when it cannot be read.
 *
 * When the read fails, the only honest reply is a rejection, because the caller
 * renders "you have no saved projects" from an empty list and a cook with a
 * shelf full of cookbooks must never be told that.
 *
 * Only the namespaced collection is read. The pre-namespace one was retired
 * 2026-10-10 once an audit found it empty, and the rules no longer allow it. */

const reads = vi.hoisted(() => ({
  namespaced: null as null | Array<{ id: string; data: Record<string, unknown> }>,
  paths: [] as string[],
}));

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }> | null) {
  if (docs === null) return Promise.reject(new Error("unavailable"));
  return Promise.resolve({
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  });
}

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join("/"),
  query: (path: string) => path,
  orderBy: () => "orderBy",
  getDocs: (path: string) => {
    reads.paths.push(path);
    return snapshot(reads.namespaced);
  },
}));
vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));

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

import { loadPrintProjectSummaries } from "@/lib/printProjects";

const BOOK = { id: "book-a", data: { id: "book-a", title: "Nana's Kitchen", updatedAt: 2 } };

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
  reads.namespaced = [BOOK];
  reads.paths = [];
});

describe("reading the saved-projects list", () => {
  it("returns the account's projects", async () => {
    const projects = await loadPrintProjectSummaries("user-1");
    expect(projects.map((p) => p.id)).toEqual(["book-a"]);
  });

  it("reads the namespaced collection and nothing else", async () => {
    await loadPrintProjectSummaries("user-1");
    expect(reads.paths).toEqual(["products/recipePrinter/users/user-1/printProjects"]);
  });

  /* The one this exists for. A failed read used to fall through to an empty
     list. The account menu rendered that as "no saved projects"; going to
     /projects re-read it successfully and the library reappeared, which made a
     failed read look like a caching quirk. */
  it("refuses to answer when the read fails, on a first visit or a later one", async () => {
    reads.namespaced = null;
    await expect(loadPrintProjectSummaries("user-1")).rejects.toThrow(/couldn't read/i);

    reads.namespaced = [BOOK];
    await loadPrintProjectSummaries("user-1");
    reads.namespaced = null;
    await expect(loadPrintProjectSummaries("user-1")).rejects.toThrow(/couldn't read/i);
  });
});
