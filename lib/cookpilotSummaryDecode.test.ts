import { describe, expect, it, vi } from "vitest";
import { loadCookPilotRecipeSummaries } from "@/lib/cookpilotRecipes";

// ── What a CookPilot summary document decodes to ──────────────────────────
//
// Written alongside the lib/jsonCoerce consolidation, which pulled four
// private copies of `asString` into one and settled on the strict rule (a
// non-finite number is absent, not the text "NaN"). Three of those copies had
// the loose rule, and THIS decoder is the one place the difference is
// reachable: Firestore stores NaN natively, unlike JSON, so a recipe whose
// `servings` was written as NaN used to arrive here as the three characters
// "NaN" and print that way on a card.
//
// The fields below are read straight off an untrusted document, so this pins
// the decode itself rather than the helper — the helper's own rules are
// covered in lib/jsonCoerce.test.ts.

const docs = vi.hoisted(() => ({ list: [] as Array<{ id: string; data: Record<string, unknown> }> }));

vi.mock("firebase/firestore", () => ({
  Timestamp: class {},
  collection: (...path: unknown[]) => ({ path }),
  doc: (...path: unknown[]) => ({ path }),
  getCountFromServer: async () => ({ data: () => ({ count: 0 }) }),
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({
    docs: docs.list.map((entry) => ({ id: entry.id, data: () => entry.data })),
  }),
  limit: () => ({}),
  orderBy: () => ({}),
  query: () => ({}),
  startAfter: () => ({}),
}));
vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));

let user = 0;
/** A fresh uid per test: the summary cache is module-level and keyed by user. */
const uid = () => `decode-uid-${(user += 1)}`;

async function decode(data: Record<string, unknown>) {
  docs.list = [{ id: "r1", data }];
  const [summary] = await loadCookPilotRecipeSummaries(uid());
  return summary;
}

describe("CookPilot summary decode", () => {
  it("takes a servings count written as a number", async () => {
    expect((await decode({ title: "Soup", servings: 4 })).servings).toBe("4");
  });

  it("takes one written as a string, trimmed", async () => {
    expect((await decode({ title: "Soup", servings: "  4-6 " })).servings).toBe("4-6");
  });

  it("drops a NaN servings rather than printing its name", async () => {
    expect((await decode({ title: "Soup", servings: Number.NaN })).servings).toBeUndefined();
  });

  it("drops a NaN total time", async () => {
    expect((await decode({ title: "Soup", totalTimeMinutes: Number.NaN })).totalTimeMinutes)
      .toBeUndefined();
  });

  it("still names an untitled recipe", async () => {
    expect((await decode({})).title).toBe("Untitled recipe");
  });

  it("does not let a NaN title become the title", async () => {
    expect((await decode({ title: Number.NaN })).title).toBe("Untitled recipe");
  });
});
