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
    extraSettings: [{ label: "Colour", value: "Full colour, printed on both sides" }],
  },
  {
    id: "lulu",
    name: "Lulu",
    presetIds: ["coil-us-letter", "hardcover-us-letter"],
    printerId: "lulu",
    // Standard or premium: both are full colour and both take the same file,
    // so this is a price decision rather than a requirement, and it is stated
    // as an option rather than an instruction.
    extraSettings: [{ label: "Interior", value: "Standard or premium colour" }],
  },
  {
    id: "blurb",
    name: "Blurb",
    presetIds: ["hardcover-8x10"],
    printerId: "blurb",
    extraSettings: [{ label: "Interior", value: "Full colour" }],
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
      { label: "Scale", value: "Actual size (100%)" },
      { label: "Sides", value: "Double-sided, flip on the long edge" },
      { label: "Binding", value: "Any coil, comb or 3-ring binder works" },
    ];
  }

  return [
    { label: "Size", value: preset.trimLabel },
    { label: "Binding", value: bindingSetting(preset) },
    ...(destination.extraSettings ?? []),
    {
      label: "Files",
      value: preset.wrapRequired
        ? "Interior and cover upload separately"
        : "One file, with the cover as page 1",
    },
  ];
}

/** The binding to ask a shop for, as a suggestion that matches the file. */
function bindingSetting(preset: CookbookPreset): string {
  if (!preset.coilBound) return "Hardcover, case wrap";
  return preset.wrapRequired ? "Coil bound" : "Coil, comb or another lay-flat binding";
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
 * The destination the after-download instructions should be written for.
 *
 * The destination is optional now: somebody can pick a format without saying
 * where it is going. Instructions still need a shape to follow, and the file
 * itself says which one — a book with no separate cover is what comes off a
 * desktop printer, and one with a cover wrap goes to a service that states its
 * own numbers.
 */
export function effectiveDestination(
  destination: PrintDestination | null,
  preset: CookbookPreset,
): PrintDestination {
  if (destination) return destination;
  return getPrintDestination(preset.wrapRequired ? "other" : "home");
}

/**
 * A quiet heads-up when the chosen format is not what a destination is set up
 * for, or null when it is (or when we know nothing about the destination).
 *
 * Only where the consequence is one anybody can picture: photos cut off at the
 * edge of a home printer, or a file a print service turns away. Everywhere else
 * we know too little about the shop to say anything, and saying less is safer
 * than a confidently wrong line. Never a block: the cook can save what they chose.
 */
export function destinationNote(
  destination: PrintDestination | null,
  preset: CookbookPreset,
): string | null {
  if (!destination || destination.unknownSpec) return null;
  if (destination.presetIds.includes(preset.id)) return null;
  if (destination.id === "home" && preset.bleedIn > 0) {
    return "Photos run to the edge here, which most home printers can’t print, so the edges may be cut off.";
  }
  if ((destination.id === "lulu" || destination.id === "blurb") && preset.bleedIn === 0) {
    return `${destination.name} usually wants photos that run to the edge and a separate cover, so this file may be turned away.`;
  }
  return null;
}

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
export function downloadSummary(preset: CookbookPreset): string {
  return preset.wrapRequired
    ? "You’ll get two files: the pages and the cover."
    : "You’ll get one file, with the cover as its first page.";
}

/**
 * The line introducing the settings list, once the files have been saved.
 *
 * It read "Lulu will ask for:", which lands as a list of things still to be
 * sorted out — and the reader has just been handed two files whose names mean
 * nothing to them, so the natural reading is that something else is required.
 * Nothing is. The files are already built for exactly these options; the list
 * is there so the order form gets set to match them, not so anything gets
 * fixed.
 *
 * So it says that first. "That's everything Lulu needs" is the whole point of
 * the screen, and it was the one thing the screen did not say.
 */
export function settingsIntro(
  destination: PrintDestination,
  preset: CookbookPreset,
): string {
  if (!destinationUploadsAFile(destination)) {
    return "Your book is ready. For the best result at home, use these print settings:";
  }
  if (!preset.wrapRequired) {
    return "That’s everything the shop needs. Ask for:";
  }
  const printer = destination.presetIds.includes(preset.id)
    ? destinationPrinter(destination)
    : undefined;
  const who = printer ? printer.name : "your printer";
  return `That’s everything ${who} needs. When you upload, choose:`;
}
