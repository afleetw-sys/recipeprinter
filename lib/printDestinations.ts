import { getCookbookPreset, PRINTERS, type PrinterOption } from "@/lib/cookbookPresets";
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
  },
  {
    id: "lulu",
    name: "Lulu",
    tagline: "Print on demand. Pages and cover upload as two separate files.",
    presetIds: ["coil-us-letter", "hardcover-us-letter"],
    printerId: "lulu",
  },
  {
    id: "blurb",
    name: "Blurb",
    tagline: "Print on demand, at their 8 × 10 trim. Pages and cover as two files.",
    presetIds: ["hardcover-8x10"],
    printerId: "blurb",
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
