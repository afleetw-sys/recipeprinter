/**
 * Case-wrap geometry for a hardcover cookbook.
 *
 * A hardcover is not printed as "a cover page". The printer needs ONE flat
 * landscape sheet that gets glued around the boards:
 *
 *     ┌──────────────────────────────────────────────────────────┐
 *     │  wrap                                              wrap  │
 *     │   ┌────────────┬────────┬────────────┐                   │
 *     │   │ back cover │ spine  │ front cover│                   │
 *     │   └────────────┴────────┴────────────┘                   │
 *     └──────────────────────────────────────────────────────────┘
 *       ← trimW → ← spine → ← trimW →
 *
 * The spine's width is not a design choice — it is the physical thickness of
 * the finished text block, so it depends on the PAGE COUNT and the caliper
 * (thickness) of one sheet of the chosen paper. Get it wrong and the printed
 * title sits off-centre on the finished book, or the file is rejected outright.
 *
 * Deliberately spec-neutral. Lulu and Blurb publish different calipers and
 * different wrap allowances, and RecipePrinter has no integration with either
 * (see `CookbookReadyDialog` — the export is a file the cook uploads), so
 * hard-coding one service's numbers would silently produce a file the OTHER
 * one rejects. Instead the two service-specific values are named constants
 * with documented meaning: drop in a printer's published figures and every
 * derived dimension follows.
 *
 * Everything here is pure inches in, inches out — no DOM, no React — so the
 * arithmetic is exercised in the node test env (see coverWrap.test.ts) rather
 * than by eyeballing a rendered PDF.
 */

import type { CookbookPreset } from "@/lib/cookbookPresets";

/**
 * OFF until the wrap survives print media.
 *
 * The geometry below is correct and tested, the renderer accepts the sheet, and
 * a wrap exports as a single page at exactly the right size. What does NOT work
 * yet is the LAYOUT under `@media print`: the print stylesheet is built around
 * one card per page and overrides the wrap's flex row with `!important`, so a
 * print-media capture currently shows the back cover only, the spine text
 * clipped into the bottom-left corner, and no front cover at all.
 *
 * Shipping that would hand someone who paid for a hardcover a second file that
 * is worse than no file, so the second download stays off until a print-media
 * capture shows back | spine | front in their correct panels.
 */
export const COVER_WRAP_ENABLED = false;

/**
 * Thickness of a single SHEET of the interior stock, in inches.
 *
 * A "page" in publishing is one side, so a 100-page book is 50 sheets — the
 * conversion is done in `spineWidthIn`, not here, so this constant stays a
 * plain physical measurement anyone can check against a printer's spec sheet.
 *
 * 0.0042in is a common figure for uncoated ~60lb / 90gsm text stock, which is
 * the usual default for print-on-demand interiors. Replace with the caliper
 * your printer publishes for the exact paper you order.
 */
export const DEFAULT_PAPER_CALIPER_IN = 0.0042;

/**
 * Extra material on every edge of the wrap, folded over and glued to the inside
 * of the board, in inches.
 *
 * This is NOT bleed. Bleed covers trimming slop on a flat page; the wrap
 * allowance is real surface area that physically disappears around the board
 * edge, so artwork inside it will never be seen on the finished book. 0.75in is
 * the common case-bind figure; confirm against your printer's template.
 */
export const DEFAULT_WRAP_ALLOWANCE_IN = 0.75;

/**
 * Thickness added by the two cover BOARDS plus the hinge gap, in inches.
 *
 * A case-bound spine is wider than the paper block alone: the boards sit on
 * either side of it. Folded into one constant rather than modelled as separate
 * board thickness and joint width, because printers publish it that way.
 */
export const DEFAULT_BOARD_ALLOWANCE_IN = 0.125;

export interface CoverWrapSpec {
  /** Thickness of one sheet of interior stock. */
  paperCaliperIn: number;
  /** Fold-over material on each edge. */
  wrapAllowanceIn: number;
  /** Boards + hinge, added to the paper block's own thickness. */
  boardAllowanceIn: number;
}

export const DEFAULT_COVER_WRAP_SPEC: CoverWrapSpec = {
  paperCaliperIn: DEFAULT_PAPER_CALIPER_IN,
  wrapAllowanceIn: DEFAULT_WRAP_ALLOWANCE_IN,
  boardAllowanceIn: DEFAULT_BOARD_ALLOWANCE_IN,
};

/**
 * Spine width for a finished book, in inches.
 *
 * `pageCount` is PAGES (sides), matching how both the printer's order form and
 * our own sheet count are expressed. Two pages share one sheet, so the paper
 * block is `pageCount / 2 * caliper`; the boards are added on top.
 *
 * An odd page count rounds UP to a whole sheet, because a physical book cannot
 * contain half a leaf — the binder adds a blank. Rounding down here would
 * under-report the thickness and pull the spine art off-centre.
 */
export function spineWidthIn(
  pageCount: number,
  spec: CoverWrapSpec = DEFAULT_COVER_WRAP_SPEC,
): number {
  const sheets = Math.ceil(Math.max(0, pageCount) / 2);
  return sheets * spec.paperCaliperIn + spec.boardAllowanceIn;
}

export interface CoverWrapGeometry {
  /** Full sheet the renderer must produce, including wrap allowance. */
  sheetWidthIn: number;
  sheetHeightIn: number;
  /** Spine panel width — `spineWidthIn` for this page count. */
  spineWidthIn: number;
  /** One cover panel (front or back) at trim size. */
  panelWidthIn: number;
  panelHeightIn: number;
  /** Fold-over margin on each edge; nothing readable may sit inside it. */
  wrapAllowanceIn: number;
  /** Distance from the sheet's left edge to where the front panel begins —
      i.e. past the wrap, the back panel, and the spine. */
  frontPanelOffsetIn: number;
}

/**
 * The full wrap for a preset at a given page count.
 *
 * Height is trim height plus wrap on the top and bottom only — a wrap has no
 * separate bleed, because the allowance already extends past every trimmed
 * edge and is far larger than any bleed would be.
 */
export function coverWrapGeometry(
  preset: CookbookPreset,
  pageCount: number,
  spec: CoverWrapSpec = DEFAULT_COVER_WRAP_SPEC,
): CoverWrapGeometry {
  const spine = spineWidthIn(pageCount, spec);
  const wrap = spec.wrapAllowanceIn;
  return {
    sheetWidthIn: preset.trimWidthIn * 2 + spine + wrap * 2,
    sheetHeightIn: preset.trimHeightIn + wrap * 2,
    spineWidthIn: spine,
    panelWidthIn: preset.trimWidthIn,
    panelHeightIn: preset.trimHeightIn,
    wrapAllowanceIn: wrap,
    frontPanelOffsetIn: wrap + preset.trimWidthIn + spine,
  };
}

/**
 * Below this, a spine is too narrow to carry legible type and the printer will
 * usually ask for a blank one instead. Roughly the point where a title set at
 * a readable size no longer fits between the hinges.
 */
export const MIN_TITLED_SPINE_IN = 0.25;

/** Whether this book's spine is thick enough to print a title on. */
export function spineFitsTitle(spineIn: number): boolean {
  return spineIn >= MIN_TITLED_SPINE_IN;
}
