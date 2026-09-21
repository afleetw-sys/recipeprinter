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
  /** How a sentence refers to it: "for your own printer", "for Lulu". */
  place: string;
  /**
   * One line, describing the destination rather than the file. It is the whole
   * of the row's second line: no price is shown anywhere in this dialog, because
   * what a book costs depends on the binding, the paper and the shop's own
   * rates, none of which we set.
   *
   * Optional, and "Somewhere else" is why: the name already says everything
   * there is to say about a shop we know nothing about, and a line under it
   * restating that in other words is a row of text asking to be read for
   * nothing.
   */
  tagline?: string;
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
    place: "your own printer",
    tagline: "No bleed, so art stops short of the edge.",
    presetIds: ["us-letter"],
  },
  {
    // Coil, comb, adhesive spine, 3-ring, stapled. NOT hardcover: a copy shop
    // binds documents, and none of the chains list case binding as a finishing
    // option. So this destination offers one book and always will, and the
    // gutter that a cased spine needs has no home here.
    id: "copy-shop",
    name: "A copy shop",
    place: "a copy shop",
    tagline: "Staples, FedEx Office and the like.",
    presetIds: ["us-letter"],
    printerId: "staples",
    extraSettings: [{ label: "Colour", value: "Full colour, printed on both sides" }],
  },
  {
    id: "lulu",
    name: "Lulu",
    place: "Lulu",
    tagline: "Print on demand.",
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
    place: "Blurb",
    tagline: "Books at their 8 × 10 in trim.",
    presetIds: ["hardcover-8x10"],
    printerId: "blurb",
    extraSettings: [{ label: "Interior", value: "Full colour" }],
  },
  {
    id: "other",
    name: "Somewhere else",
    place: "another printer",
    // No tagline. "Somewhere else" is self-describing, and the cover-size
    // warning that used to live here is on step two, beside the fields it is
    // about.
    // Spiral or hardcover, both at US Letter. Deliberately the same two
    // choices every other row offers, because the question this step asks is
    // which book you want and that question does not change with the shop.
    //
    // The 8 × 10 hardcover is NOT here even though an unknown service might
    // want one: adding it made a third pill, "Hardcover 8 × 10" beside
    // "Hardcover 8.5 × 11", which turns a binding choice into a trim choice
    // wearing a binding's clothes. 8 × 10 is Blurb's trim and reachable from
    // Blurb's row. The zero-bleed home format is not here either — a shop that
    // takes a plain document with the cover bound in is a copy shop, which is
    // two rows up.
    presetIds: ["coil-us-letter", "hardcover-us-letter"],
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
 * How a book format is described: as what somebody is making, in the words
 * they would use, not as the properties of the file.
 *
 * "US Letter, standard" and "edge to edge" are how the four files differ, and
 * nobody arrives knowing which of those they want. What people know is where the
 * book is going and how it will be held together. So each format is named for
 * that, and the file's properties are said afterwards as plain consequences: how
 * many files they will get, whether photos reach the paper's edge, whether the
 * inside edge has room for a spine.
 *
 * Every format is offered whatever the destination. A destination only decides
 * which one is chosen to begin with.
 */
const FORMAT_COPY: Record<
  CookbookPresetId,
  { title: string; detail: string; suggestion: string }
> = {
  "us-letter": {
    title: "Print it at home or at a copy shop",
    detail:
      "One file, with the cover as page 1. Pages keep a small white border so a regular printer can print all of it.",
    suggestion: "printing it at home or at a copy shop",
  },
  "coil-us-letter": {
    title: "Order a lay-flat book (spiral, comb or coil)",
    detail:
      "Two files: the pages and the cover. Photos run all the way to the edge, and there is no extra margin, so the pages lie flat.",
    suggestion: "a lay-flat book",
  },
  "hardcover-us-letter": {
    title: "Order a hardcover book, 8.5 × 11 in",
    detail:
      "Two files: the pages and the cover wrap. Photos run to the edge, and the inside edge has extra room for the spine.",
    suggestion: "a hardcover book, 8.5 × 11 in",
  },
  "hardcover-8x10": {
    title: "Order a hardcover book, 8 × 10 in",
    detail:
      "Two files: the pages and the cover wrap. Photos run to the edge, and the inside edge has extra room for the spine.",
    suggestion: "a hardcover book, 8 × 10 in",
  },
};

export function formatOption(preset: CookbookPreset): { title: string; detail: string } {
  return FORMAT_COPY[preset.id];
}

/**
 * Every format, in the order they are offered. The same four whatever the
 * destination is: choosing a destination picks one of these, it does not
 * remove the others.
 */
export function allFormats(): CookbookPreset[] {
  return COOKBOOK_PRESETS;
}

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
 * Never a block and never a warning in red: only Lulu and Blurb are checked
 * against real orders, and for the rest we state our defaults as defaults. The
 * cook can still save whatever they chose. Where the consequence is one anybody
 * can picture (photos cut off at the edge, a file a print service turns away)
 * it says that; otherwise it says what we would suggest.
 */
export function destinationNote(
  destination: PrintDestination | null,
  preset: CookbookPreset,
): string | null {
  if (!destination || destination.unknownSpec) return null;
  if (destination.presetIds.includes(preset.id)) return null;
  if (destination.id === "home" && preset.bleedIn > 0) {
    return "In this one photos run all the way to the edge, which most home printers can't print, so the edges may be cut off.";
  }
  if ((destination.id === "lulu" || destination.id === "blurb") && preset.bleedIn === 0) {
    return `${destination.name} usually wants photos that run to the edge and a separate cover, so this file may be turned away. You can still save it.`;
  }
  const suggested = destinationPresets(destination)
    .map((option) => FORMAT_COPY[option.id].suggestion)
    .join(" or ");
  return `For ${destination.place} we suggest ${suggested}. You can still save this one.`;
}

/**
 * One sentence above the Save button saying what pressing it produces, and who
 * wants it that way.
 *
 * It used to read "· two files", tacked onto the trim. That is shorthand for
 * something nobody has been told yet: two files is not a property of the book,
 * it is Lulu's upload form having two fields, and a cook who does not know
 * that reads "two files" as a quirk of ours. Naming who asks turns a fact
 * about our export into a fact about their order, which is the only reason it
 * is worth knowing.
 */
export function downloadSummary(
  destination: PrintDestination,
  preset: CookbookPreset,
): string {
  if (preset.wrapRequired) {
    // Only where this shop is set up for this format: a copy shop handed an
    // edge-to-edge book does not "ask for" two files, and saying so would put
    // words in Staples' mouth.
    const printer = destination.presetIds.includes(preset.id)
      ? destinationPrinter(destination)
      : undefined;
    // "Somewhere else" has no name to put in the sentence, so the category
    // takes the subject instead of us inventing a shop.
    return printer
      ? `${printer.name} asks for two files: the pages and the cover.`
      : "Print services ask for two files: the pages and the cover.";
  }
  return destinationUploadsAFile(destination)
    ? "One file. The shop binds the cover in for you."
    : "One file, with the cover as its first page.";
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
  const who = printer ? printer.name : "a print service";
  return `That’s everything ${who} needs. When you upload, choose:`;
}
