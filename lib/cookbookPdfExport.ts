"use client";

import { getCookbookPreset, type CookbookPreset } from "@/lib/cookbookPresets";
import { COVER_WRAP_ENABLED, coverWrapGeometry } from "@/lib/coverWrap";
import type { ExportMode } from "@/types/export";
import type { CookbookPresetId, PrintProject } from "@/types/recipe";

/**
 * Downloads a cookbook as a finished PDF.
 *
 * The whole point of this path is that nobody sees a print dialog. `window.
 * print()` always opens one and no browser lets a page choose "Save as PDF"
 * for someone, so the export used to be an instruction ("choose Save as PDF, and
 * whatever you do don't send it to a printer") that people could simply not
 * follow — and a cookbook sent to a desktop printer comes out rescaled on every
 * page, because the design bleeds to the sheet edge and printers reserve an
 * unprintable margin. Rendering server-side removes the choice, and with it the
 * failure.
 */
export class CookbookPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CookbookPdfError";
  }
}

/** One render request. `sheet` overrides the preset's fixed size, which is how
    a cover wrap (whose width depends on page count) gets rendered at all. */
interface RenderRequest {
  project: PrintProject;
  preset: CookbookPresetId;
  mode?: ExportMode;
  pageCount?: number;
  sheet?: { widthIn: number; heightIn: number };
}

async function renderPdf(request: RenderRequest): Promise<Blob> {
  const response = await fetch("/api/cookbook-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);
    throw new CookbookPdfError(detail ?? "The cookbook couldn't be exported.");
  }
  return response.blob();
}

function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Freed on the next tick, not immediately: revoking synchronously can race
    // the browser's own read of the blob and produce an empty download.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function downloadCookbookPdf(
  project: PrintProject,
  preset: CookbookPresetId,
  fileName: string,
): Promise<void> {
  const resolved = getCookbookPreset(preset);
  const interior = await renderPdf({ project, preset });
  saveBlob(interior, fileName);

  // A case-bound hardcover needs a SECOND file: the cover wrap. Print-on-demand
  // services reject a cover bound into the interior, and the wrap is a
  // different size from the pages, so it cannot be one render. A spiral book
  // has no spine to wrap, so it stays a single file.
  if (!COVER_WRAP_ENABLED || !resolved.wrapRequired) return;

  // Page count drives the spine's thickness, and the interior render is what
  // actually knows it — so it is read back off the file we just made rather
  // than re-derived from the project and risking disagreement with the book.
  const pageCount = await pdfPageCount(interior);
  const geometry = coverWrapGeometry(resolved, pageCount);
  const wrap = await renderPdf({
    project,
    preset,
    mode: "cover-wrap",
    pageCount,
    sheet: { widthIn: geometry.sheetWidthIn, heightIn: geometry.sheetHeightIn },
  });
  saveBlob(wrap, coverWrapFileName(project.cover?.title, preset));
}

/**
 * Pages in a rendered PDF, counted from the file itself.
 *
 * Deliberately a byte scan rather than a PDF library: this runs in the browser
 * on a file that is already several MB, and the only fact needed is how many
 * `/Type /Page` objects it contains. Pulling in a parser to learn one integer
 * would cost every visitor the bundle.
 *
 * Falls back to 0 on anything unexpected, which yields a spine of just the
 * board thickness — a visibly-too-thin spine the cook can report, rather than a
 * confidently wrong one that only shows up on a printed book.
 */
async function pdfPageCount(blob: Blob): Promise<number> {
  try {
    const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    const counts = Array.from(text.match(/\/Count\s+\d+/g) ?? [], (m) =>
      Number(m.replace(/\D+/g, "")),
    );
    if (counts.length > 0) return Math.max(...counts);
    return (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  } catch {
    return 0;
  }
}

/**
 * A filename someone can find later — the book's own name, plus which format
 * it is.
 *
 * Every format is included with the purchase, so a cook can reasonably export
 * the same book as both. Without the format in the name the second download
 * lands as "Our-Favorite-Recipes (1).pdf", and the one thing that actually
 * distinguishes the two files — the physical book they produce — is the one
 * thing you can't tell without opening them.
 */
export function cookbookPdfFileName(
  title: string | undefined,
  preset: CookbookPresetId,
): string {
  const base = (title ?? "").trim() || "Cookbook";
  const safe = slugPart(base) || "Cookbook";
  const resolved = getCookbookPreset(preset);
  const format = slugPart(resolved.fileLabel);
  return `${safe}-${format}-${trimSizeLabel(resolved)}.pdf`;
}

/** The cover wrap's filename, kept distinct from the interior's so the two
    downloads can't be confused at the print shop's upload form. */
export function coverWrapFileName(
  title: string | undefined,
  preset: CookbookPresetId,
): string {
  return cookbookPdfFileName(title, preset).replace(/\.pdf$/, "-Cover.pdf");
}

/**
 * The book's physical page size, for the filename — "8.5x11", "8x10".
 *
 * A print shop's upload form asks what size the file is before it will accept
 * it, and the answer is not recoverable from "Our-Favorite-Recipes-Spiral.pdf"
 * without opening the file and checking its page setup. Putting the trim in the
 * name means the answer is on screen at the moment it's asked for.
 *
 * Trailing ".0" is dropped so a whole-inch trim reads "8x10", not "8.0x10.0".
 */
export function trimSizeLabel(preset: CookbookPreset): string {
  const dim = (inches: number) => String(Number(inches.toFixed(2)));
  return `${dim(preset.trimWidthIn)}x${dim(preset.trimHeightIn)}`;
}

function slugPart(value: string): string {
  return value
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
}
