import { beforeEach, describe, expect, it } from "vitest";
import { claimImageCaptureBudget, imageBytesWorthKeeping } from "@/lib/failedImportCapture";

/* The two gates in front of uploading a failed import's photographs.
   Everything past them talks to Firebase Storage; these do not, which is the
   point — a capture that is not going to happen should be decided before the
   SDK is loaded, not after.

   What they are protecting is a store that had no expiry of any kind. See
   docs/failed-import-retention.md for the half that is console configuration. */

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
const BUDGET_KEY = "recipeprinter:debug-capture-budget:v1";

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("which failures are worth keeping photographs for", () => {
  it("keeps the photographs when the photographs are the suspect", () => {
    // The browser could not decode it, or the parser read it and found nothing.
    // Both are questions only the bytes can answer.
    expect(imageBytesWorthKeeping("decode_failed")).toBe(true);
    expect(imageBytesWorthKeeping("no_recipe")).toBe(true);
    expect(imageBytesWorthKeeping("too_large")).toBe(true);
    // An unrecognised bucket keeps its bytes: the default has to be to collect,
    // or a new failure code silently stops being diagnosable.
    expect(imageBytesWorthKeeping("something_new")).toBe(true);
  });

  it("drops them when the backend was the problem and the photo was not", () => {
    // Several megabytes to record "the parser was busy" — the row already says
    // that, and says it for nothing.
    expect(imageBytesWorthKeeping("rate_limited")).toBe(false);
    expect(imageBytesWorthKeeping("backend_unavailable")).toBe(false);
    expect(imageBytesWorthKeeping("timeout")).toBe(false);
  });
});

describe("the daily photo-capture budget", () => {
  it("lets a genuinely bad afternoon through in full", () => {
    // Six different photos each failing once is exactly the case worth having.
    const allowed = Array.from({ length: 6 }, () => claimImageCaptureBudget());
    expect(allowed).toEqual([true, true, true, true, true, true]);
  });

  it("stops the same failure being uploaded over and over", () => {
    for (let i = 0; i < 6; i += 1) claimImageCaptureBudget();
    // The seventh re-pick of one undecodable photo has nothing left to teach.
    expect(claimImageCaptureBudget()).toBe(false);
    expect(claimImageCaptureBudget()).toBe(false);
  });

  it("starts fresh on a new day", () => {
    for (let i = 0; i < 6; i += 1) claimImageCaptureBudget();
    expect(claimImageCaptureBudget()).toBe(false);

    memory.setItem(BUDGET_KEY, JSON.stringify({ day: "2020-01-01", count: 99 }));
    expect(claimImageCaptureBudget()).toBe(true);
  });

  it("counts a refused claim as unspent", () => {
    for (let i = 0; i < 6; i += 1) claimImageCaptureBudget();
    claimImageCaptureBudget();
    claimImageCaptureBudget();
    // A refusal must not keep incrementing, or "spent" drifts away from what
    // was actually uploaded and the new-day reset has to undo a fiction.
    const stored = JSON.parse(memory.getItem(BUDGET_KEY) ?? "{}");
    expect(stored).toEqual({ day: today(), count: 6 });
  });

  it("captures rather than refusing when the counter cannot be read", () => {
    // Private mode, a full origin, a browser that throws on access. Losing a
    // real diagnostic to an unreadable counter is the worse of the two.
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: {
          getItem() { throw new Error("storage unavailable"); },
          setItem() { throw new Error("storage unavailable"); },
          removeItem() { throw new Error("storage unavailable"); },
        },
      },
    });
    expect(claimImageCaptureBudget()).toBe(true);
    expect(claimImageCaptureBudget()).toBe(true);
  });

  it("treats a corrupt counter as a fresh day rather than refusing", () => {
    memory.setItem(BUDGET_KEY, "not json at all");
    expect(claimImageCaptureBudget()).toBe(true);
    memory.setItem(BUDGET_KEY, JSON.stringify({ day: today(), count: "lots" }));
    expect(claimImageCaptureBudget()).toBe(true);
  });
});
