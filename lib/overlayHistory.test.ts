import { describe, expect, it } from "vitest";
import {
  OVERLAY_STATE_KEY,
  backDismissAction,
  isOwnOverlayEntry,
  overlayHistoryState,
} from "@/lib/overlayHistory";

describe("overlayHistoryState", () => {
  it("keeps the router's own state alongside the marker", () => {
    const next = { __NA: true, __PRIVATE_NEXTJS_INTERNALS_TREE: ["", {}] };
    expect(overlayHistoryState(next, 3)).toEqual({ ...next, [OVERLAY_STATE_KEY]: 3 });
  });

  it("starts from an empty object when history has no state yet", () => {
    expect(overlayHistoryState(null, 1)).toEqual({ [OVERLAY_STATE_KEY]: 1 });
    expect(overlayHistoryState(undefined, 1)).toEqual({ [OVERLAY_STATE_KEY]: 1 });
  });

  it("overwrites an outer overlay's marker so the top entry names the top dialog", () => {
    const outer = overlayHistoryState({ __NA: true }, 1);
    expect(overlayHistoryState(outer, 2)[OVERLAY_STATE_KEY]).toBe(2);
  });
});

describe("isOwnOverlayEntry", () => {
  it("recognises the entry this overlay pushed", () => {
    expect(isOwnOverlayEntry(overlayHistoryState({}, 7), 7)).toBe(true);
  });

  it("rejects an entry a NESTED dialog pushed on top", () => {
    // The inner dialog closed first and popped its own; if it had not, the
    // outer one must not mistake the inner marker for its own and pop again.
    expect(isOwnOverlayEntry(overlayHistoryState({}, 2), 1)).toBe(false);
  });

  it("rejects a plain router entry, so a dialog that closed because it navigated leaves history alone", () => {
    expect(isOwnOverlayEntry({ __NA: true }, 1)).toBe(false);
  });

  it("rejects absent or non-object state", () => {
    expect(isOwnOverlayEntry(null, 1)).toBe(false);
    expect(isOwnOverlayEntry(undefined, 1)).toBe(false);
    expect(isOwnOverlayEntry("nope", 1)).toBe(false);
  });
});

describe("backDismissAction", () => {
  it("closes on Back", () => {
    expect(backDismissAction({ closeDisabled: false })).toBe("close");
  });

  it("re-pushes instead of closing while an operation is in flight", () => {
    // Same terms as Escape. The entry is already popped by now, so staying
    // open means putting a replacement back or the next press leaves the page.
    expect(backDismissAction({ closeDisabled: true })).toBe("reassert");
  });
});
