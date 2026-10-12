import { afterEach, describe, expect, it, vi } from "vitest";
import { hasCookbookUnlock } from "./cookbookAccess";

// The route's answer to "has this account bought this book" has three outcomes,
// and each one tells the cook something different: yes (export), no (sign in
// with the email you bought it with, 403), or couldn't ask (try again, 503).
// After the pre-namespace unlock path was retired (2026-10-10) and its rules
// closed, every "no" came back as "couldn't ask": the lookup still fell
// through to the old path, Firestore refused the read, and a cook who bought
// with another email was told to try again forever.

/** Firestore's REST API as the rules now answer it: the namespaced unlock is
    readable by its owner, the retired path is refused to everyone. */
function firestore({ unlocked, namespacedRefused = false }: { unlocked: boolean; namespacedRefused?: boolean }) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/documents/users/")) return new Response("{}", { status: 403 });
    if (namespacedRefused) return new Response("{}", { status: 403 });
    return new Response("{}", { status: unlocked ? 200 : 404 });
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("hasCookbookUnlock", () => {
  it("answers yes, no, or couldn't ask, and never mistakes a no for couldn't ask", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "demo-recipeprinter");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    vi.stubGlobal("fetch", firestore({ unlocked: true }));
    await expect(hasCookbookUnlock("buyer", "book-1", "token")).resolves.toBe(true);

    vi.stubGlobal("fetch", firestore({ unlocked: false }));
    await expect(hasCookbookUnlock("buyer", "book-1", "token")).resolves.toBe(false);

    vi.stubGlobal("fetch", firestore({ unlocked: false, namespacedRefused: true }));
    await expect(hasCookbookUnlock("buyer", "book-1", "token")).rejects.toThrow();
  });
});
