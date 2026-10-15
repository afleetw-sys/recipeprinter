import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureFailedImportImages, claimImageCaptureBudget } from "@/lib/failedImportCapture";

const uploadBytes = vi.fn();
const track = vi.fn();
vi.mock("firebase/storage", () => ({ ref: (_s: unknown, path: string) => path, uploadBytes: (...a: unknown[]) => uploadBytes(...a) }));
vi.mock("@/lib/firebase/storage", () => ({ getFirebaseStorage: () => ({}) }));
vi.mock("@/lib/firebase/client", () => ({
  firebaseConfigured: () => true,
  getFirebaseAuth: () => ({ currentUser: null }),
}));
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

/* What decides whether a failed import's photographs get uploaded.
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

describe("a failed photo import keeps its photos", () => {
  // Reported 2026-10-15: a cook's photo failed to import and nothing reached
  // Storage. Photos were dropped for whole failure buckets, a rejected upload
  // still used up the day's allowance, and a rejection was never reported.
  it("uploads them whatever the failure was, and claims a path only when one landed", async () => {
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    const categories = [
      "no_recipe", "decode_failed", "too_large", "unknown",
      "backend_unavailable", "network", "timeout", "rate_limited",
    ];
    for (const category of categories) {
      memory.clear();
      uploadBytes.mockReset().mockResolvedValue({});
      const path = await captureFailedImportImages([photo], { source: "image", category, reason: "x" });
      expect(path, category).toMatch(new RegExp(`/${category}/`));
      expect(uploadBytes, category).toHaveBeenCalledTimes(1);
    }

    // Rejected uploads (App Check, rules) land nothing: no path, the day's
    // allowance is untouched, and the rejection is reported.
    memory.clear();
    track.mockReset();
    uploadBytes.mockReset().mockRejectedValue(Object.assign(new Error("denied"), { code: "storage/unauthorized" }));
    for (let i = 0; i < 8; i += 1) {
      expect(await captureFailedImportImages([photo], { source: "image", category: "no_recipe", reason: "x" })).toBeNull();
    }
    expect(uploadBytes).toHaveBeenCalledTimes(8);
    expect(track).toHaveBeenCalledWith("failed_import_capture_failed", expect.objectContaining({ errorCode: "storage/unauthorized" }));
    expect(claimImageCaptureBudget()).toBe(true);

    // Nothing uploadable (an empty placeholder file): no path pointing at an empty folder.
    memory.clear();
    uploadBytes.mockReset().mockResolvedValue({});
    expect(await captureFailedImportImages([new Blob([])], { source: "image", category: "decode_failed", reason: "x" })).toBeNull();
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
