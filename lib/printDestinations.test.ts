import { describe, expect, it } from "vitest";
import { COOKBOOK_PRESETS, PRINTERS, getCookbookPreset } from "@/lib/cookbookPresets";
import {
  PRINT_DESTINATIONS,
  bindingLabels,
  destinationPriceLine,
  estimateTotalUsd,
  destinationPresets,
  destinationPrinter,
  destinationSettings,
  destinationUploadsAFile,
  exportFileRoles,
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
    for (const id of ["lulu", "blurb", "other"] as const) {
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

describe("what to do with the file once it is saved", () => {
  const rows = (id: Parameters<typeof getPrintDestination>[0]) => {
    const destination = getPrintDestination(id);
    return destinationPresets(destination).map((preset) => ({
      preset,
      settings: destinationSettings(destination, preset),
      as: (label: string) =>
        destinationSettings(destination, preset).find((s) => s.label === label)?.value,
    }));
  };

  it("states the size the file was actually rendered at", () => {
    // The rejection that started all of this said "your PDF is 8.500 x 11.000"
    // against an order placed at another size. The size shown here has to come
    // off the preset, so it cannot be a number someone typed once and left.
    for (const destination of PRINT_DESTINATIONS) {
      for (const preset of destinationPresets(destination)) {
        const settings = destinationSettings(destination, preset);
        const size = settings.find((s) => s.label === "Size" || s.label === "Paper");
        expect(size?.value).toBe(preset.trimLabel);
      }
    }
  });

  it("names the binding the preset actually is", () => {
    for (const entry of rows("lulu")) {
      expect(entry.as("Binding")).toBe(entry.preset.coilBound ? "Coil bound" : "Hardcover, case wrap");
    }
  });

  it("tells a print service the cover uploads on its own", () => {
    for (const id of ["lulu", "blurb"] as const) {
      for (const entry of rows(id)) {
        expect(entry.as("Files")).toBe("Interior and cover upload separately");
      }
    }
  });

  it("tells a copy shop the cover is already bound in", () => {
    for (const entry of rows("copy-shop")) {
      expect(entry.as("Files")).toBe("One file, with the cover as page 1");
    }
  });

  it("warns a home printer off “fit to page”", () => {
    // The one setting that silently ruins a bleed book on a desktop printer,
    // and the default in most drivers.
    const scale = rows("home")[0].as("Scale");
    expect(scale).toContain("Actual size");
    expect(rows("home")[0].settings.some((s) => s.label === "Files")).toBe(false);
  });

  it("does not hand a home printer an upload form", () => {
    expect(destinationUploadsAFile(getPrintDestination("home"))).toBe(false);
    for (const id of ["copy-shop", "lulu", "blurb", "other"] as const) {
      expect(destinationUploadsAFile(getPrintDestination(id))).toBe(true);
    }
  });

  it("never shows an empty row", () => {
    for (const destination of PRINT_DESTINATIONS) {
      for (const preset of destinationPresets(destination)) {
        const settings = destinationSettings(destination, preset);
        expect(settings.length).toBeGreaterThan(0);
        for (const row of settings) {
          expect(row.label.trim()).not.toBe("");
          expect(row.value.trim()).not.toBe("");
        }
        // A repeated label would render two rows claiming the same field.
        const labels = settings.map((s) => s.label);
        expect(new Set(labels).size).toBe(labels.length);
      }
    }
  });

  it("claims nothing about an unknown shop's own form", () => {
    // "Somewhere else" may state size, binding and file count, because those
    // are facts about the file. Colour and paper are theirs to ask.
    expect(getPrintDestination("other").extraSettings).toBeUndefined();
  });

  it("labels two files as interior and cover, in download order", () => {
    expect(exportFileRoles(2)).toEqual(["Interior pages", "Cover"]);
    expect(exportFileRoles(1)).toEqual(["Your book"]);
    expect(exportFileRoles(0)).toEqual(["Your book"]);
  });
});

describe("binding labels", () => {
  it("never offers the same label twice in one picker", () => {
    // Two radios reading "Hardcover" are one radio as far as anyone can tell,
    // and picking either looks like the same click.
    for (const destination of PRINT_DESTINATIONS) {
      const labels = bindingLabels(destinationPresets(destination));
      expect(new Set(labels).size).toBe(labels.length);
      for (const label of labels) expect(label.trim()).not.toBe("");
    }
  });

  it("leaves the size off when the binding alone is unambiguous", () => {
    // Lulu binds one of each, so "Spiral" and "Hardcover" say everything. The
    // trim is stated once below the picker rather than twice inside it.
    expect(bindingLabels(destinationPresets(getPrintDestination("lulu")))).toEqual([
      "Spiral",
      "Hardcover",
    ]);
  });

  it("adds the size only where two bindings collide", () => {
    // "Somewhere else" carries two hardcovers at different trims.
    const labels = bindingLabels(destinationPresets(getPrintDestination("other")));
    expect(labels).toEqual(["Spiral", "Hardcover 8.5 × 11", "Hardcover 8 × 10"]);
  });

  it("gives every preset a binding word to be labelled by", () => {
    for (const preset of COOKBOOK_PRESETS) {
      expect(preset.bindingName.trim()).not.toBe("");
      // The binding alone, not the product: "Spiral Cookbook" beside
      // "Hardcover Book" reads as two nouns rather than one choice.
      expect(preset.bindingName).not.toContain("Cookbook");
      expect(preset.bindingName).not.toContain("Book");
    }
  });
});

describe("what it costs", () => {
  it("returns the measured order's own price at its own page count", () => {
    // The anchor has to reproduce itself, or the scaling is wrong at the one
    // point we actually know the answer for.
    for (const destination of PRINT_DESTINATIONS) {
      const observed = destination.economics.observed;
      if (!observed) continue;
      expect(estimateTotalUsd(destination, observed.pages)).toBe(observed.totalUsd);
    }
  });

  it("scales with the book", () => {
    // A cookbook's price is almost entirely its page count, so a flat figure
    // would be wrong for everyone whose book is not the size we measured.
    // $28 for 95 pages, so twice the book is twice the bill.
    const lulu = getPrintDestination("lulu");
    expect(estimateTotalUsd(lulu, 190)).toBe(56);
    expect(estimateTotalUsd(lulu, 48)).toBe(14);
  });

  it("quotes no price for a shop nobody has ordered from", () => {
    // Blurb is real and we have never bought a book there. An invented rate
    // presented beside two measured ones would read exactly as trustworthy.
    expect(getPrintDestination("blurb").economics.observed).toBeUndefined();
    expect(estimateTotalUsd(getPrintDestination("blurb"), 64)).toBeNull();
    expect(destinationPriceLine(getPrintDestination("blurb"), 64)).not.toContain("$");
  });

  it("never shows a price for a book of no pages", () => {
    for (const destination of PRINT_DESTINATIONS) {
      expect(estimateTotalUsd(destination, 0)).toBeNull();
      expect(destinationPriceLine(destination, 0)).not.toContain("$0");
    }
  });

  it("keeps the two real orders comparable, because they are the same book", () => {
    // This pair is the whole argument for asking where before anything else:
    // one book, two counters, and the file each of them needs is different.
    const lulu = getPrintDestination("lulu").economics.observed!;
    const shop = getPrintDestination("copy-shop").economics.observed!;
    expect(lulu.pages).toBe(shop.pages);
    expect(lulu.totalUsd).toBeLessThan(shop.totalUsd);
  });

  it("says “from”, because the binding is chosen on the next step", () => {
    // Both anchors are spiral books; a hardcover costs more everywhere that
    // binds one. A floor is honest where a midpoint would not be.
    expect(destinationPriceLine(getPrintDestination("lulu"), 95)).toBe(
      "From about $28 for your 95 pages",
    );
    expect(destinationPriceLine(getPrintDestination("copy-shop"), 95)).toBe(
      "From about $72 for your 95 pages",
    );
  });

  it("says what a home printer costs without inventing a bill", () => {
    expect(destinationPriceLine(getPrintDestination("home"), 95)).toBe(
      "Ink and paper only",
    );
  });

  it("names the page count the price is for", () => {
    // An unqualified "$28" reads as the price of a cookbook. It is the price
    // of THIS cookbook, and a longer one costs more.
    expect(destinationPriceLine(getPrintDestination("lulu"), 95)).toBe(
      "From about $28 for your 95 pages",
    );
    expect(destinationPriceLine(getPrintDestination("lulu"), 190)).toContain("190 pages");
  });

  it("falls back to describing the place when there is no price", () => {
    // Blurb, and any shop we have not bought from. The row still says
    // something useful; it just does not say a number we made up.
    const blurb = destinationPriceLine(getPrintDestination("blurb"), 95);
    expect(blurb).toBe(getPrintDestination("blurb").tagline);
    expect(blurb).not.toContain("$");
  });
});
