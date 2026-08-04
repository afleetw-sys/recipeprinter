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
  /** Named `@page` rule that sets this preset's physical sheet size. */
  pageName: string;
  /** Class placed on `.recipe-print-preview` so the `page:` binding + geometry
      rules for this preset apply (see app/print/print.css). */
  pageClass: string;
  /** Ordered print-shop recommendations for this format (keys into PRINTERS). */
  printerIds: string[];
}

export const PRINTERS: Record<string, PrinterOption> = {
  lulu: { id: "lulu", name: "Lulu", note: "Best for hardcover", url: "https://www.lulu.com/" },
  blurb: { id: "blurb", name: "Blurb", note: "Premium quality", url: "https://www.blurb.com/" },
  staples: {
    id: "staples",
    name: "Staples",
    note: "Spiral & binder / budget",
    url: "https://www.staples.com/services/printing/",
  },
};

export const COOKBOOK_PRESETS: CookbookPreset[] = [
  {
    id: "us-letter",
    productName: "Spiral Cookbook",
    trimLabel: "US Letter (8.5 × 11 in)",
    bestFor: "Best for home kitchens",
    trimWidthIn: 8.5,
    trimHeightIn: 11,
    bleedIn: 0,
    marginIn: 0.5,
    gutterIn: 0.375,
    pageName: "rp-preset-us-letter",
    pageClass: "rp-page-us-letter",
    printerIds: ["staples", "lulu", "blurb"],
  },
  {
    id: "hardcover-8x10",
    productName: "Hardcover Book",
    trimLabel: "8 × 10 in",
    bestFor: "Best for gifts",
    trimWidthIn: 8,
    trimHeightIn: 10,
    bleedIn: 0.125,
    marginIn: 0.5,
    gutterIn: 0.5,
    pageName: "rp-preset-hardcover-8x10",
    pageClass: "rp-page-hardcover-8x10",
    printerIds: ["lulu", "blurb", "staples"],
  },
];

/** The preset applied when a cookbook hasn't chosen one — closest to today's
    Letter behavior, zero bleed. */
export const DEFAULT_COOKBOOK_PRESET_ID: CookbookPresetId = "us-letter";

const PRESETS_BY_ID = new Map(COOKBOOK_PRESETS.map((preset) => [preset.id, preset] as const));

export function isCookbookPresetId(value: string | null | undefined): value is CookbookPresetId {
  return value != null && PRESETS_BY_ID.has(value as CookbookPresetId);
}

/** Resolves an id (possibly undefined / stale) to a preset, falling back to the
    default so callers never have to null-check. */
export function getCookbookPreset(id: CookbookPresetId | undefined): CookbookPreset {
  return (id && PRESETS_BY_ID.get(id)) || PRESETS_BY_ID.get(DEFAULT_COOKBOOK_PRESET_ID)!;
}

/** The physical sheet (trim + 2·bleed) in CSS px, used to size the on-screen
    preview so it matches the printed page. */
export function presetSheetDims(preset: CookbookPreset): { w: number; h: number } {
  const w = (preset.trimWidthIn + preset.bleedIn * 2) * PX_PER_IN;
  const h = (preset.trimHeightIn + preset.bleedIn * 2) * PX_PER_IN;
  return { w, h };
}

/** Scale that fits the Letter card into this preset's SAFE box (used for
    text-dominant pages — recipes, TOC, dividers). `min` so it fits on both
    axes; the shorter axis letterboxes rather than clipping. */
export function presetCardScale(preset: CookbookPreset): number {
  const safeWidth = preset.trimWidthIn - preset.marginIn * 2 - preset.gutterIn;
  const safeHeight = preset.trimHeightIn - preset.marginIn * 2;
  return Math.min(safeWidth / LETTER_CARD_WIDTH_IN, safeHeight / LETTER_CARD_HEIGHT_IN);
}

/** Scale that fills this preset's SHEET box (used for art-dominant pages —
    covers and full-page photos) so artwork bleeds to the physical edge. `max`
    so it covers both axes; overflow is cropped by `overflow: hidden`. */
export function presetArtScale(preset: CookbookPreset): number {
  const sheetWidth = preset.trimWidthIn + preset.bleedIn * 2;
  const sheetHeight = preset.trimHeightIn + preset.bleedIn * 2;
  return Math.max(sheetWidth / LETTER_CARD_WIDTH_IN, sheetHeight / LETTER_CARD_HEIGHT_IN);
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
