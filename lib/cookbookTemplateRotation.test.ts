import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COOKBOOK_TEMPLATE_ROTATION,
  COOKBOOK_TEMPLATE_ROTATION_KEY,
  nextCookbookTemplate,
} from "@/lib/cookbookTemplateRotation";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

let memory: MemoryStorage;

beforeEach(() => {
  memory = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window");
});

// KNOWN QUIRK, pinned as-is (this file came out of app/print/page.tsx in a
// verbatim move, so behavior is deliberately unchanged). With nothing stored,
// `localStore.get` returns null and `Number(null)` is 0, not NaN, so the
// "start from -1" fallback never fires: the first book lands on index 1 and
// the first theme is skipped until the rotation wraps. A corrupt value, by
// contrast, is NaN and does start at index 0. Fixing it is a behavior change
// and belongs in its own commit, which should update these expectations.
const [FIRST, SECOND, THIRD, FOURTH] = COOKBOOK_TEMPLATE_ROTATION;

describe("nextCookbookTemplate", () => {
  it("with nothing stored, skips the first theme and walks the rest in order", () => {
    const seen = COOKBOOK_TEMPLATE_ROTATION.map(() => nextCookbookTemplate());
    expect(seen).toEqual([SECOND, THIRD, FOURTH, FIRST]);
  });

  it("wraps back to the first theme after the last", () => {
    memory.setItem(COOKBOOK_TEMPLATE_ROTATION_KEY, String(COOKBOOK_TEMPLATE_ROTATION.length - 1));
    expect(nextCookbookTemplate()).toBe(FIRST);
  });

  it("persists the index so the next new book lands on the next theme", () => {
    nextCookbookTemplate();
    expect(memory.getItem(COOKBOOK_TEMPLATE_ROTATION_KEY)).toBe("1");
    nextCookbookTemplate();
    expect(memory.getItem(COOKBOOK_TEMPLATE_ROTATION_KEY)).toBe("2");
  });

  it("recovers from a corrupt stored index by starting over", () => {
    memory.setItem(COOKBOOK_TEMPLATE_ROTATION_KEY, "not a number");
    expect(nextCookbookTemplate()).toBe(FIRST);
  });

  it("returns the first theme when there is no window (server render)", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(nextCookbookTemplate()).toBe(COOKBOOK_TEMPLATE_ROTATION[0]);
  });

  it("does not throw when storage throws (Safari private mode)", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      get() {
        return {
          get localStorage(): never {
            throw new Error("SecurityError");
          },
        };
      },
    });
    // Storage unreadable behaves like nothing stored, so it hits the quirk too.
    expect(nextCookbookTemplate()).toBe(SECOND);
  });
});
