import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearPendingImport, stashPendingImport, takePendingImport } from "@/lib/pendingImport";
import type { QueueItem } from "@/types/recipe";

/**
 * The handoff carrier, which every import in the product now travels through.
 *
 * It used to serve the SEO landing pages alone, so a bug in it cost those
 * visitors their first paste. Now the home page hands off through it too — a
 * link, a photo, pasted text, or a whole library pick — and the print page is
 * the only thing that ever starts a parse. That makes this the single narrow
 * place a recipe can be dropped between two pages, which is worth pinning down.
 *
 * Same in-memory stand-in as the queue tests: lib/storage resolves its area per
 * call, so defining `window` is enough to make it usable. IndexedDB is left
 * undefined on purpose — see the last block, which is about what happens when
 * it cannot be reached.
 */
class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const DESCRIPTOR_KEY = "recipeprinter:pending-import:v1";
const session = new MemoryStorage();

function readyItem(id: string, title: string): QueueItem {
  return {
    id,
    method: "paprika",
    source: "Paprika",
    status: "ready",
    title,
    recipe: { title, ingredients: [{ raw: "2 cups flour" }], instructions: [{ text: "Mix." }] },
    addedAt: 0,
  } as unknown as QueueItem;
}

beforeEach(() => {
  session.clear();
  vi.stubGlobal("window", { sessionStorage: session, localStorage: new MemoryStorage() });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the capture handoff", () => {
  it("carries a link across", async () => {
    expect(await stashPendingImport({ kind: "url", url: "https://example.com/soup" })).toBe(true);
    expect(await takePendingImport()).toEqual({ kind: "url", url: "https://example.com/soup" });
  });

  it("carries pasted text across", async () => {
    await stashPendingImport({ kind: "text", text: "Grandma's banana bread\n2 cups flour" });
    expect(await takePendingImport()).toEqual({
      kind: "text",
      text: "Grandma's banana bread\n2 cups flour",
    });
  });

  it("carries a whole library pick across, in the order it was chosen", async () => {
    const recipes = [readyItem("a", "Bruschetta"), readyItem("b", "Borscht")];
    await stashPendingImport({ kind: "ready", recipes });
    const pending = await takePendingImport();
    expect(pending?.kind).toBe("ready");
    expect(pending?.kind === "ready" && pending.recipes.map((r) => r.title)).toEqual([
      "Bruschetta",
      "Borscht",
    ]);
  });
});

describe("consume-and-delete", () => {
  it("hands the payload over exactly once", async () => {
    await stashPendingImport({ kind: "url", url: "https://example.com/soup" });
    expect(await takePendingImport()).not.toBeNull();
    // The print page's effect is guarded against running twice, but a RELOAD
    // mounts a fresh one. Without this, refreshing the print page would import
    // the same recipe again, every time.
    expect(await takePendingImport()).toBeNull();
  });

  it("answers null when nothing was ever stashed", async () => {
    expect(await takePendingImport()).toBeNull();
  });

  it("drops a waiting payload without importing it", async () => {
    await stashPendingImport({ kind: "url", url: "https://example.com/soup" });
    clearPendingImport();
    expect(await takePendingImport()).toBeNull();
  });

  it("supersedes an abandoned capture rather than queueing behind it", async () => {
    // Pasting on one landing page, changing your mind, and pasting on another
    // should import the second link, not the first.
    await stashPendingImport({ kind: "url", url: "https://example.com/first" });
    await stashPendingImport({ kind: "url", url: "https://example.com/second" });
    expect(await takePendingImport()).toEqual({ kind: "url", url: "https://example.com/second" });
    expect(await takePendingImport()).toBeNull();
  });
});

describe("descriptors written by an older deploy", () => {
  it("still reads a `cookpilot` payload as `ready`", async () => {
    // A tab that captured before the rename can still be sitting open after it,
    // and its recipes are perfectly good.
    session.setItem(
      DESCRIPTOR_KEY,
      JSON.stringify({ kind: "cookpilot", recipes: [readyItem("a", "Bruschetta")] }),
    );
    const pending = await takePendingImport();
    expect(pending?.kind).toBe("ready");
    expect(pending?.kind === "ready" && pending.recipes).toHaveLength(1);
  });
});

describe("when the photo store cannot be reached", () => {
  it("refuses the stash rather than promising a handoff it cannot make", async () => {
    // No `indexedDB` on this window (private mode, a locked-down browser). The
    // caller checks this answer: the home page keeps the cook where they are
    // and says so, rather than walking them to an empty print page.
    expect(await stashPendingImport({ kind: "images", images: ["data:,x"], label: "1 photo" })).toBe(
      false,
    );
    expect(session.getItem(DESCRIPTOR_KEY)).toBeNull();
  });
});
