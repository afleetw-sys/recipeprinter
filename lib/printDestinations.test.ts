import { describe, expect, it } from "vitest";
import { COOKBOOK_PRESETS, PRINTERS, getCookbookPreset } from "@/lib/cookbookPresets";
import {
  PRINT_DESTINATIONS,
  NO_BOOK_CHOICE,
  PHOTOS_HELP,
  choiceForPreset,
  downloadSummary,
  presetForChoice,
  destinationPresets,
  destinationPrinter,
  getPrintDestination,
} from "@/lib/printDestinations";

describe("print destinations", () => {
  it("names only presets that exist", () => {
    // A typo here would render a card whose Save button quietly exports the
    // default book instead of the one it is labelled with.
    const known = new Set(COOKBOOK_PRESETS.map((preset) => preset.id));
    for (const destination of PRINT_DESTINATIONS) {
      expect(destination.presetIds.length).toBeGreaterThan(0);
      for (const id of destination.presetIds) expect(known.has(id)).toBe(true);
    }
  });

  it("names only printers that exist", () => {
    for (const destination of PRINT_DESTINATIONS) {
      if (!destination.printerId) continue;
      expect(PRINTERS[destination.printerId]).toBeDefined();
      expect(destinationPrinter(destination)).toBe(PRINTERS[destination.printerId]);
    }
  });

  it("sends a copy shop one file with the cover bound in", () => {
    // Confirmed on a real order: Staples took the single file and bound the
    // cover itself. Splitting it there would be solving a problem they do not
    // have, and would leave the cook holding a file with no home.
    for (const id of ["home", "copy-shop"] as const) {
      for (const preset of destinationPresets(getPrintDestination(id))) {
        expect(preset.wrapRequired).toBe(false);
        expect(preset.bleedIn).toBe(0);
      }
    }
  });

  it("sends a print service bleed and a separate cover", () => {
    // Also confirmed on a real order, in the other direction: Lulu refused the
    // bundled file and asked for the cover on its own. "Somewhere else" means
    // an unknown print SERVICE — a shop that binds the document you hand it is
    // the copy-shop row — so it holds to the same rule.
    for (const id of ["lulu", "blurb"] as const) {
      for (const preset of destinationPresets(getPrintDestination(id))) {
        expect(preset.wrapRequired).toBe(true);
        expect(preset.bleedIn).toBeGreaterThan(0);
      }
    }
  });

  it("only offers a trim the destination actually prints", () => {
    // Lulu's size list has no 8 x 10 in it; Blurb prints 8 x 10 and no coil.
    const lulu = destinationPresets(getPrintDestination("lulu"));
    for (const preset of lulu) {
      expect(preset.trimWidthIn).toBe(8.5);
      expect(preset.trimHeightIn).toBe(11);
    }
    const blurb = destinationPresets(getPrintDestination("blurb"));
    expect(blurb.every((preset) => !preset.coilBound)).toBe(true);
  });

  it("does not offer an unknown-printer shortcut that duplicates choosing no printer", () => {
    const unknown = PRINT_DESTINATIONS.filter((d) => d.unknownSpec);
    expect(unknown).toEqual([]);
    expect(PRINT_DESTINATIONS.map((d) => d.name)).not.toContain("Somewhere else");
  });

  it("leaves no book unreachable", () => {
    // Every renderable preset has to be gettable from somewhere, or it is a
    // format nobody can pick.
    const offered = new Set(PRINT_DESTINATIONS.flatMap((d) => d.presetIds));
    for (const preset of COOKBOOK_PRESETS) expect(offered.has(preset.id)).toBe(true);
  });

  it("falls back to a real destination rather than throwing", () => {
    expect(getPrintDestination("lulu").id).toBe("lulu");
    // Defensive: a stale id from anywhere must not blank the dialog.
    expect(getPrintDestination("nope" as never)).toBe(PRINT_DESTINATIONS[0]);
  });

  it("keeps home free of a printer link", () => {
    const home = getPrintDestination("home");
    expect(home.printerId).toBeUndefined();
    expect(destinationPrinter(home)).toBeUndefined();
  });

  it("offers Lulu both its bindings", () => {
    const lulu = destinationPresets(getPrintDestination("lulu"));
    expect(lulu.map((p) => p.id)).toEqual(["coil-us-letter", "hardcover-us-letter"]);
    expect(lulu.filter((p) => p.coilBound)).toHaveLength(1);
  });

  it("gives a one-answer destination exactly one book", () => {
    for (const id of ["home", "copy-shop", "blurb"] as const) {
      expect(getPrintDestination(id).presetIds).toHaveLength(1);
    }
  });

  it("does not recommend a printer that cannot make what it offers", () => {
    for (const destination of PRINT_DESTINATIONS) {
      const printerId = destination.printerId;
      if (!printerId) continue;
      for (const preset of destinationPresets(destination)) {
        expect(preset.printerIds).toContain(printerId);
      }
    }
  });

  it("keeps every preset's own printer list honest about the trim", () => {
    expect(getCookbookPreset("hardcover-8x10").printerIds).toEqual(["blurb"]);
  });
});

describe("the format questions", () => {
  it("names exactly one preset for every complete set of answers", () => {
    const named = [
      presetForChoice({ kind: "hardcover", size: "8x10", photos: "standard" }),
      presetForChoice({ kind: "hardcover", size: "letter", photos: "edge" }),
      presetForChoice({ kind: "flat", size: null, photos: "standard" }),
      presetForChoice({ kind: "flat", size: null, photos: "edge" }),
    ];
    expect(named.every(Boolean)).toBe(true);
    expect(new Set(named.map((preset) => preset!.id)).size).toBe(COOKBOOK_PRESETS.length);
  });

  it("round-trips: every preset's answers name that preset", () => {
    for (const preset of COOKBOOK_PRESETS) {
      expect(presetForChoice(choiceForPreset(preset))?.id).toBe(preset.id);
    }
  });

  it("names nothing while a follow-up is unanswered", () => {
    expect(presetForChoice(NO_BOOK_CHOICE)).toBeNull();
    expect(presetForChoice({ kind: "hardcover", size: null, photos: "edge" })).toBeNull();
    expect(presetForChoice({ kind: "flat", size: "letter", photos: null })).toBeNull();
  });

  it("defaults a new book to standard photos", () => {
    expect(NO_BOOK_CHOICE.photos).toBe("standard");
  });

  it("keeps photo finish separate from hardcover geometry", () => {
    expect(presetForChoice({ kind: "hardcover", size: "letter", photos: "standard" })?.id).toBe(
      "hardcover-us-letter",
    );
    expect(presetForChoice({ kind: "hardcover", size: "letter", photos: "edge" })?.id).toBe(
      "hardcover-us-letter",
    );
    // A lay-flat book is always US Letter, so a stale size does not change it.
    expect(presetForChoice({ kind: "flat", size: "8x10", photos: "edge" })?.id).toBe(
      "coil-us-letter",
    );
  });

  it("keeps a printer's bleed geometry when standard photos are chosen", () => {
    const lulu = destinationPresets(getPrintDestination("lulu"));
    expect(presetForChoice({ kind: "flat", size: "letter", photos: "standard" }, lulu)?.id).toBe(
      "coil-us-letter",
    );
    expect(presetForChoice({ kind: "hardcover", size: "letter", photos: "standard" }, lulu)?.id).toBe(
      "hardcover-us-letter",
    );
  });

  it("explains both photo answers in one short line each", () => {
    for (const help of Object.values(PHOTOS_HELP)) {
      expect(help.length).toBeLessThan(80);
      expect(help).not.toContain("—");
    }
    expect(PHOTOS_HELP.standard).toMatch(/border/);
  });

  it("starts every destination on a complete set of answers", () => {
    for (const destination of PRINT_DESTINATIONS) {
      const first = destinationPresets(destination)[0];
      expect(presetForChoice(choiceForPreset(first))?.id).toBe(first.id);
    }
  });
});

describe("what pressing Save produces", () => {
  it("says how many files, from the format alone", () => {
    // The destination is only a shortcut, so nothing here may depend on it:
    // somebody can choose their own printer and then a hardcover.
    for (const preset of COOKBOOK_PRESETS) {
      expect(downloadSummary(preset)).toBe(
        preset.wrapRequired
          ? "You’ll get two files: the pages and the cover."
          : "You’ll get one file, with the cover as its first page.",
      );
    }
  });

  it("never names a shop or a kind of service", () => {
    for (const preset of COOKBOOK_PRESETS) {
      expect(downloadSummary(preset)).not.toMatch(/lulu|blurb|staples|shop|service|printer/i);
    }
  });
});
