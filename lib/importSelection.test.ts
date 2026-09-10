import { describe, expect, it } from "vitest";
import {
  addSelectedLabel,
  allSelectableSelected,
  partialAddMessage,
  selectableQueueIds,
  toggleSelection,
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

describe("addSelectedLabel", () => {
  it("says what the button is for even with nothing chosen", () => {
    expect(addSelectedLabel(0)).toBe("Add to your print list");
  });

  it("counts, and gets the singular right", () => {
    expect(addSelectedLabel(1)).toBe("Add 1 recipe");
    expect(addSelectedLabel(5)).toBe("Add 5 recipes");
  });
});

describe("partialAddMessage", () => {
  it("says nothing when the whole batch landed", () => {
    expect(partialAddMessage(50, 0)).toBe("");
  });

  it("reports what came over and leaves the rest ready to retry", () => {
    expect(partialAddMessage(47, 3)).toBe(
      "47 recipes are in your print list. 3 are still selected, ready to try again.",
    );
    expect(partialAddMessage(1, 1)).toBe(
      "1 recipe is in your print list. 1 is still selected, ready to try again.",
    );
  });

  it("falls back to the plain apology when none of them landed", () => {
    expect(partialAddMessage(0, 1)).toBe("We couldn't add that recipe. Please try again.");
    expect(partialAddMessage(0, 4)).toBe("We couldn't add those recipes. Please try again.");
  });
});
