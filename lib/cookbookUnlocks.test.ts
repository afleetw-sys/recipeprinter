import { beforeEach, describe, expect, it } from "vitest";
import {
  claimLegacyCookbookUnlock,
  isCookbookProjectUnlocked,
  markCookbookProjectUnlockedLocal,
  markCookbookUnlockPending,
  markProjectScopedCookbookPurchase,
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

  it("allows the legacy global purchase bridge only once", () => {
    expect(claimLegacyCookbookUnlock("legacy-book")).toBe(true);
    expect(claimLegacyCookbookUnlock("future-book")).toBe(false);
    expect(isCookbookProjectUnlocked("legacy-book")).toBe(true);
    expect(isCookbookProjectUnlocked("future-book")).toBe(false);
  });

  it("does not grant a future project after a project-scoped purchase", () => {
    markProjectScopedCookbookPurchase("paid-book");
    expect(claimLegacyCookbookUnlock("future-book")).toBe(false);
  });
});
