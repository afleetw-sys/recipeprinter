import { describe, expect, it } from "vitest";
import { COOKBOOK_PRESETS, PRINTERS, getCookbookPreset } from "@/lib/cookbookPresets";
import {
  PRINT_DESTINATIONS,
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
    // bundled file and asked for the cover on its own.
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

  it("admits when it does not know the printer's requirements", () => {
    // Exactly one destination may say "read it off their upload page", and it
    // is the one that means "a shop we have never seen".
    const unknown = PRINT_DESTINATIONS.filter((d) => d.unknownSpec);
    expect(unknown.map((d) => d.id)).toEqual(["other"]);
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
