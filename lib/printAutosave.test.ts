import { describe, expect, it, vi } from "vitest";
import {
  autosaveVerdict,
  LOADED_BASELINE,
  shouldFlushOnHide,
  type FlushOnHideState,
} from "@/lib/printAutosave";

describe("autosaveVerdict", () => {
  it("does nothing when the book matches what was last saved", () => {
    expect(autosaveVerdict("a", "a", null)).toBe("unchanged");
  });

  it("saves a genuine change", () => {
    expect(autosaveVerdict("b", "a", null)).toBe("save");
    expect(autosaveVerdict("b", null, null)).toBe("save");
  });

  it("does not retry the same change that already had its turn", () => {
    // The retry-storm guard: a failed save never advances the saved baseline.
    expect(autosaveVerdict("b", "a", "b")).toBe("already-attempted");
  });

  it("offers a NEW change even after an earlier one was attempted", () => {
    expect(autosaveVerdict("c", "a", "b")).toBe("save");
  });

  it("prefers 'unchanged' when both would apply", () => {
    expect(autosaveVerdict("a", "a", "a")).toBe("unchanged");
  });
});

describe("shouldFlushOnHide", () => {
  const ready: FlushOnHideState = {
    autosaveEnabledForCurrentMode: true,
    projectAttachChecked: true,
    itemCount: 3,
    saveInFlight: false,
    saveQueued: false,
    lastSavedFingerprint: "saved",
  };

  it("flushes an edit made since the last save", () => {
    expect(shouldFlushOnHide(ready, () => "edited")).toBe(true);
  });

  it("does not write when nothing changed, so closing a tab never bumps the revision", () => {
    expect(shouldFlushOnHide(ready, () => "saved")).toBe(false);
  });

  it.each([
    ["autosave is not on for this mode", { autosaveEnabledForCurrentMode: false }],
    ["the working copy has not been matched to its saved document", { projectAttachChecked: false }],
    ["there is nothing on the desk", { itemCount: 0 }],
    ["a save is already in flight", { saveInFlight: true }],
    ["a save is already waiting its turn", { saveQueued: true }],
    ["the book was just opened and has no baseline yet", { lastSavedFingerprint: LOADED_BASELINE }],
  ] satisfies Array<[string, Partial<FlushOnHideState>]>)("stands down when %s", (_label, change) => {
    expect(shouldFlushOnHide({ ...ready, ...change }, () => "edited")).toBe(false);
  });

  it("only computes the fingerprint once every cheaper check has passed", () => {
    // It is a JSON.stringify of the whole book.
    const fingerprint = vi.fn(() => "edited");
    shouldFlushOnHide({ ...ready, saveInFlight: true }, fingerprint);
    shouldFlushOnHide({ ...ready, itemCount: 0 }, fingerprint);
    shouldFlushOnHide({ ...ready, lastSavedFingerprint: LOADED_BASELINE }, fingerprint);
    expect(fingerprint).not.toHaveBeenCalled();

    shouldFlushOnHide(ready, fingerprint);
    expect(fingerprint).toHaveBeenCalledTimes(1);
  });

  it("treats a book with no baseline at all as changed", () => {
    expect(shouldFlushOnHide({ ...ready, lastSavedFingerprint: null }, () => "edited")).toBe(true);
  });
});

describe("LOADED_BASELINE", () => {
  it("keeps the value stored fingerprints were compared against", () => {
    expect(LOADED_BASELINE).toBe("__loaded__");
  });
});
