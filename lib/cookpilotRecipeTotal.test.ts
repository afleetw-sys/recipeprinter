import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCachedCookPilotTotal, loadCookPilotRecipeTotal } from "@/lib/cookpilotRecipes";

// ── The library total behind the CookPilot picker's heading ────────────────
// The heading used to count what had loaded, which is the page size and not
// the library: "(30+)" for a library of 64, whatever its real size. This is
// the count that replaced it, and the three things it has to get right are
// that it asks the server once, that concurrent callers share that one ask,
// and that failing to count is not an error the picker has to show.

/** Queues the results the mocked `getCountFromServer` will return, in call order. */
const counts = vi.hoisted(() => ({
  queue: [] as Array<number | Error>,
  calls: 0,
}));

vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: (...path: unknown[]) => ({ path }),
  doc: (...path: unknown[]) => ({ path }),
  getCountFromServer: async () => {
    counts.calls += 1;
    const next = counts.queue.shift();
    if (next instanceof Error) throw next;
    return { data: () => ({ count: next ?? 0 }) };
  },
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({ docs: [] }),
  limit: () => ({}),
  orderBy: () => ({}),
  query: () => ({}),
  startAfter: () => ({}),
}));
vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));

describe("loadCookPilotRecipeTotal", () => {
  let user = 0;
  /** A fresh uid per test: the cache is module-level and keyed by user. */
  const uid = () => `uid-${(user += 1)}`;

  beforeEach(() => {
    counts.queue = [];
    counts.calls = 0;
  });

  it("reports the server's count, not the page size", async () => {
    counts.queue = [64];
    await expect(loadCookPilotRecipeTotal(uid())).resolves.toBe(64);
  });

  it("asks once and serves the rest from cache", async () => {
    const id = uid();
    counts.queue = [64];
    await loadCookPilotRecipeTotal(id);
    await loadCookPilotRecipeTotal(id);
    expect(counts.calls).toBe(1);
    expect(getCachedCookPilotTotal(id)).toBe(64);
  });

  it("shares one request between callers that overlap", async () => {
    const id = uid();
    counts.queue = [12];
    const [a, b] = await Promise.all([
      loadCookPilotRecipeTotal(id),
      loadCookPilotRecipeTotal(id),
    ]);
    expect([a, b]).toEqual([12, 12]);
    expect(counts.calls).toBe(1);
  });

  it("resolves to null when the count fails, so the picker can fall back", async () => {
    counts.queue = [new Error("permission-denied")];
    await expect(loadCookPilotRecipeTotal(uid())).resolves.toBeNull();
  });

  it("does not cache a failure, so a later visit can try again", async () => {
    const id = uid();
    counts.queue = [new Error("offline"), 7];
    await expect(loadCookPilotRecipeTotal(id)).resolves.toBeNull();
    expect(getCachedCookPilotTotal(id)).toBeNull();
    await expect(loadCookPilotRecipeTotal(id)).resolves.toBe(7);
  });

  it("reports an empty library as 0 rather than as a failure", async () => {
    counts.queue = [0];
    await expect(loadCookPilotRecipeTotal(uid())).resolves.toBe(0);
  });
});
