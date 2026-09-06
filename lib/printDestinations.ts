import {
  getCookbookPreset,
  PRINTERS,
  type CookbookPreset,
  type PrinterOption,
} from "@/lib/cookbookPresets";
import type { CookbookPresetId } from "@/types/recipe";

/**
 * Where the book is going, which is the first thing worth asking and the last
 * thing we used to ask.
 *
 * The dialog used to lead with "which book?" and leave the printer's
 * requirements as homework. That is backwards: bleed, whether the cover travels
 * as its own file, the spine, the wrap size — none of those are properties of
 * the book. They are properties of the destination, and the cook always knows
 * the destination. What they cannot be expected to know is that Lulu wants
 * 0.125in of bleed and a 17.75in cover while the copy shop down the road wants
 * neither.
 *
 * So a destination names the shapes it can actually make, and the geometry
 * follows from that rather than from a checkbox someone had to reason about.
 */
export type PrintDestinationId = "home" | "copy-shop" | "lulu" | "blurb" | "other";

export interface PrintDestination {
  id: PrintDestinationId;
  /** What it is called on the first screen. */
  name: string;
  /** One line, describing the destination rather than the file. */
  tagline: string;
  /**
   * The books this destination can make, in order; the first is the default.
   *
   * More than one only where the destination genuinely offers a choice. Lulu
   * binds both coil and casewrap at US Letter; a copy shop prints a document,
   * so there is one answer and the second screen is a confirmation.
   */
  presetIds: CookbookPresetId[];
  /** The shop's own upload page, via PRINTERS. Absent for printing at home. */
  printerId?: string;
  /**
   * True where we do not know the printer's requirements and the cook has to
   * read them off an upload page. Only "somewhere else" — everywhere else the
   * numbers are either verified against a real order or not needed at all.
   */
  unknownSpec?: boolean;
  /**
   * Rows this destination's own order form asks for that the book cannot state.
   *
   * Deliberately short and deliberately incomplete. Size, binding and how many
   * files to upload are derived from the preset in `destinationSettings`,
   * because those are facts about the file we just made and must not be allowed
   * to disagree with it. These are the remaining choices — colour, sides — that
   * belong to the shop rather than the book. Anything we have not confirmed on
   * a real order (paper weight, cover finish, turnaround) is left out: a
   * confidently wrong setting is worse than no setting, because it is followed.
   */
  extraSettings?: PrintSetting[];
}

/** One row of "choose this" on the screen after the download. */
export interface PrintSetting {
  label: string;
  value: string;
}

export const PRINT_DESTINATIONS: PrintDestination[] = [
  {
    id: "home",
    name: "My own printer",
    tagline: "One file, cover included. No bleed, so art stops short of the edge.",
    presetIds: ["us-letter"],
  },
  {
    id: "copy-shop",
    name: "A copy shop",
    tagline: "Staples, Office Depot, FedEx Office. One file, printed and bound as a document.",
    presetIds: ["us-letter"],
    printerId: "staples",
    extraSettings: [{ label: "Colour", value: "Full colour, printed on both sides" }],
  },
  {
    id: "lulu",
    name: "Lulu",
    tagline: "Print on demand. Pages and cover upload as two separate files.",
    presetIds: ["coil-us-letter", "hardcover-us-letter"],
    printerId: "lulu",
    extraSettings: [{ label: "Interior", value: "Full colour" }],
  },
  {
    id: "blurb",
    name: "Blurb",
    tagline: "Print on demand, at their 8 × 10 trim. Pages and cover as two files.",
    presetIds: ["hardcover-8x10"],
    printerId: "blurb",
    extraSettings: [{ label: "Interior", value: "Full colour" }],
  },
  {
    id: "other",
    name: "Somewhere else",
    tagline: "Any other print service. You’ll need the cover size from their upload page.",
    // Every print-ready shape, because we cannot narrow it: an unknown service
    // might want any of them. The home format is here too — plenty of shops
    // take a plain document with the cover bound in.
    presetIds: ["coil-us-letter", "hardcover-us-letter", "hardcover-8x10", "us-letter"],
    unknownSpec: true,
  },
];

const DESTINATIONS_BY_ID = new Map(PRINT_DESTINATIONS.map((d) => [d.id, d] as const));

export function getPrintDestination(id: PrintDestinationId): PrintDestination {
  return DESTINATIONS_BY_ID.get(id) ?? PRINT_DESTINATIONS[0];
}

/** The shop's upload page, where there is one to link to. */
export function destinationPrinter(destination: PrintDestination): PrinterOption | undefined {
  return destination.printerId ? PRINTERS[destination.printerId] : undefined;
}

/**
 * The books a destination offers, resolved.
 *
 * Kept here rather than in the dialog so a destination naming a preset that
 * does not exist fails a test rather than silently rendering the default book
 * under the wrong name.
 */
export function destinationPresets(destination: PrintDestination) {
  return destination.presetIds.map((id) => getCookbookPreset(id));
}

/**
 * Whether this destination takes a file at all.
 *
 * Printing at home is the one that doesn't: there is no order form, no size
 * dropdown and no upload field, so the things worth telling someone are about
 * their own printer driver instead. Everywhere else there is a form, and the
 * file we made has already decided most of its answers.
 */
export function destinationUploadsAFile(destination: PrintDestination): boolean {
  return Boolean(destination.printerId) || Boolean(destination.unknownSpec);
}

/**
 * What to choose, on the screen shown once the files have been saved.
 *
 * This is the half of the export nobody could do for themselves. The file's
 * geometry is only correct against ONE set of order options — a US Letter book
 * with bleed uploaded as an 8 × 10 is rejected, and a two-file coil book handed
 * over as one is the exact failure we watched happen — and none of that is
 * visible by opening the PDF.
 *
 * Size, binding and the file count are read off the preset rather than written
 * down per destination, so they cannot drift away from what was actually
 * rendered. The rest is the shop's own form.
 */
export function destinationSettings(
  destination: PrintDestination,
  preset: CookbookPreset,
): PrintSetting[] {
  if (!destinationUploadsAFile(destination)) {
    // A home printer's defaults are wrong for this file in two specific ways,
    // and both are silent. "Fit to page" shrinks every sheet a few percent to
    // clear the printer's unprintable margin, which is how a book laid out to
    // the edge comes back with a white frame and a slightly smaller everything.
    // Single-sided doubles the paper and prints every recipe on a right-hand
    // page. Neither announces itself.
    return [
      { label: "Paper", value: preset.trimLabel },
      { label: "Scale", value: "Actual size, not “Fit to page”" },
      { label: "Sides", value: "Double-sided, flipped on the long edge" },
      { label: "Binding", value: "Coil, comb or a 3-ring binder, once it’s printed" },
    ];
  }

  return [
    { label: "Size", value: preset.trimLabel },
    { label: "Binding", value: preset.coilBound ? "Coil bound" : "Hardcover, case wrap" },
    ...(destination.extraSettings ?? []),
    {
      label: "Files",
      value: preset.wrapRequired
        ? "Interior and cover upload separately"
        : "One file, with the cover as page 1",
    },
  ];
}

/**
 * What each saved file is for, in the order they were downloaded.
 *
 * The upload form asks twice and the two fields are not interchangeable; the
 * filenames end in "-Cover" but that is a convention someone has to notice.
 */
export function exportFileRoles(fileCount: number): string[] {
  if (fileCount < 2) return ["Your book"];
  return ["Interior pages", "Cover"];
}
