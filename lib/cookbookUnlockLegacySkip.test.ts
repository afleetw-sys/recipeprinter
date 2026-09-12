import { beforeEach, describe, expect, it, vi } from "vitest";

/* Skipping the pre-namespace unlock read.
   The read being skipped is the one that answers "did this person pay for this
   book", so the only failure worth writing tests for is skipping it when there
   was something to find. These pin both halves: that the marker is set ONLY by
   a successful, empty listing, and that it is what stops the point read. */

const docs = vi.hoisted(() => new Set<string>());
const reads = vi.hoisted(() => [] as string[]);
const listing = vi.hoisted(() => ({ legacyFails: false, legacyDocIds: [] as string[] }));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
  collection: (_db: unknown, ...segments: string[]) => segments.join("/"),
  getDoc: async (path: string) => {
    reads.push(path);
    return { exists: () => docs.has(path) };
  },
  getDocs: async (path: string) => {
    reads.push(`LIST ${path}`);
    const legacy = path.startsWith("users/");
    if (legacy && listing.legacyFails) throw new Error("permission denied");
    const ids = legacy ? listing.legacyDocIds : [];
    return {
      empty: ids.length === 0,
      forEach: (fn: (entry: { id: string }) => void) => ids.forEach((id) => fn({ id })),
    };
  },
  setDoc: async () => undefined,
}));

vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));

import {
  loadCookbookProjectUnlock,
  loadCookbookProjectUnlockIds,
} from "@/lib/cookbookUnlocks";

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

const NAMESPACED = "products/recipePrinter/users/buyer/cookbookUnlocks/book-1";
const LEGACY = "users/buyer/cookbookUnlocks/book-1";

beforeEach(() => {
  memory.clear();
  docs.clear();
  reads.length = 0;
  listing.legacyFails = false;
  listing.legacyDocIds = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

describe("the pre-namespace unlock read", () => {
  it("is still made when nothing is known about the legacy collection", async () => {
    expect(await loadCookbookProjectUnlock("buyer", "book-1")).toBe(false);
    expect(reads).toEqual([NAMESPACED, LEGACY]);
  });

  it("still finds an unlock that only exists on the legacy path", async () => {
    docs.add(LEGACY);
    expect(await loadCookbookProjectUnlock("buyer", "book-1")).toBe(true);
  });

  it("is skipped once a listing has shown the legacy collection empty", async () => {
    await loadCookbookProjectUnlockIds("buyer");
    reads.length = 0;

    expect(await loadCookbookProjectUnlock("buyer", "book-1")).toBe(false);
    // One read, not two — and the one that is gone could only ever have missed.
    expect(reads).toEqual([NAMESPACED]);
  });

  it("still answers yes off the namespaced path when the legacy read is skipped", async () => {
    await loadCookbookProjectUnlockIds("buyer");
    docs.add(NAMESPACED);
    reads.length = 0;

    expect(await loadCookbookProjectUnlock("buyer", "book-1")).toBe(true);
    expect(reads).toEqual([NAMESPACED]);
  });

  it("is NOT skipped when the legacy listing failed rather than came back empty", async () => {
    listing.legacyFails = true;
    await loadCookbookProjectUnlockIds("buyer");
    reads.length = 0;

    // A read that threw is the absence of an answer. Treating it as "empty"
    // would hide a real purchase from the person who made it.
    docs.add(LEGACY);
    expect(await loadCookbookProjectUnlock("buyer", "book-1")).toBe(true);
    expect(reads).toContain(LEGACY);
  });

  it("is NOT skipped when the legacy listing found documents", async () => {
    listing.legacyDocIds = ["some-other-book"];
    await loadCookbookProjectUnlockIds("buyer");
    reads.length = 0;

    docs.add(LEGACY);
    expect(await loadCookbookProjectUnlock("buyer", "book-1")).toBe(true);
    expect(reads).toContain(LEGACY);
  });

  it("does not let one account's empty collection skip another's read", async () => {
    await loadCookbookProjectUnlockIds("buyer");
    reads.length = 0;

    docs.add("users/other/cookbookUnlocks/book-1");
    expect(await loadCookbookProjectUnlock("other", "book-1")).toBe(true);
    expect(reads).toContain("users/other/cookbookUnlocks/book-1");
  });
});
