// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ANONYMOUS_OWNER_STORAGE_KEY, anonymousOwnerId } from "@/lib/anonymousOwner";

function clearCookies() {
  for (const pair of document.cookie.split("; ")) {
    const name = pair.split("=")[0];
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  clearCookies();
});

describe("anonymousOwnerId", () => {
  // The free import meter counts a signed-out cook by this id. In PostHog on
  // 2026-11-05, three cooks came back to /print from a Google result and the
  // meter answered 0 used: that tab's localStorage was empty (or a different
  // one), while PostHog's cookie on the same device came through every time.
  it("keeps the same id when localStorage comes up empty, unreadable or unwritable", () => {
    // A visitor from before the cookie keeps the id they already have.
    localStorage.setItem(ANONYMOUS_OWNER_STORAGE_KEY, "existing-browser-id-123");
    const first = anonymousOwnerId();
    expect(first).toBe("existing-browser-id-123");

    const emptied = () => localStorage.clear();
    const unreadable = () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    };
    for (const lose of [emptied, unreadable]) {
      lose();
      expect(anonymousOwnerId()).toBe(first);
      expect(anonymousOwnerId()).toBe(first);
      vi.restoreAllMocks();
    }

    // localStorage refilled from the cookie, so the next visit has both.
    expect(localStorage.getItem(ANONYMOUS_OWNER_STORAGE_KEY)).toBe(first);
  });
});
