import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isCookbookProjectUnlocked,
  loadCookbookProjectUnlock,
  markCookbookProjectUnlockedLocal,
  markCookbookUnlockPending,
  pendingCookbookUnlock,
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

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

describe("project-scoped cookbook unlocks", () => {
  it("unlocks only the purchased cookbook project", () => {
    markCookbookProjectUnlockedLocal("book-a");
    expect(isCookbookProjectUnlocked("book-a")).toBe(true);
    expect(isCookbookProjectUnlocked("book-b")).toBe(false);
  });

  it("keeps a pending purchase marker until its project is unlocked", () => {
    markCookbookUnlockPending("book-a");
    expect(pendingCookbookUnlock()).toBe("book-a");
    markCookbookProjectUnlockedLocal("book-a");
    expect(pendingCookbookUnlock()).toBeNull();
  });

  // The legacy account-wide bridge used to be tested here. It is gone: it
  // granted whatever project was open to anyone holding the RevenueCat
  // `cookbook` entitlement, guarded only by a localStorage key that a fresh
  // browser profile reset — buy one book, unlock another in incognito. Nothing
  // client-side grants access any more, which is what these two now assert.

  it("grants nothing on its own — an unlock only comes from the stored map", () => {
    expect(isCookbookProjectUnlocked("never-bought")).toBe(false);
    markCookbookProjectUnlockedLocal("bought");
    expect(isCookbookProjectUnlocked("bought")).toBe(true);
    expect(isCookbookProjectUnlocked("never-bought")).toBe(false);
  });

  it("does not spread one project's unlock to another", () => {
    markCookbookProjectUnlockedLocal("book-a");
    expect(isCookbookProjectUnlocked("book-b")).toBe(false);
  });
});

// ── loadCookbookProjectUnlock: the server is the authority ─────────────────
// This function used to open with a local short-circuit, so once the marker
// existed it could never answer "no". That is why deleting every unlock
// document revoked nothing, and why /projects and the print page could sit on
// screen contradicting each other. What matters now is that it grants, revokes,
// AND refuses to conclude anything from a failed read.

const UNLOCKS_KEY = "recipeprinter:cookbook-unlocks:v1";

/** Queues the results the mocked `getDoc` will return, in call order. */
const docResults = vi.hoisted(() => ({ queue: [] as Array<{ exists: boolean } | Error> }));

vi.mock("firebase/firestore", () => ({
  doc: (...path: unknown[]) => ({ path }),
  getDoc: async () => {
    const next = docResults.queue.shift();
    if (next instanceof Error) throw next;
    return { exists: () => Boolean(next?.exists) };
  },
}));
vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));

function seedLocalUnlock(projectId: string, unlockedAt: number) {
  memory.setItem(UNLOCKS_KEY, JSON.stringify({ [projectId]: { unlockedAt } }));
}

const DAY = 24 * 60 * 60 * 1000;

describe("loadCookbookProjectUnlock", () => {
  beforeEach(() => {
    docResults.queue = [];
  });

  it("grants when the server holds the document, and caches it", async () => {
    docResults.queue = [{ exists: true }];
    await expect(loadCookbookProjectUnlock("uid", "book-1")).resolves.toBe(true);
    expect(isCookbookProjectUnlocked("book-1")).toBe(true);
  });

  it("revokes a stale local unlock the server has no record of", async () => {
    seedLocalUnlock("book-1", Date.now() - 30 * DAY);
    // Miss on the namespaced path, then miss on the legacy one = definitive no.
    docResults.queue = [{ exists: false }, { exists: false }];
    await expect(loadCookbookProjectUnlock("uid", "book-1")).resolves.toBe(false);
    expect(isCookbookProjectUnlocked("book-1")).toBe(false);
  });

  it("still honours the legacy path before revoking", async () => {
    seedLocalUnlock("book-1", Date.now() - 30 * DAY);
    docResults.queue = [{ exists: false }, { exists: true }];
    await expect(loadCookbookProjectUnlock("uid", "book-1")).resolves.toBe(true);
    expect(isCookbookProjectUnlocked("book-1")).toBe(true);
  });

  it("keeps a RECENT local unlock the server hasn't caught up with", async () => {
    // A signed-out purchase exists only locally until the buyer signs in and
    // RevenueCat's TRANSFER lets the webhook write it. Revoking here would take
    // a book away from someone who just paid for it.
    seedLocalUnlock("book-1", Date.now() - 60 * 1000);
    docResults.queue = [{ exists: false }, { exists: false }];
    await expect(loadCookbookProjectUnlock("uid", "book-1")).resolves.toBe(true);
    expect(isCookbookProjectUnlocked("book-1")).toBe(true);
  });

  it("concludes nothing when the read fails", async () => {
    // Offline or a rules error is an unanswered question, not a negative
    // answer — a dropped connection must never revoke a purchase.
    seedLocalUnlock("book-1", Date.now() - 30 * DAY);
    docResults.queue = [new Error("offline")];
    await expect(loadCookbookProjectUnlock("uid", "book-1")).resolves.toBe(true);
    expect(isCookbookProjectUnlocked("book-1")).toBe(true);
  });
});
