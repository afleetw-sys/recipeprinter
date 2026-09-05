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
 * ON.
 *
 * This was off because a wrap exported as "the back cover only, the spine text
 * clipped into the bottom-left corner, and no front cover at all", which was
 * read as an `@media print` problem. It was not one. The same collapse happened
 * on screen, and it had three ordinary causes, all now fixed:
 *
 *   1. `.cookbook-wrap` also carries `.recipe-card-set` (for the palette), and
 *      that rule is written for a STACK of pages: `flex-direction: column`,
 *      `max-width: 100%`. The wrap never overrode either, so it laid its panels
 *      out vertically and clamped a 17.76in sheet to its parent's width.
 *   2. print.css reads `--rp-spine-w`, and the export route set every wrap
 *      variable except that one. An unset `var()` is invalid at computed-value
 *      time rather than an error, so the spine silently became `width: auto`.
 *   3. Nothing dropped the cover pages from the interior, so a book that
 *      produced a wrap also printed the same cover as its first page.
 */
export const COVER_WRAP_ENABLED = true;

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
  /**
   * How much wider one cover BOARD is than the pages it protects, and how much
   * taller. A cased book's boards stand slightly proud of the block — the lip
   * you run a thumb over on any hardback — so a cover panel is not trim size.
   *
   * Horizontal counts the outer edge only: there is no overhang on the spine
   * side, where the board meets the hinge. Vertical counts top and bottom
   * together. Both zero for a flat cover, which is trimmed flush with its
   * pages.
   */
  overhangHIn: number;
  overhangVIn: number;
  /**
   * A spine the service quotes flat, rather than one computed from the page
   * count.
   *
   * Set only where a printer has actually been observed doing that. It is not a
   * shortcut around the caliper problem — it is the answer to a different
   * question, asked by a binding whose "spine" is not the thickness of anything.
   */
  fixedSpineIn?: number;
}

export const DEFAULT_COVER_WRAP_SPEC: CoverWrapSpec = {
  paperCaliperIn: DEFAULT_PAPER_CALIPER_IN,
  wrapAllowanceIn: DEFAULT_WRAP_ALLOWANCE_IN,
  boardAllowanceIn: DEFAULT_BOARD_ALLOWANCE_IN,
  overhangHIn: 0,
  overhangVIn: 0,
};

/**
 * Lulu's hardcover casewrap, from their own published anatomy rather than our
 * estimates of it.
 *
 * "A hardcover is printed 0.75" larger than your front cover trim size, with
 * extra artwork wrapped around the cover board", and "our expected overhang for
 * all hardcovers is .125"... this adds .25" to your vertical measurement and
 * .125" to your horizontal measurement. There is no overhang on the spine side."
 *
 * Those three numbers reproduce the sheet Lulu quoted for a US Letter cookbook
 * exactly — 19.25 x 12.75 at a 0.5in spine — which is how this is known to be
 * right rather than merely plausible. The one thing they do NOT publish is the
 * spine, because it depends on the stock and their own boards: "once you have
 * uploaded your interior file, the system creates your custom template, which
 * includes the necessary spine width". So the spine is the single number a cook
 * still has to copy across, and everything else follows from it.
 */
/**
 * Lulu's COIL bound cover.
 *
 * A paperback shape — the two covers side by side at trim, with 0.125in of
 * bleed on every edge — and their spine quoted flat at half an inch:
 *
 *     8.5 + 8.5 + 0.5 + (2 x 0.125)  =  17.75in wide
 *     11        + (2 x 0.125)        =  11.25in tall
 *
 * The 0.5in is a `fixedSpineIn` because Lulu quotes it rather than deriving it.
 * A round half inch is not the thickness of ninety sheets of anything; it is
 * the strip their template leaves for the coil to punch through, and it does
 * not move with the book.
 *
 * This spec previously carried the CASEWRAP numbers, giving a 19.25 x 12.75
 * sheet, and Lulu rejected that. The mistake is worth recording because it was
 * not arithmetic: those numbers came off the requirements panel on the upload
 * page, which was still describing a hardcover after the project had been
 * switched to coil. A panel that contradicts its own validator is not a source.
 * The first cover we ever sent, at 17.444in, had this shape right and only the
 * spine wrong — it used our estimated 0.194in instead of Lulu's 0.5in.
 */
export const LULU_COIL_SPEC: CoverWrapSpec = {
  paperCaliperIn: DEFAULT_PAPER_CALIPER_IN,
  wrapAllowanceIn: 0.125,
  boardAllowanceIn: 0,
  // Trimmed flush with the pages: no boards, so nothing stands proud.
  overhangHIn: 0,
  overhangVIn: 0,
  fixedSpineIn: 0.5,
};

export const LULU_CASEWRAP_SPEC: CoverWrapSpec = {
  paperCaliperIn: DEFAULT_PAPER_CALIPER_IN,
  wrapAllowanceIn: 0.75,
  boardAllowanceIn: DEFAULT_BOARD_ALLOWANCE_IN,
  overhangHIn: 0.125,
  overhangVIn: 0.25,
};

/**
 * The spec a preset's binding implies, when the caller doesn't name one.
 *
 * A `flat` cover (coil, paperback) is not a case wrap with smaller numbers — it
 * is a different object. There is no fold-over: the extra material is ordinary
 * bleed that gets trimmed off, so it comes from the preset rather than from a
 * binding constant, and art has to run into it instead of stopping at the trim.
 * There are no boards either, so the spine is exactly the paper block.
 *
 * Getting this wrong is not cosmetic. A coil cover built to the case numbers
 * would be 1.25in too wide and 1.25in too tall on a sheet whose size the
 * printer checks before it will accept the file.
 */
export function wrapSpecFor(preset: CookbookPreset): CoverWrapSpec {
  // A service's own anatomy beats our generic one wherever we have it.
  if (preset.wrapSpecId === "lulu-casewrap") return LULU_CASEWRAP_SPEC;
  if (preset.wrapSpecId === "lulu-coil") return LULU_COIL_SPEC;
  if (preset.wrapStyle === "case") return DEFAULT_COVER_WRAP_SPEC;
  return {
    paperCaliperIn: DEFAULT_PAPER_CALIPER_IN,
    wrapAllowanceIn: preset.bleedIn,
    boardAllowanceIn: 0,
    // A flat cover is trimmed flush with the pages. Nothing stands proud.
    overhangHIn: 0,
    overhangVIn: 0,
  };
}

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
  // A quoted spine is not an estimate to be improved on — see `fixedSpineIn`.
  if (spec.fixedSpineIn !== undefined) return spec.fixedSpineIn;
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
  /** Fold-over (or bleed) margin on the LEFT and RIGHT edges; nothing readable
      may sit inside it. */
  wrapAllowanceIn: number;
  /** The same on the top and bottom. Equal to `wrapAllowanceIn` for geometry we
      derive ourselves, and separate only because a sheet size quoted by a print
      service does not have to be symmetric once the spine is accounted for. */
  wrapAllowanceYIn: number;
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
  spec: CoverWrapSpec = wrapSpecFor(preset),
): CoverWrapGeometry {
  return wrapGeometryForSpine(preset, spineWidthIn(pageCount, spec), spec);
}

/**
 * The wrap for a KNOWN spine, which is the only part a print service will not
 * publish a formula for.
 *
 * Everything else about a cover is arithmetic on numbers the printer does
 * publish — Lulu states its wrap allowance and its board overhang outright (see
 * `LULU_CASEWRAP_SPEC`) — so once the spine is in hand the sheet follows, and a
 * cook copying figures off an upload page only ever has to copy the one.
 */
export function wrapGeometryForSpine(
  preset: CookbookPreset,
  spineIn: number,
  spec: CoverWrapSpec = wrapSpecFor(preset),
): CoverWrapGeometry {
  const spine = Math.max(0, spineIn);
  const wrap = spec.wrapAllowanceIn;
  // A cover panel is the BOARD, which on a cased book stands proud of the
  // pages; on a flat one the overhang is zero and the panel is trim size.
  const panelW = preset.trimWidthIn + spec.overhangHIn;
  const panelH = preset.trimHeightIn + spec.overhangVIn;
  return {
    sheetWidthIn: panelW * 2 + spine + wrap * 2,
    sheetHeightIn: panelH + wrap * 2,
    spineWidthIn: spine,
    panelWidthIn: panelW,
    panelHeightIn: panelH,
    wrapAllowanceIn: wrap,
    wrapAllowanceYIn: wrap,
    frontPanelOffsetIn: wrap + panelW + spine,
  };
}

/**
 * The wrap a print service has ASKED for, rather than the one we would derive.
 *
 * Every number above is an estimate standing in for facts only the printer has:
 * the caliper of the exact stock, the thickness of their boards, how much
 * material their case binder folds over. Ours were wrong twice in a row on a
 * real order — a coil wrap at 17.44in against a required 19.25in — because the
 * book was going somewhere with different numbers, and no amount of tuning our
 * constants fixes that in general. Lulu prints the answer on the upload page.
 * Blurb prints it too. So when the cook has that in front of them, it wins.
 *
 * The panels stay at the book's trim, because that is what the interior was
 * drawn at and the cover has to agree with it. What the stated sheet decides is
 * the spine between them and the material around them, both derived here by
 * subtraction so the three panels tile the quoted sheet exactly.
 *
 * Allowances are floored at zero: a sheet too small to hold two trim panels and
 * the spine is a typo, and negative padding would silently overlap the panels
 * rather than show that something is wrong.
 */
export function coverWrapGeometryFromSheet(
  preset: CookbookPreset,
  sheet: { widthIn: number; heightIn: number; spineWidthIn: number },
): CoverWrapGeometry {
  const spine = Math.max(0, sheet.spineWidthIn);
  const wrapX = Math.max(0, (sheet.widthIn - preset.trimWidthIn * 2 - spine) / 2);
  const wrapY = Math.max(0, (sheet.heightIn - preset.trimHeightIn) / 2);
  return {
    sheetWidthIn: sheet.widthIn,
    sheetHeightIn: sheet.heightIn,
    spineWidthIn: spine,
    panelWidthIn: preset.trimWidthIn,
    panelHeightIn: preset.trimHeightIn,
    wrapAllowanceIn: wrapX,
    wrapAllowanceYIn: wrapY,
    frontPanelOffsetIn: wrapX + preset.trimWidthIn + spine,
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
