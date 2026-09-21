import { describe, expect, it } from "vitest";
import { COOKBOOK_PRESETS, PRINTERS, getCookbookPreset } from "@/lib/cookbookPresets";
import {
  PRINT_DESTINATIONS,
  NO_BOOK_CHOICE,
  PHOTOS_HELP,
  choiceForPreset,
  destinationNote,
  downloadSummary,
  effectiveDestination,
  presetForChoice,
  settingsIntro,
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

describe("the two questions that name a format", () => {
  it("names exactly one preset for every complete set of answers", () => {
    const named = [
      presetForChoice({ kind: "hardcover", size: "8x10", photos: null }),
      presetForChoice({ kind: "hardcover", size: "letter", photos: null }),
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

  it("ignores the question that does not belong to the chosen kind", () => {
    // A hardcover's photos always reach the edge and a lay-flat book is always
    // US Letter, so a stale answer to the other question must not change the result.
    expect(presetForChoice({ kind: "hardcover", size: "letter", photos: "standard" })?.id).toBe(
      "hardcover-us-letter",
    );
    expect(presetForChoice({ kind: "flat", size: "8x10", photos: "edge" })?.id).toBe(
      "coil-us-letter",
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

describe("choosing a format at a destination that is not set up for it", () => {
  const lulu = getPrintDestination("lulu");
  const home = getPrintDestination("home");

  it("says nothing for the format a destination leads with", () => {
    for (const destination of PRINT_DESTINATIONS) {
      for (const preset of destinationPresets(destination)) {
        expect(destinationNote(destination, preset)).toBeNull();
      }
    }
  });

  it("says nothing when there is no destination, or no known spec to compare to", () => {
    for (const preset of COOKBOOK_PRESETS) {
      expect(destinationNote(null, preset)).toBeNull();
      expect(destinationNote(getPrintDestination("other"), preset)).toBeNull();
    }
  });

  it("says what will happen, in terms anyone can picture", () => {
    const toLulu = destinationNote(lulu, getCookbookPreset("us-letter"));
    expect(toLulu).toContain("Lulu");
    expect(toLulu).toMatch(/turned away/);
    expect(destinationNote(home, getCookbookPreset("coil-us-letter"))).toMatch(/cut off/);
  });

  it("says nothing where it would be a guess about the shop", () => {
    const copyShop = getPrintDestination("copy-shop");
    expect(destinationNote(copyShop, getCookbookPreset("coil-us-letter"))).toBeNull();
    expect(destinationNote(getPrintDestination("blurb"), getCookbookPreset("hardcover-us-letter"))).toBeNull();
  });

  it("never names a shop as asking for something it was not set up for", () => {
    // A copy shop handed an edge-to-edge book does not "ask for" two files.
    const copyShop = getPrintDestination("copy-shop");
    const preset = getCookbookPreset("coil-us-letter");
    expect(downloadSummary(copyShop, preset)).not.toContain("Staples");
    expect(settingsIntro(copyShop, preset)).not.toContain("Staples");
    // It still does for the format Lulu is set up for.
    expect(downloadSummary(lulu, preset)).toContain("Lulu");
  });

  it("writes the after-download instructions for the file when no destination was chosen", () => {
    expect(effectiveDestination(null, getCookbookPreset("us-letter")).id).toBe("home");
    expect(effectiveDestination(null, getCookbookPreset("coil-us-letter")).id).toBe("other");
    expect(effectiveDestination(lulu, getCookbookPreset("us-letter"))).toBe(lulu);
  });

  it("does not tell a copy shop's customer their binding", () => {
    const copyShop = getPrintDestination("copy-shop");
    const binding = destinationSettings(copyShop, getCookbookPreset("us-letter")).find(
      (row) => row.label === "Binding",
    );
    expect(binding?.value).toMatch(/lay-flat/);
  });
});

describe("what pressing Save produces", () => {
  it("names the service that wants two files", () => {
    // "two files" on its own is shorthand for something nobody has been told:
    // it is not a property of the book, it is the upload form having two
    // fields. Unattributed, it reads as a quirk of ours.
    for (const id of ["lulu", "blurb"] as const) {
      const destination = getPrintDestination(id);
      for (const preset of destinationPresets(destination)) {
        const line = downloadSummary(destination, preset);
        expect(line).toContain(destinationPrinter(destination)!.name);
        expect(line).toContain("two files");
      }
    }
  });

  it("says who asks without inventing a shop", () => {
    // "Somewhere else" has no name to put in the sentence.
    const other = getPrintDestination("other");
    for (const preset of destinationPresets(other)) {
      expect(downloadSummary(other, preset)).toBe(
        "Print services ask for two files: the pages and the cover.",
      );
    }
  });

  it("tells a copy shop's customer the shop does the binding", () => {
    // Confirmed on a real order: Staples took the one file and bound the cover
    // itself, which is the fact that makes it different from Lulu.
    const shop = getPrintDestination("copy-shop");
    const line = downloadSummary(shop, destinationPresets(shop)[0]);
    expect(line).toContain("One file");
    expect(line).toContain("binds the cover in");
  });

  it("tells a home printer where the cover ends up", () => {
    const home = getPrintDestination("home");
    expect(downloadSummary(home, destinationPresets(home)[0])).toBe(
      "One file, with the cover as its first page.",
    );
  });

  it("always says how many files, whatever the destination", () => {
    for (const destination of PRINT_DESTINATIONS) {
      for (const preset of destinationPresets(destination)) {
        const line = downloadSummary(destination, preset);
        expect(line).toMatch(/One file|two files/);
        expect(line.endsWith(".")).toBe(true);
      }
    }
  });
});

describe("the settings list's opening line", () => {
  it("says the files are already enough", () => {
    // It read "Lulu will ask for:", which lands as a list of things still to
    // be sorted out — and the reader has just been handed two files whose
    // names mean nothing to them. Nothing further is required, and that is the
    // one thing the screen did not say.
    for (const destination of PRINT_DESTINATIONS) {
      for (const preset of destinationPresets(destination)) {
        expect(settingsIntro(destination, preset)).toMatch(/^(That’s|Your book is ready)/);
      }
    }
  });

  it("names the service that is about to be uploaded to", () => {
    const lulu = getPrintDestination("lulu");
    expect(settingsIntro(lulu, destinationPresets(lulu)[0])).toBe(
      "That’s everything Lulu needs. When you upload, choose:",
    );
  });

  it("does not invent a service it cannot name", () => {
    const other = getPrintDestination("other");
    expect(settingsIntro(other, destinationPresets(other)[0])).toBe(
      "That’s everything a print service needs. When you upload, choose:",
    );
  });

  it("asks rather than uploads at a copy shop", () => {
    const shop = getPrintDestination("copy-shop");
    expect(settingsIntro(shop, destinationPresets(shop)[0])).toBe(
      "That’s everything the shop needs. Ask for:",
    );
  });

  it("has nobody to satisfy at home", () => {
    const home = getPrintDestination("home");
    expect(settingsIntro(home, destinationPresets(home)[0])).toBe(
      "Your book is ready. For the best result at home, use these print settings:",
    );
  });
});
