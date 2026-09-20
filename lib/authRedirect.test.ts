import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const session = new MemoryStorage();

async function fresh() {
  vi.resetModules();
  return import("@/lib/authRedirect");
}

beforeEach(() => {
  vi.useFakeTimers();
  session.clear();
  vi.stubGlobal("window", { sessionStorage: session, localStorage: new MemoryStorage() });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the pending-redirect marker", () => {
  it("says nothing is pending on an ordinary load", async () => {
    const { hasAuthRedirectPending } = await fresh();
    expect(hasAuthRedirectPending()).toBe(false);
  });

  it("is pending from the moment a redirect leaves until it has been read", async () => {
    const { markAuthRedirectPending, hasAuthRedirectPending, clearAuthRedirectPending } = await fresh();
    markAuthRedirectPending();
    expect(hasAuthRedirectPending()).toBe(true);
    clearAuthRedirectPending();
    expect(hasAuthRedirectPending()).toBe(false);
  });

  it("survives the page load a redirect comes back to", async () => {
    const first = await fresh();
    first.markAuthRedirectPending();
    // The return leg is a new document: same tab storage, new module instance.
    const returned = await fresh();
    expect(returned.hasAuthRedirectPending()).toBe(true);
  });

  it("stops counting a marker left by a redirect that never came back", async () => {
    const { markAuthRedirectPending, hasAuthRedirectPending } = await fresh();
    markAuthRedirectPending();
    vi.advanceTimersByTime(16 * 60_000);
    expect(hasAuthRedirectPending()).toBe(false);
  });

  it("treats a garbled value as not pending", async () => {
    session.setItem("recipeprinter:auth-redirect-pending:v1", "yes");
    const { hasAuthRedirectPending } = await fresh();
    expect(hasAuthRedirectPending()).toBe(false);
  });
});
