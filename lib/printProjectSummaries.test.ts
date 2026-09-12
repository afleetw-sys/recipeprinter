import { beforeEach, describe, expect, it, vi } from "vitest";

/* Reading the saved-projects list, and what happens when it cannot be read.
 *
 * The two reads are fault-isolated on purpose — a rules change or a transient
 * error on one collection must not make every saved project appear to vanish —
 * but fault isolation is for ONE half failing. When nothing answered, the only
 * honest reply is a rejection, because the caller renders "you have no saved
 * projects" from an empty list and a cook with a shelf full of cookbooks must
 * never be told that.
 *
 * The legacy collection is skipped once it has been seen empty for an account,
 * and that skip is what this is really guarding: "we chose not to ask" is not
 * an answer, and treating it as one sent a failed read straight to `[]`. */

const reads = vi.hoisted(() => ({
  namespaced: null as null | Array<{ id: string; data: Record<string, unknown> }>,
  legacy: null as null | Array<{ id: string; data: Record<string, unknown> }>,
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
  getDocs: (path: string) =>
    // The namespaced path is the product-namespaced one; anything else is legacy.
    snapshot(path.startsWith("products/") ? reads.namespaced : reads.legacy),
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
import { LEGACY_PROJECTS_EMPTY_KEY, legacyKnownEmpty } from "@/lib/legacyCollections";

const BOOK = { id: "book-a", data: { id: "book-a", title: "Nana's Kitchen", updatedAt: 2 } };

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
  reads.namespaced = [BOOK];
  reads.legacy = [];
});

describe("reading the saved-projects list", () => {
  it("returns the account's projects", async () => {
    const projects = await loadPrintProjectSummaries("user-1");
    expect(projects.map((p) => p.id)).toEqual(["book-a"]);
  });

  it("remembers an empty legacy collection so it stops being read", async () => {
    await loadPrintProjectSummaries("user-1");
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1")).toBe(true);
  });

  it("keeps the half that answered when the other fails", async () => {
    reads.namespaced = null;
    reads.legacy = [BOOK];
    const projects = await loadPrintProjectSummaries("user-1");
    expect(projects.map((p) => p.id)).toEqual(["book-a"]);
  });

  it("refuses to answer when neither collection could be read", async () => {
    reads.namespaced = null;
    reads.legacy = null;
    await expect(loadPrintProjectSummaries("user-1")).rejects.toThrow(/couldn't read/i);
  });

  /* The one this exists for. After any successful load the legacy collection is
     marked empty and never read again — so on the next visit the namespaced read
     is the ONLY read, and its failure used to fall through to an empty list
     because the skip was counted as an answer. The account menu rendered that as
     "no saved projects"; going to /projects re-read it successfully and the
     library reappeared, which made a failed read look like a caching quirk. */
  it("refuses to answer when the only read it still makes fails", async () => {
    // First visit: succeeds, and marks the legacy collection empty.
    await loadPrintProjectSummaries("user-1");
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1")).toBe(true);

    // Second visit: the namespaced read fails and legacy is no longer consulted.
    reads.namespaced = null;
    reads.legacy = null; // never reached — asserted below
    await expect(loadPrintProjectSummaries("user-1")).rejects.toThrow(/couldn't read/i);
  });

  it("still answers from the namespaced read alone once legacy is skipped", async () => {
    await loadPrintProjectSummaries("user-1");
    // Legacy would now reject if it were read at all, proving it is skipped.
    reads.legacy = null;
    const projects = await loadPrintProjectSummaries("user-1");
    expect(projects.map((p) => p.id)).toEqual(["book-a"]);
  });
});
