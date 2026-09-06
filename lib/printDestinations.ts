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
  /** What it costs and what it trades away, for the list where places are
      compared against each other. */
  economics: DestinationEconomics;
}

/**
 * The money and the trade-offs, for step one.
 *
 * Step one is where someone decides WHERE, and the two things that decide it
 * are what it costs and what it gives up. Neither is knowable from the book.
 *
 * Prices scale, because a cookbook's price is almost entirely its page count —
 * the same book that cost $28 at Lulu costs roughly twice that at twice the
 * length, and quoting one flat figure would be wrong for everyone whose book
 * is not the size of the one we measured.
 */
export interface DestinationEconomics {
  /**
   * A real order, with what it cost and how many pages it was.
   *
   * The only honest anchor there is: every figure shown is this one scaled to
   * the book in front of the cook. A published "from" rate is a different
   * book's price under a different set of options, and we would be presenting
   * it as though it were this one's.
   *
   * Absent means we have not bought a book there and will not guess at one.
   */
  observed?: { pages: number; totalUsd: number; note: string };
  /** Shown in place of a dollar figure where there is no bill to scale — you
      are not buying anything, you are using up ink. */
  fixedNote?: string;
  /** One line each. The pro is what this place is best at; the con is what it
      costs you to choose it. Both have to be true of THIS place relative to
      the others, or they are filler. */
  pro?: string;
  con?: string;
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
    economics: {
      fixedNote: "Ink and paper only",
      pro: "Free, if you already have the paper",
      con: "No bleed, so art stops short of the edge",
    },
  },
  {
    // Coil, comb, adhesive spine, 3-ring, stapled. NOT hardcover: a copy shop
    // binds documents, and none of the chains list case binding as a finishing
    // option. So this destination offers one book and always will, and the
    // gutter that a cased spine needs has no home here.
    id: "copy-shop",
    name: "A copy shop",
    tagline: "One file, printed and bound as a document.",
    presetIds: ["us-letter"],
    printerId: "staples",
    extraSettings: [{ label: "Colour", value: "Full colour, printed on both sides" }],
    economics: {
      observed: { pages: 95, totalUsd: 72, note: "95-page spiral book, bound at a Staples counter" },
      pro: "Same day at Staples or FedEx Office",
      con: "The most expensive way to make one copy",
    },
  },
  {
    id: "lulu",
    name: "Lulu",
    tagline: "Print on demand. Pages and cover upload as two separate files.",
    presetIds: ["coil-us-letter", "hardcover-us-letter"],
    printerId: "lulu",
    extraSettings: [{ label: "Interior", value: "Full colour" }],
    economics: {
      // The same book as the Staples order above, which is what makes the
      // comparison worth showing: one book, two counters, $28 against $72.
      observed: { pages: 95, totalUsd: 28, note: "95-page spiral book, premium colour" },
      pro: "By far the cheapest for full colour",
      con: "Ships to you; there is nothing to pick up",
    },
  },
  {
    id: "blurb",
    name: "Blurb",
    tagline: "Print on demand, at their 8 × 10 trim. Pages and cover as two files.",
    presetIds: ["hardcover-8x10"],
    printerId: "blurb",
    extraSettings: [{ label: "Interior", value: "Full colour" }],
    economics: {
      // No `observed`, because no one here has ordered from Blurb. The row
      // shows no price rather than a guessed one — see `estimateTotalUsd`.
      con: "Their 8 × 10 trim only, and no coil binding",
    },
  },
  {
    id: "other",
    name: "Somewhere else",
    tagline: "Any other print service. You’ll need the cover size from their upload page.",
    // Every print-ready shape, because we cannot narrow it: an unknown service
    // might want any of them. The zero-bleed home format is NOT here — a shop
    // that takes a plain document with the cover bound in is a copy shop, and
    // that is the row above. Listing it here put a fourth option in the picker
    // whose only difference from the first was invisible.
    presetIds: ["coil-us-letter", "hardcover-us-letter", "hardcover-8x10"],
    unknownSpec: true,
    economics: {},
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

/**
 * Labels for a destination's bindings, guaranteed distinct within the group.
 *
 * "Spiral" and "Hardcover" are the right words where a destination binds one
 * of each. They are not enough for "somewhere else", which offers two
 * hardcovers at different trims — the picker would have shown "Hardcover"
 * twice, and picking either would have looked like the same click.
 *
 * So the trim is appended only where it is doing work. A label carries the
 * size when, and only when, another book in the same list shares its binding.
 */
export function bindingLabels(presets: CookbookPreset[]): string[] {
  const counts = new Map<string, number>();
  for (const preset of presets) {
    counts.set(preset.bindingName, (counts.get(preset.bindingName) ?? 0) + 1);
  }
  return presets.map((preset) => {
    if ((counts.get(preset.bindingName) ?? 0) < 2) return preset.bindingName;
    const dim = (inches: number) => String(Number(inches.toFixed(2)));
    return `${preset.bindingName} ${dim(preset.trimWidthIn)} × ${dim(preset.trimHeightIn)}`;
  });
}

/**
 * What this destination would cost for a book of this many pages, in whole
 * dollars, or null where we have no order to scale from.
 *
 * Straight-line from one measured order, which is a deliberate simplification
 * and a stated one: a real quote has setup costs, binding costs and volume
 * breaks in it, and with a single data point there is no way to separate a
 * fixed part from a per-page part. Scaling the whole bill per page slightly
 * overstates a short book and understates a long one.
 *
 * That is the right error to make here. The number is labelled as an estimate
 * from one order, and it is being used to choose between places whose real
 * difference is more than twofold — a few dollars of curve does not change
 * which row you pick. What WOULD change it is inventing a rate for a shop
 * nobody has bought from, which is why an absent order returns null and the
 * row simply shows no price.
 */
export function estimateTotalUsd(
  destination: PrintDestination,
  pages: number,
): number | null {
  const observed = destination.economics.observed;
  if (!observed || observed.pages <= 0 || pages <= 0) return null;
  return Math.round((observed.totalUsd / observed.pages) * pages);
}

/**
 * The one-line summary under a destination's name: what it costs, and how many
 * files it hands back.
 *
 * "From about", never "about": both anchors are spiral books, step one does
 * not know the binding yet, and a hardcover costs more than a coil book at
 * every service that binds both. The floor is honest; a midpoint would not be.
 */
export function destinationPriceLine(
  destination: PrintDestination,
  pages: number,
): string {
  const presets = destinationPresets(destination);
  // Only stated when every book this destination makes agrees — otherwise the
  // count depends on a choice that has not been made yet.
  const allWrapped = presets.every((preset) => preset.wrapRequired);
  const noneWrapped = presets.every((preset) => !preset.wrapRequired);
  const files = allWrapped ? "two files" : noneWrapped ? "one file" : "";

  const estimate = estimateTotalUsd(destination, pages);
  const money = estimate !== null ? `From about $${estimate}` : destination.economics.fixedNote;
  if (!money) return files ? files.charAt(0).toUpperCase() + files.slice(1) : destination.tagline;
  return files ? `${money} · ${files}` : money;
}
