import { beforeEach, describe, expect, it, vi } from "vitest";

/* Reading the saved-projects list, and what happens when it cannot be read.
 *
 * When the read fails, the only honest reply is a rejection, because the caller
 * renders "you have no saved projects" from an empty list and a cook with a
 * shelf full of cookbooks must never be told that.
 *
 * Only the namespaced collection is read. The pre-namespace one was retired
 * 2026-10-10 once an audit found it empty, and the rules no longer allow it. */

const reads = vi.hoisted(() => ({
  namespaced: null as null | "never" | Array<{ id: string; data: Record<string, unknown> }>,
  paths: [] as string[],
}));
const network = vi.hoisted(() => ({ restarts: 0 }));

function snapshot(docs: Array<{ id: string; data: Record<string, unknown> }> | null | "never") {
  // A connection that went quiet without dropping: Firestore still believes it
  // is online, so it neither answers nor gives up.
  if (docs === "never") return new Promise<never>(() => {});
  if (docs === null) return Promise.reject(new Error("unavailable"));
  return Promise.resolve({
    empty: docs.length === 0,
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  });
}

vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...segments: string[]) => segments.join("/"),
  query: (path: string) => path,
  orderBy: () => "orderBy",
  getDocsFromServer: (path: string) => {
    reads.paths.push(path);
    return snapshot(reads.namespaced);
  },
}));
vi.mock("@/lib/firebase/db", () => ({
  getDb: () => ({}),
  restartFirestoreNetwork: () => {
    network.restarts += 1;
  },
}));

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

import { loadPrintProjectSummaries } from "@/lib/printProjects";
import { loadCookbookProjectUnlockIds } from "@/lib/cookbookUnlocks";

const BOOK = { id: "book-a", data: { id: "book-a", title: "Nana's Kitchen", updatedAt: 2 } };

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
  reads.namespaced = [BOOK];
  reads.paths = [];
  network.restarts = 0;
});

describe("reading the saved-projects list", () => {
  it("returns the account's projects", async () => {
    const projects = await loadPrintProjectSummaries("user-1");
    expect(projects.map((p) => p.id)).toEqual(["book-a"]);
  });

  it("reads the namespaced collection and nothing else", async () => {
    await loadPrintProjectSummaries("user-1");
    expect(reads.paths).toEqual(["products/recipePrinter/users/user-1/printProjects"]);
  });

  /* The one this exists for. A failed read used to fall through to an empty
     list. The account menu rendered that as "no saved projects"; going to
     /projects re-read it successfully and the library reappeared, which made a
     failed read look like a caching quirk. */
  it("refuses to answer when the read fails, on a first visit or a later one", async () => {
    reads.namespaced = null;
    await expect(loadPrintProjectSummaries("user-1")).rejects.toThrow(/couldn't read/i);

    reads.namespaced = [BOOK];
    await loadPrintProjectSummaries("user-1");
    reads.namespaced = null;
    await expect(loadPrintProjectSummaries("user-1")).rejects.toThrow(/couldn't read/i);
  });

  /* A Mac Safari tab left open for an hour (2026-11-08, PostHog recording
     01a1bbba): every client-side visit to /projects sat on "Loading projects…"
     with no error and no Try again, and a reload loaded the list in 50 ms.
     Firestore only rejects a server read once it decides it is offline; a
     connection that hangs while still looking open never gets that verdict, so
     the read waited forever and so did the page. Every read the library waits
     on must settle by itself, and the stuck connection is restarted so that
     Try again can work without a reload. */
  it("settles every library read when Firestore never answers", async () => {
    // Only the clock: the loaders' dynamic imports resolve on the real
    // setImmediate/nextTick, which a full fake would freeze.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      reads.namespaced = "never";
      const loads: Array<[string, () => Promise<unknown>]> = [
        ["saved projects", () => loadPrintProjectSummaries("user-1")],
        ["cookbook unlocks", () => loadCookbookProjectUnlockIds("user-1")],
      ];
      for (const [name, load] of loads) {
        network.restarts = 0;
        let settled = false;
        void load().then(
          () => (settled = true),
          () => (settled = true),
        );
        // Once the read is out (past the loader's dynamic imports)...
        const sent = reads.paths.length;
        for (let i = 0; i < 100 && reads.paths.length === sent; i += 1) {
          await new Promise((resolve) => globalThis.setImmediate(resolve));
        }
        expect(reads.paths.length, `${name} read sent`).toBe(sent + 1);
        // ...the cook waits half a minute, and the read must have settled.
        await vi.advanceTimersByTimeAsync(30_000);
        expect(settled, `${name} settled`).toBe(true);
        expect(network.restarts, `${name} restarted the connection`).toBe(1);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
