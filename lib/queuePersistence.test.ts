import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  QUEUE_STORAGE_KEY,
  __scheduleQueueWriteForTest as scheduleQueueWrite,
  flushQueueWrites,
  readQueue,
} from "@/lib/queue";
import type { QueueItem } from "@/types/recipe";

// Same in-memory stand-in the other storage tests use — lib/storage resolves
// the area per call, so defining `window` is enough to make it usable.
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

function item(id: string, title = `Recipe ${id}`): QueueItem {
  return {
    id,
    method: "url",
    status: "ready",
    title,
    recipe: { title, ingredients: [{ raw: "2 cups flour" }], instructions: [{ text: "Mix." }] },
  } as unknown as QueueItem;
}

/** What the per-tab session copy currently holds, as titles. */
function persistedTitles(): string[] {
  const raw = session.getItem(QUEUE_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as QueueItem[]).map((entry) => entry.title) : [];
}

beforeEach(() => {
  vi.useFakeTimers();
  session.clear();
  local.clear();
  vi.stubGlobal("window", { sessionStorage: session, localStorage: local });
  flushQueueWrites(); // drop anything a previous test left pending
  session.clear();
  local.clear();
});

afterEach(() => {
  flushQueueWrites();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("the queue write throttle", () => {
  it("does not touch storage on every commit", () => {
    // The point of the change: typing must not cost a serialize plus two
    // synchronous storage writes per character.
    scheduleQueueWrite([item("r1", "First")]);
    scheduleQueueWrite([item("r1", "Firs")]);
    scheduleQueueWrite([item("r1", "Fir")]);
    expect(persistedTitles()).toEqual([]);
  });

  it("lands the write on the timer without anyone asking", () => {
    scheduleQueueWrite([item("r1", "Borscht")]);
    vi.advanceTimersByTime(250);
    expect(persistedTitles()).toEqual(["Borscht"]);
  });

  it("throttles rather than debounces, so continuous typing cannot starve it", () => {
    // A resetting debounce would never land while edits kept arriving. This
    // schedules on the first write and lands on the timer regardless.
    scheduleQueueWrite([item("r1", "a")]);
    for (let i = 0; i < 20; i += 1) {
      vi.advanceTimersByTime(20);
      scheduleQueueWrite([item("r1", "a".repeat(i + 2))]);
    }
    expect(persistedTitles().length).toBe(1);
    expect(persistedTitles()[0]!.length).toBeGreaterThan(1);
  });

  it("writes the newest value, not the one that started the window", () => {
    scheduleQueueWrite([item("r1", "old")]);
    scheduleQueueWrite([item("r1", "newer")]);
    scheduleQueueWrite([item("r1", "newest")]);
    vi.advanceTimersByTime(250);
    expect(persistedTitles()).toEqual(["newest"]);
  });

  it("mirrors to durable storage as well as the session copy", () => {
    scheduleQueueWrite([item("r1", "Borscht")]);
    flushQueueWrites();
    expect(session.values.size).toBe(1);
    expect(local.values.size).toBe(1);
  });

  it("skips a redundant write when nothing actually changed", () => {
    scheduleQueueWrite([item("r1", "Borscht")]);
    flushQueueWrites();
    const first = session.getItem(QUEUE_STORAGE_KEY);
    local.clear();
    scheduleQueueWrite([item("r1", "Borscht")]);
    flushQueueWrites();
    expect(session.getItem(QUEUE_STORAGE_KEY)).toBe(first);
    expect(local.values.size).toBe(0);
  });
});

describe("flushing before a read", () => {
  it("readQueue sees edits the throttle is still holding", () => {
    // The two free functions that seed the queue build on readQueue(), so a
    // pending write would have them append to a stale list and drop edits.
    scheduleQueueWrite([item("r1", "Pending")]);
    expect(readQueue().map((entry) => entry.title)).toEqual(["Pending"]);
  });

  it("a flush with nothing pending is a no-op", () => {
    expect(() => flushQueueWrites()).not.toThrow();
    expect(persistedTitles()).toEqual([]);
  });
});
