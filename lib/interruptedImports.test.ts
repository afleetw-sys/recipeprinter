import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUEUE_STORAGE_KEY,
  findDuplicateImport,
  flushQueueWrites,
  readQueue,
  settleInterruptedParses,
  withoutSupersededImports,
} from "@/lib/queue";
import type { QueueItem } from "@/types/recipe";

const LINK = "https://www.instagram.com/reel/abc123/";
const KEY = "https://www.instagram.com/reel/abc123";

function item(overrides: Partial<QueueItem> & Pick<QueueItem, "id" | "status">): QueueItem {
  return {
    method: "url",
    source: "instagram.com",
    originalUrl: LINK,
    title: "instagram.com",
    addedAt: 1,
    ...overrides,
  } as QueueItem;
}

const nothingIsLive = () => false;

describe("settling imports nobody is parsing", () => {
  it("turns a parsing item with no parse behind it into a failure the deck shows", () => {
    const [settled] = settleInterruptedParses([item({ id: "a", status: "parsing" })], nothingIsLive);
    expect(settled.status).toBe("error");
    expect(settled.interrupted).toBe(true);
    expect(settled.error).toMatch(/interrupted/i);
    // Copy rules: no em dash, and it never blames the person.
    expect(settled.error).not.toMatch(/—|you |your /i);
  });

  it("leaves an import this document is still parsing alone", () => {
    const parsing = item({ id: "a", status: "parsing" });
    const result = settleInterruptedParses([parsing], (id) => id === "a");
    expect(result[0]).toBe(parsing);
  });

  it("leaves finished recipes and real failures exactly as they were", () => {
    const ready = item({ id: "r", status: "ready" });
    const failed = item({ id: "f", status: "error", error: "Blocked", errorCode: "blocked" });
    const items = [ready, failed];
    // Same array back, so nothing re-renders and nothing is rewritten.
    expect(settleInterruptedParses(items, nothingIsLive)).toBe(items);
  });
});

describe("a link pasted again", () => {
  it("is not a duplicate of an import that was interrupted", () => {
    // The recording: a parsing item survived a reload, and the same link then
    // matched it and did nothing, both from the Add dialog and the landing page.
    const stale = [item({ id: "a", status: "parsing" })];
    expect(findDuplicateImport(stale, KEY, nothingIsLive)).toBeUndefined();
    const settled = settleInterruptedParses(stale, nothingIsLive);
    expect(findDuplicateImport(settled, KEY, nothingIsLive)).toBeUndefined();
  });

  it("is still a duplicate of a recipe the cook already has", () => {
    const have = [item({ id: "r", status: "ready" })];
    expect(findDuplicateImport(have, KEY, nothingIsLive)?.id).toBe("r");
  });

  it("is still a duplicate of an import running right now", () => {
    const running = [item({ id: "a", status: "parsing" })];
    expect(findDuplicateImport(running, KEY, (id) => id === "a")?.id).toBe("a");
  });

  it("still points at a failure the parser really gave, rather than re-asking it", () => {
    const failed = [item({ id: "f", status: "error", errorCode: "blocked" })];
    expect(findDuplicateImport(failed, KEY, nothingIsLive)?.id).toBe("f");
  });

  it("replaces the interrupted attempt instead of sitting beside it", () => {
    const items = [
      item({ id: "old", status: "error", interrupted: true }),
      item({ id: "dead", status: "parsing" }),
      item({ id: "other", status: "ready", originalUrl: "https://example.org/x" }),
      item({ id: "mine", status: "ready" }),
    ];
    expect(withoutSupersededImports(items, KEY, nothingIsLive).map((it) => it.id)).toEqual([
      "other",
      "mine",
    ]);
  });
});

describe("reading the queue after the page died mid-import", () => {
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
  const local = new MemoryStorage();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { sessionStorage: session, localStorage: local });
    flushQueueWrites();
    session.clear();
    local.clear();
  });
  afterEach(() => {
    flushQueueWrites();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("hands back a failure, not a hidden parsing item", () => {
    session.setItem(QUEUE_STORAGE_KEY, JSON.stringify([item({ id: "a", status: "parsing" })]));
    const [read] = readQueue();
    expect(read.status).toBe("error");
    expect(read.interrupted).toBe(true);
    // A read stays pure: storage is untouched until the next commit.
    expect(JSON.parse(session.getItem(QUEUE_STORAGE_KEY) as string)[0].status).toBe("parsing");
  });
});
