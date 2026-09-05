import type { CookbookPresetId } from "@/types/recipe";

/**
 * Print-format presets for the paid cookbook export.
 *
 * The cookbook "PDF" is browser print (window.print() → Save as PDF); there is
 * no PDF library. So a preset is pure PAGE GEOMETRY — trim size, bleed, safe
 * margin, and binding gutter — expressed here and applied at the print layer
 * (CSS @page + a scaled, inset placement of the unchanged Letter page). The
 * recipe measurement/pagination engine is never re-tuned per preset: every
 * cookbook page is still laid out at the proven Letter size and only visually
 * scaled into each preset's safe area (see app/print/print.css and
 * `presetCardScale`). Two presets ship first (US Letter, 8×10 hardcover);
 * smaller trims (6×9, A5) are deferred because scaling Letter that far shrinks
 * the recipe text too much.
 */

/** The Letter card the cookbook is authored at, in inches — the fixed content
    box every preset scales. Matches `--recipe-card-width` / `-min-height` for
    `.recipe-print-preview--letter` in app/print/print.css (the deliberate
    0.125in/side safety shrink of the nominal 8.5×11). */
export const LETTER_CARD_WIDTH_IN = 8.25;
export const LETTER_CARD_HEIGHT_IN = 10.75;

const PX_PER_IN = 96;

/** A print shop we point people to on the post-export screen. Recommendations
    only — not endorsed or certified partners, and the exported PDF is not
    guaranteed to satisfy any given printer's spec. */
export interface PrinterOption {
  id: string;
  name: string;
  /** One-line "what it's good for". */
  note: string;
  url: string;
}

export interface CookbookPreset {
  id: CookbookPresetId;
  /** The product the user is making — what we lead with in the UI. */
  productName: string;
  /** Supporting trim detail, e.g. "US Letter (8.5 × 11 in)". */
  trimLabel: string;
  /** One-line "best for" for the picker. */
  bestFor: string;
  /** Finished (cut) page size, inches. */
  trimWidthIn: number;
  trimHeightIn: number;
  /** Per-edge bleed added beyond the trim for full-bleed pro printing, inches. */
  bleedIn: number;
  /** Safe margin on the non-binding edges, inches. */
  marginIn: number;
  /** EXTRA inset on the binding (inner) edge, on top of the margin, inches. */
  gutterIn: number;
  /** Coil/spiral binding punches the bound edge, so at EXPORT the binding-edge
      template decoration thickens to cover the punch (see `.rp-coil` in
      print.css). A spined hardcover has no punch → false, and gets no such
      treatment. Only affects export; the on-screen deck always previews plain. */
  coilBound: boolean;
  /** One word for the download's filename. Deliberately not `productName`:
      "Our-Favorite-Recipes-Spiral-Cookbook.pdf" says cookbook twice and an
      untitled book came out as "Cookbook-Spiral-Cookbook.pdf". */
  fileLabel: string;
  /** Named `@page` rule that sets this preset's physical sheet size. */
  pageName: string;
  /**
   * Whether this format needs a separate COVER WRAP file (back | spine | front
   * on one flat sheet).
   *
   * True for anything going to a print-on-demand service, which is every format
   * here except the one meant to come out of a printer at home. It used to be
   * true for case binding alone, on the reasoning that a coil book "has no spine
   * to wrap: its cover is just the first page". That is true of the physical
   * object and false of the upload form. Lulu states it flatly: "Your cover
   * should be completely separate from your interior file", and it wants that
   * cover as one wide integrated spread whatever the binding. A coil book bound
   * from our old single file printed the cover art twice, once as a cover and
   * again as page 1.
   *
   * When this is true the interior render also DROPS its cover pages — see
   * `InteriorDocument` in app/export/page.tsx.
   */
  wrapRequired: boolean;
  /**
   * How the wrap's extra material behaves, which is a different physical thing
   * per binding and therefore a different sheet size (see lib/coverWrap.ts).
   *
   * `case` — a hardcover. The extra is fold-over allowance: real surface area
   * that disappears around the board edge, so it is large (0.75in) and nothing
   * readable may sit in it. The spine also has to carry the boards.
   *
   * `flat` — a coil or paperback cover, printed flat and trimmed. The extra is
   * ordinary bleed (0.125in), art must run INTO it, and the spine is just the
   * paper block's own thickness with no boards.
   *
   * Ignored when `wrapRequired` is false.
   */
  wrapStyle: "case" | "flat";
  /**
   * Which print service's published cover anatomy to build the wrap from, when
   * we actually have one.
   *
   * A named string rather than the spec object itself, because the specs live
   * in lib/coverWrap.ts and that module already imports this one — handing the
   * object over here would make the two require each other at runtime.
   *
   * Absent means our own generic numbers, which are an estimate and say so.
   */
  wrapSpecId?: "lulu-casewrap";
  /** Class placed on `.recipe-print-preview` so the `page:` binding + geometry
      rules for this preset apply (see app/print/print.css). */
  pageClass: string;
  /** Ordered print-shop recommendations for this format (keys into PRINTERS). */
  printerIds: string[];
  /**
   * The same book prepared for a print service instead of a home printer, when
   * that is a choice worth offering.
   *
   * It is NOT a second format, and it was a mistake to show it as one: the trim,
   * the margins and every page of content are identical, so a format list
   * containing both asks someone to choose between two things that are the same
   * book. What actually differs is where it is going, which is a property of
   * how they intend to print rather than of the object. So the format stays one
   * card and this hangs off it as an option (see CookbookReadyDialog).
   *
   * Absent where there is nothing to choose. A hardcover cannot be made at home
   * at all, so it is always print-service shaped and offers no toggle.
   */
  printServicePresetId?: CookbookPresetId;
}

/* Deep links, not homepages. A homepage makes someone holding a finished PDF
   hunt for the upload form, and on two of these three the page they need is
   several clicks in. Each of these lands on the page that actually takes the
   file for the format we sent them there for. */
export const PRINTERS: Record<string, PrinterOption> = {
  lulu: {
    id: "lulu",
    name: "Lulu",
    note: "Coil bound, lay-flat",
    // Their cookbook page leads with exactly our spiral format: US Letter,
    // 8.5 × 11, coil bound, standard colour, 80# paper.
    url: "https://www.lulu.com/create/cookbooks",
  },
  blurb: {
    id: "blurb",
    name: "Blurb",
    note: "Hardcover, 8 × 10",
    // The PDF upload flow. 8 × 10 is their Standard Portrait photo book and a
    // Trade Book size, both available in hardcover.
    url: "https://www.blurb.com/pdf-to-book",
  },
  staples: {
    id: "staples",
    name: "Staples",
    note: "Local pickup",
    // The document upload page, where "Coil bind with spiral spine" is one of
    // the finishing options. `/services/printing/` is the marketing index and
    // does not take a file.
    url: "https://www.staples.com/services/printing/copies-documents-printing/",
  },
};

export const COOKBOOK_PRESETS: CookbookPreset[] = [
  {
    id: "us-letter",
    productName: "Spiral Cookbook",
    fileLabel: "Spiral",
    trimLabel: "US Letter (8.5 × 11 in)",
    bestFor: "Print at home — no bleed, spiral or 3-ring",
    trimWidthIn: 8.5,
    trimHeightIn: 11,
    bleedIn: 0,
    marginIn: 0.5,
    // Spiral/coil lies FLAT — no spine swallows the inner margin, so there is no
    // binding gutter at all. Text sits in a uniform, symmetric margin; art bleeds
    // to every edge and the coil punches through it (as real spiral books do).
    gutterIn: 0,
    coilBound: true,
    wrapRequired: false,
    wrapStyle: "flat",
    pageName: "rp-preset-us-letter",
    pageClass: "rp-page-us-letter",
    printServicePresetId: "coil-us-letter",
    // Staples only, and that is the whole distinction this format draws against
    // its print-service variant. A copy shop prints the document you give it and
    // coil binds the result, so a cover on page 1 is a cover; Lulu will not take
    // this file at all, because it wants the cover separately and wants bleed.
    // Blurb is not here either: they bind no coil at all.
    printerIds: ["staples"],
  },
  {
    // The same book as `us-letter`, sized for a print service instead of a
    // home printer. The trim is identical; what changes is that the sheet
    // carries 0.125in of bleed on every edge, so full-page photos, chapter
    // openers and the cover reach the trimmed edge instead of stopping short of
    // it. Uploading the zero-bleed file to Lulu gets you a white border around
    // every piece of art and a warning saying so.
    id: "coil-us-letter",
    productName: "Spiral Cookbook",
    fileLabel: "Spiral-PrintReady",
    trimLabel: "US Letter (8.5 × 11 in)",
    bestFor: "Print services like Lulu — full bleed, coil bound",
    trimWidthIn: 8.5,
    trimHeightIn: 11,
    bleedIn: 0.125,
    marginIn: 0.5,
    // Still no gutter, for the same reason `us-letter` has none: a coil book
    // lies flat. Lulu's own guidance agrees from the other direction — the coil
    // "bites about 0.375 in on the spine edge", and a uniform 0.5in margin
    // already clears that.
    gutterIn: 0,
    coilBound: true,
    wrapRequired: true,
    wrapStyle: "flat",
    pageName: "rp-preset-coil-us-letter",
    pageClass: "rp-page-coil-us-letter",
    printerIds: ["lulu"],
  },
  {
    // Lulu's most popular cookbook hardcover, and the format their own cookbook
    // page leads with. Same trim and same interior sheet as the spiral book;
    // what changes is a real gutter, because a cased spine swallows the inner
    // margin where a coil book lies flat.
    id: "hardcover-us-letter",
    productName: "Hardcover Book",
    fileLabel: "Hardcover",
    trimLabel: "US Letter (8.5 × 11 in)",
    bestFor: "Case bound, printed by Lulu",
    trimWidthIn: 8.5,
    trimHeightIn: 11,
    bleedIn: 0.125,
    marginIn: 0.5,
    gutterIn: 0.5,
    coilBound: false,
    wrapRequired: true,
    wrapStyle: "case",
    wrapSpecId: "lulu-casewrap",
    pageName: "rp-preset-hardcover-us-letter",
    pageClass: "rp-page-hardcover-us-letter",
    printerIds: ["lulu"],
  },
  {
    id: "hardcover-8x10",
    productName: "Hardcover Book",
    fileLabel: "Hardcover",
    trimLabel: "8 × 10 in",
    bestFor: "Pro print-on-demand — full-bleed, trimmed",
    trimWidthIn: 8,
    trimHeightIn: 10,
    bleedIn: 0.125,
    marginIn: 0.5,
    // Case binding has a real spine that swallows the inner margin, so text keeps
    // a gutter there; art still bleeds all four edges.
    gutterIn: 0.5,
    coilBound: false,
    wrapRequired: true,
    wrapStyle: "case",
    pageName: "rp-preset-hardcover-8x10",
    pageClass: "rp-page-hardcover-8x10",
    // Blurb only. 8×10 is their "Standard Portrait" photo book and a Trade Book
    // size; Lulu's trim list has no 8×10 in it at all (7×10 and 8.5×11 are the
    // neighbours), and Staples binds booklets rather than case-wrapped
    // hardcovers. Listing either was sending people to a shop that cannot take
    // the file.
    printerIds: ["blurb"],
  },
];

/**
 * The formats actually offered as a choice.
 *
 * `COOKBOOK_PRESETS` is every sheet we can render, which is not the same list:
 * a print-service variant is reached by ticking an option on its parent format,
 * never by picking it from a menu. Anything referenced as some other preset's
 * `printServicePresetId` is therefore filtered out here rather than listed
 * twice under two names.
 */
export const COOKBOOK_FORMATS: CookbookPreset[] = COOKBOOK_PRESETS.filter(
  (preset) =>
    !COOKBOOK_PRESETS.some((other) => other.printServicePresetId === preset.id),
);

/** The preset applied when a cookbook hasn't chosen one — closest to today's
    Letter behavior, zero bleed. */
export const DEFAULT_COOKBOOK_PRESET_ID: CookbookPresetId = "us-letter";

const PRESETS_BY_ID = new Map(COOKBOOK_PRESETS.map((preset) => [preset.id, preset] as const));

/** Resolves an id (possibly undefined / stale) to a preset, falling back to the
    default so callers never have to null-check. */
export function getCookbookPreset(id: CookbookPresetId | undefined): CookbookPreset {
  return (id && PRESETS_BY_ID.get(id)) || PRESETS_BY_ID.get(DEFAULT_COOKBOOK_PRESET_ID)!;
}

/* ── The geometry model, as executable spec ────────────────────────────────
   `presetSheetDims`, `presetCardScale` and `presetInsets` below have no runtime
   caller: print.css implements this geometry by hand in CSS, because the export
   is browser print and the page box has to be described in `@page` rules rather
   than computed in JS. They are kept, and unit-tested, because they are the only
   machine-checkable statement of what those CSS rules are supposed to mean — that
   a Letter card always fits inside each preset's safe box, that a spiral book
   takes no gutter while a hardcover does, that bleed lands on every edge. Delete
   them and the print model's invariants are asserted nowhere.

   So: intentionally unreferenced. Not dead code — a specification. If the CSS
   geometry changes, change these too and let the tests catch the disagreement. */

/** The physical sheet (trim + 2·bleed) in CSS px. */
export function presetSheetDims(preset: CookbookPreset): { w: number; h: number } {
  const w = (preset.trimWidthIn + preset.bleedIn * 2) * PX_PER_IN;
  const h = (preset.trimHeightIn + preset.bleedIn * 2) * PX_PER_IN;
  return { w, h };
}

/** The physical sheet (trim + 2·bleed) as CSS `in` length strings. At EXPORT the
    print page box (`.recipe-card-page`) is given this exact height so it matches
    the `@page size` in every engine. It must NOT rely on `100vh`: WebKit/Safari
    resolves viewport units in print against the on-screen viewport, not the page
    box, so a `100vh` card-page collapsed to ~7.5in and clipped everything below a
    top sliver on the custom (non-Letter) hardcover sheet. An absolute inch height
    removes that guesswork. */
export function presetSheetInches(preset: CookbookPreset): { w: string; h: string } {
  return {
    w: `${preset.trimWidthIn + preset.bleedIn * 2}in`,
    h: `${preset.trimHeightIn + preset.bleedIn * 2}in`,
  };
}

/**
 * The card box a COOKBOOK page is authored, measured, previewed AND printed on:
 * the preset's whole sheet, trim plus bleed.
 *
 * It used to be the fixed Letter card (8.25 × 10.75in) for every preset, with
 * the export scaling that card onto the real sheet. On hardcover the two widths
 * happen to be identical (8.25in), so the fill scale came out exactly 1.0 and
 * the transform was dropped as a harmless no-op — which left a 10.75in card on
 * a 10.25in sheet with `overflow: hidden`, quietly cutting **half an inch** off
 * the bottom of every text page. The contents list was budgeted against 10.75in
 * (see lib/tocPagination.ts) and a full recipe page could lose the end of its
 * last step. None of it was visible until the PDF was open, because the preview
 * was drawing a page shape the book does not have.
 *
 * Authoring on the sheet itself retires the whole class of problem: what is
 * measured, what is on screen and what is printed are one box, and the export
 * has nothing left to scale.
 */
export function presetCardDims(preset: CookbookPreset): { w: number; h: number } {
  return presetSheetDims(preset);
}

/** The same box as the two CSS custom properties the card layout reads, for a
    cookbook page's preview root and its off-screen measurer. Both must carry
    it: a card measured at one height and drawn at another is the clipping bug
    the measurement engine exists to prevent. */
export function presetCardVars(preset: CookbookPreset): Record<string, string> {
  const { w, h } = presetSheetInches(preset);
  return { "--recipe-card-width": w, "--recipe-card-min-height": h };
}

/** The card's height in inches — what the contents list budgets its pages
    against (lib/tocPagination.ts). */
export function presetCardHeightIn(preset: CookbookPreset): number {
  return preset.trimHeightIn + preset.bleedIn * 2;
}

/** The printable SAFE box for TEXT content, inches — trim minus the margins on
    every edge, minus the binding gutter (0 for a lie-flat spiral, non-zero for a
    hardcover whose spine swallows the inner margin). Art does NOT use this box —
    it bleeds the whole sheet, which the card now does by being the sheet
    (see `presetCardDims`). */
function presetSafeBox(preset: CookbookPreset): { w: number; h: number } {
  return {
    w: preset.trimWidthIn - preset.marginIn * 2 - preset.gutterIn,
    h: preset.trimHeightIn - preset.marginIn * 2,
  };
}

/** Scale that fits the Letter card into this preset's SAFE box (used for
    text-dominant pages — recipes, TOC, dividers). `min` so it fits on both
    axes; the shorter axis letterboxes rather than clipping. */
export function presetCardScale(preset: CookbookPreset): number {
  const safe = presetSafeBox(preset);
  return Math.min(safe.w / LETTER_CARD_WIDTH_IN, safe.h / LETTER_CARD_HEIGHT_IN);
}

/** Safe-area insets from the SHEET edge, in CSS inches, for a preset page.
    `block` = top/bottom, `outer` = the non-binding side, `bind` = the binding
    side (margin + gutter). The scaled content is centered inside these. */
export function presetInsets(preset: CookbookPreset): {
  block: string;
  outer: string;
  bind: string;
} {
  const outer = preset.bleedIn + preset.marginIn;
  const bind = preset.bleedIn + preset.marginIn + preset.gutterIn;
  return {
    block: `${outer}in`,
    outer: `${outer}in`,
    bind: `${bind}in`,
  };
}

/**
 * Which side of a page gets the extra binding gutter, given its role in a
 * spread. A verso (left) page binds on its RIGHT (inner) edge; a recto (right)
 * page binds on its LEFT edge; a single page (cover/back) is symmetric. Pure so
 * it can be unit-tested without a browser.
 */
export function gutterSideForRole(role: "left" | "right" | "single"): "left" | "right" | "none" {
  if (role === "left") return "right";
  if (role === "right") return "left";
  return "none";
}
