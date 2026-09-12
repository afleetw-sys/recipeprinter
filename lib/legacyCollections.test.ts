import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_PROJECTS_EMPTY_KEY,
  LEGACY_UNLOCKS_EMPTY_KEY,
  legacyKnownEmpty,
  rememberLegacyEmpty,
} from "@/lib/legacyCollections";

/* This marker is what lets a compatibility read be skipped, so the only failure
   that matters is a marker set when it should not have been: that hides a real
   legacy document — someone's saved cookbook, or the unlock they paid for —
   from the account that owns it. A marker that is merely absent costs a read. */

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

describe("remembering an empty legacy collection", () => {
  it("knows nothing until told", () => {
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1")).toBe(false);
  });

  it("remembers per account, not globally", () => {
    rememberLegacyEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1");
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1")).toBe(true);
    // The account that has not been checked must still be checked.
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-2")).toBe(false);
  });

  it("keeps the two collections apart", () => {
    rememberLegacyEmpty(LEGACY_UNLOCKS_EMPTY_KEY, "user-1");
    expect(legacyKnownEmpty(LEGACY_UNLOCKS_EMPTY_KEY, "user-1")).toBe(true);
    // An empty unlocks collection says nothing about saved projects. Sharing a
    // marker between them would skip a read on evidence about something else.
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1")).toBe(false);
  });

  it("is idempotent rather than accumulating duplicates", () => {
    for (let i = 0; i < 5; i += 1) rememberLegacyEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1");
    expect(memory.getItem(LEGACY_PROJECTS_EMPTY_KEY)).toBe("user-1");
  });

  it("evicts the oldest account rather than growing forever", () => {
    for (let i = 0; i < 12; i += 1) rememberLegacyEmpty(LEGACY_PROJECTS_EMPTY_KEY, `user-${i}`);
    // Falling off only costs that account a read next time.
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-0")).toBe(false);
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-11")).toBe(true);
    expect((memory.getItem(LEGACY_PROJECTS_EMPTY_KEY) ?? "").split(",")).toHaveLength(8);
  });

  it("does not mistake a substring of one uid for another", () => {
    rememberLegacyEmpty(LEGACY_PROJECTS_EMPTY_KEY, "abcdef");
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "abc")).toBe(false);
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "abcdef")).toBe(true);
  });

  it("answers no when storage is unreadable", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem() { throw new Error("unavailable"); },
          setItem() { throw new Error("unavailable"); },
          removeItem() { throw new Error("unavailable"); },
        },
      },
    });
    // The safe direction: perform the compatibility read rather than skip it.
    expect(legacyKnownEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1")).toBe(false);
    expect(() => rememberLegacyEmpty(LEGACY_PROJECTS_EMPTY_KEY, "user-1")).not.toThrow();
  });
});
