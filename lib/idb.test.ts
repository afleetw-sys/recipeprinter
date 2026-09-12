import { afterEach, describe, expect, it } from "vitest";
import { idbStore } from "@/lib/idb";

// ── What lib/idb.ts promises ──────────────────────────────────────────────
//
// Against a stub, not a real IndexedDB (there is none in the node test env,
// and adding a polyfill dependency to test forty lines is the wrong trade).
// So this pins the CONTRACT — what each operation resolves to, and that
// nothing ever throws — rather than proving the browser agrees about
// transaction semantics. The parts that would be wrong in a real browser but
// right here (`oncomplete` vs `onsuccess`) are noted where they matter.
//
// The failure cases are the ones that carry their weight: every caller's
// Safari-private-mode behaviour depends on a failure being `null`/`false` and
// never an exception, and those paths are exercised for real by the callers'
// own tests (see "refuses the stash rather than promising a handoff it cannot
// make" in pendingImport.test.ts).

type Handler = (() => void) | null;

/** Enough of IndexedDB to drive the wrapper: values in a Map, callbacks fired
    on a microtask the way the real one fires them off the event loop. */
function fakeIndexedDB(options: { openFails?: "throw" | "error" | "blocked" } = {}) {
  const data = new Map<string, unknown>();
  let closed = false;

  const store = {
    put(value: unknown, key: string) {
      data.set(key, value);
      return {};
    },
    get(key: string) {
      const request: { result: unknown; onsuccess: Handler; onerror: Handler } = {
        result: data.get(key),
        onsuccess: null,
        onerror: null,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
    delete(key: string) {
      data.delete(key);
      return {};
    },
  };

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => store,
    transaction() {
      const tx: { oncomplete: Handler; onerror: Handler; onabort: Handler; objectStore: () => typeof store } = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: () => store,
      };
      // Two microtasks: after any `get` callback the wrapper queued, so a
      // take's delete has run before the transaction reports complete.
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.()));
      return tx;
    },
    close() {
      closed = true;
    },
  };

  return {
    data,
    wasClosed: () => closed,
    indexedDB: {
      open() {
        if (options.openFails === "throw") throw new Error("blocked by policy");
        const request: {
          result: unknown;
          onupgradeneeded: Handler;
          onsuccess: Handler;
          onerror: Handler;
          onblocked: Handler;
        } = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
        queueMicrotask(() => {
          if (options.openFails === "error") request.onerror?.();
          else if (options.openFails === "blocked") request.onblocked?.();
          else request.onsuccess?.();
        });
        return request;
      },
    },
  };
}

function install(fake: ReturnType<typeof fakeIndexedDB> | null) {
  const w = globalThis as unknown as { window?: unknown };
  w.window = fake ? { indexedDB: fake.indexedDB } : {};
}

afterEach(() => {
  delete (globalThis as unknown as { window?: unknown }).window;
});

describe("idbStore", () => {
  it("round-trips a value", async () => {
    const fake = fakeIndexedDB();
    install(fake);
    const store = idbStore("db", 1, "things");
    expect(await store.put("k", { a: 1 })).toBe(true);
    expect(await store.get<{ a: number }>("k")).toEqual({ a: 1 });
  });

  it("answers null for a key that was never written", async () => {
    install(fakeIndexedDB());
    expect(await idbStore("db", 1, "things").get("missing")).toBeNull();
  });

  it("take hands the value over once, then it is gone", async () => {
    const fake = fakeIndexedDB();
    install(fake);
    const store = idbStore("db", 1, "things");
    await store.put("k", ["photo"]);
    expect(await store.take<string[]>("k")).toEqual(["photo"]);
    expect(fake.data.has("k")).toBe(false);
    expect(await store.take<string[]>("k")).toBeNull();
  });

  it("remove deletes, and is fine about a key that isn't there", async () => {
    const fake = fakeIndexedDB();
    install(fake);
    const store = idbStore("db", 1, "things");
    await store.put("k", 1);
    await store.remove("k");
    expect(fake.data.has("k")).toBe(false);
    await expect(store.remove("gone")).resolves.toBeUndefined();
  });

  it("closes the database after every operation", async () => {
    const fake = fakeIndexedDB();
    install(fake);
    await idbStore("db", 1, "things").put("k", 1);
    expect(fake.wasClosed()).toBe(true);
  });

  // Everything below is the Safari-private-mode contract: a failure is a
  // value, never an exception. A caller that had to try/catch would be a
  // caller that eventually forgets to.
  it("is unavailable, not broken, when there is no indexedDB at all", async () => {
    install(null);
    const store = idbStore("db", 1, "things");
    expect(await store.put("k", 1)).toBe(false);
    expect(await store.get("k")).toBeNull();
    expect(await store.take("k")).toBeNull();
    await expect(store.remove("k")).resolves.toBeUndefined();
  });

  it("survives an open() that throws", async () => {
    install(fakeIndexedDB({ openFails: "throw" }));
    expect(await idbStore("db", 1, "things").put("k", 1)).toBe(false);
  });

  it("survives an open() that errors", async () => {
    install(fakeIndexedDB({ openFails: "error" }));
    expect(await idbStore("db", 1, "things").get("k")).toBeNull();
  });

  // Another tab holding the old version open. There is nothing to wait for
  // that would not hang the caller, so it reads as unavailable.
  it("treats a blocked upgrade as unavailable rather than hanging", async () => {
    install(fakeIndexedDB({ openFails: "blocked" }));
    expect(await idbStore("db", 1, "things").put("k", 1)).toBe(false);
  });
});
