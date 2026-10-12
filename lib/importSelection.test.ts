import { describe, expect, it } from "vitest";
import {
  allSelectableSelected,
  partialAddMessage,
  selectableQueueIds,
  toggleSelection,
  toggleSingleSelection,
} from "@/lib/importSelection";
import type { ImportSummary } from "@/lib/importSummary";

function row(id: string): ImportSummary {
  return { id, queueId: `cookpilot:${id}`, title: id, searchText: id };
}

describe("selectableQueueIds", () => {
  it("leaves out what is already in the print list", () => {
    const rows = [row("a"), row("b"), row("c")];
    expect(selectableQueueIds(rows, new Set(["cookpilot:b"]))).toEqual([
      "cookpilot:a",
      "cookpilot:c",
    ]);
  });
});

describe("toggleSelection", () => {
  it("ticks and unticks without touching the set it was given", () => {
    const before = new Set(["a"]);
    const withB = toggleSelection(before, "b");
    expect(Array.from(withB)).toEqual(["a", "b"]);
    expect(Array.from(before)).toEqual(["a"]);
    expect(Array.from(toggleSelection(withB, "a"))).toEqual(["b"]);
  });

  it("keeps click order, which is the order they get added in", () => {
    let selected = new Set<string>();
    for (const id of ["c", "a", "b"]) selected = toggleSelection(selected, id);
    expect(Array.from(selected)).toEqual(["c", "a", "b"]);
  });
});

describe("toggleSingleSelection", () => {
  it("replaces whatever was ticked with the new row", () => {
    const before = new Set(["a"]);
    expect(Array.from(toggleSingleSelection(before, "b"))).toEqual(["b"]);
    expect(Array.from(before)).toEqual(["a"]);
  });

  it("clears the selection when the same row is tapped again", () => {
    expect(Array.from(toggleSingleSelection(new Set(["a"]), "a"))).toEqual([]);
  });

  it("starts a selection from empty", () => {
    expect(Array.from(toggleSingleSelection(new Set(), "a"))).toEqual(["a"]);
  });
});

describe("allSelectableSelected", () => {
  const rows = [row("a"), row("b")];

  it("ignores rows already in the print list", () => {
    expect(
      allSelectableSelected(rows, new Set(["cookpilot:a"]), new Set(["cookpilot:b"])),
    ).toBe(true);
  });

  it("is false while something selectable is still unticked", () => {
    expect(allSelectableSelected(rows, new Set(), new Set(["cookpilot:a"]))).toBe(false);
  });

  it("is false when there is nothing left to select", () => {
    const added = new Set(["cookpilot:a", "cookpilot:b"]);
    expect(allSelectableSelected(rows, added, new Set())).toBe(false);
  });
});

describe("partialAddMessage", () => {
  it("says nothing when the whole batch landed", () => {
    expect(partialAddMessage(50, 0)).toBe("");
  });

  it("reports what came over and leaves the rest ready to retry", () => {
    expect(partialAddMessage(47, 3)).toMatch(/\b47\b.*\b3\b/);
    expect(partialAddMessage(1, 1)).toMatch(/\b1\b.*\b1\b/);
    // Singular and plural read differently.
    expect(partialAddMessage(1, 1).replace(/\d+/g, "#")).not.toBe(partialAddMessage(2, 2).replace(/\d+/g, "#"));
  });

  it("falls back to the plain apology when none of them landed", () => {
    for (const failed of [1, 4]) expect(partialAddMessage(0, failed)).not.toMatch(/\d/);
    expect(partialAddMessage(0, 1)).not.toBe(partialAddMessage(0, 4));
  });
});
