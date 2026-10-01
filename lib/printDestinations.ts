import {
  COOKBOOK_PRESETS,
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
    presetIds: ["us-letter"],
  },
  {
    // Coil, comb, adhesive spine, 3-ring, stapled. NOT hardcover: a copy shop
    // binds documents, and none of the chains list case binding as a finishing
    // option. So this destination offers one book and always will, and the
    // gutter that a cased spine needs has no home here.
    id: "copy-shop",
    name: "A copy shop",
    presetIds: ["us-letter"],
    printerId: "staples",
  },
  {
    id: "lulu",
    name: "Lulu",
    presetIds: ["coil-us-letter", "hardcover-us-letter"],
    printerId: "lulu",
  },
  {
    id: "blurb",
    name: "Blurb",
    presetIds: ["hardcover-8x10"],
    printerId: "blurb",
  },
];

/** Internal fallback for after-download instructions when no printer was
    selected. It is deliberately not in PRINT_DESTINATIONS: "Somewhere else"
    duplicated the already-available None/manual-choice path in the menu. */
const OTHER_DESTINATION: PrintDestination = {
  id: "other",
  name: "Somewhere else",
  presetIds: ["coil-us-letter", "hardcover-us-letter"],
  unknownSpec: true,
};

const DESTINATIONS_BY_ID = new Map(
  [...PRINT_DESTINATIONS, OTHER_DESTINATION].map((d) => [d.id, d] as const),
);

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
 * The four files as the questions somebody can actually answer.
 *
 * "Which of these four formats?" was a list of how the files differ, and nobody
 * arrives knowing. What people know is how the book will be held together, and
 * then the follow-ups that apply: a hardcover has a size (8 × 10 or 8.5 × 11),
 * and every binding has a photo finish (standard white frame or edge to edge).
 * Photo finish is presentation layered over the printer's physical geometry.
 */
export type BookKind = "hardcover" | "flat";
export type BookSize = "8x10" | "letter";
export type BookPhotos = "standard" | "edge";

export interface BookChoice {
  kind: BookKind | null;
  size: BookSize | null;
  photos: BookPhotos | null;
}

/** Standard photos are the starting presentation; edge to edge is an explicit
 * choice. Keeping the default here also means changing the binding or clearing
 * a printer does not quietly switch the book back to bleed artwork. */
export const NO_BOOK_CHOICE: BookChoice = { kind: null, size: null, photos: "standard" };

/** What a preset is, in the terms of the questions above. */
export function choiceForPreset(preset: CookbookPreset): BookChoice {
  return {
    kind: preset.coilBound ? "flat" : "hardcover",
    size: preset.trimWidthIn === 8.5 ? "letter" : "8x10",
    photos: preset.bleedIn > 0 ? "edge" : "standard",
  };
}

/**
 * The one preset a complete set of answers names, or null while a follow-up is
 * still unanswered. A lay-flat book is always US Letter; hardcover size and
 * photo finish are both required, though finish does not change its preset.
 */
export function presetForChoice(
  choice: BookChoice,
  availablePresets?: CookbookPreset[],
): CookbookPreset | null {
  const candidates = availablePresets ?? COOKBOOK_PRESETS;
  if (choice.kind === "hardcover") {
    if (!choice.size || !choice.photos) return null;
    return (
      candidates.find(
        (preset) => !preset.coilBound && choiceForPreset(preset).size === choice.size,
      ) ?? null
    );
  }
  if (choice.kind === "flat") {
    if (!choice.photos) return null;
    // A named printer decides the physical page geometry. Its bleed-capable
    // PDF is still required when the photos themselves use a standard frame.
    if (availablePresets) return candidates.find((preset) => preset.coilBound) ?? null;
    return (
      candidates.find(
        (preset) => preset.coilBound && choiceForPreset(preset).photos === choice.photos,
      ) ?? null
    );
  }
  return null;
}

/** One line for the photos question, said for the answer that is selected. */
export const PHOTOS_HELP: Record<BookPhotos, string> = {
  standard: "Keeps a small white border, so any printer can print all of it.",
  edge: "Photos run all the way to the edge. Made for print shops.",
};

/**
 * One sentence saying what pressing Save produces.
 *
 * About the file and nothing else. It used to name who asks for it ("Lulu asks
 * for two files", "Print services ask for..."), which made a claim about a shop
 * we may not even have been told about: the destination is only a shortcut now,
 * so somebody can pick their own printer and then a hardcover, and a sentence
 * about print services has nothing to attach to. The number of files is a fact
 * about what we are about to make.
 */
export function downloadSummary(preset: CookbookPreset, singleFile = false): string {
  return preset.wrapRequired && !singleFile
    ? "You’ll get two files: the pages and the cover."
    : "You’ll get one file, with the cover as its first page.";
}
