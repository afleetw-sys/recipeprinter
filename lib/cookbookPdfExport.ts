"use client";

import { getCookbookPreset, type CookbookPreset } from "@/lib/cookbookPresets";
import {
  COVER_WRAP_ENABLED,
  coverWrapGeometry,
  coverWrapGeometryFromSheet,
} from "@/lib/coverWrap";
import type { CoverSheetSpec, ExportMode } from "@/types/export";
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
  /** The export was refused because we can't confirm who's asking. The caller
      offers a sign-in button rather than showing this as a plain failure —
      buying while signed out is supported, so this is a real customer with a
      real purchase that currently exists only in their browser. */
  readonly needsAuth: boolean;
  /** True when there was no session at all (offer "Create free account"), false
      when there was one and it didn't hold up (offer "Sign in"). */
  readonly needsAccount: boolean;

  constructor(message: string, options: { needsAuth?: boolean; needsAccount?: boolean } = {}) {
    super(message);
    this.name = "CookbookPdfError";
    this.needsAuth = options.needsAuth ?? false;
    this.needsAccount = options.needsAccount ?? false;
  }
}

/**
 * The signed-in caller's Firebase ID token, if there is one.
 *
 * The export route verifies this against Google and then reads the unlock
 * document as that user, so a browser that merely claims to have paid gets
 * nothing. Loaded lazily: `lib/cookbookPdfExport` is reachable from the print
 * page, and pulling `firebase/auth` eagerly is what put the auth SDK on pages
 * that had no account on them.
 */
async function currentIdToken(): Promise<string | null> {
  try {
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const user = getFirebaseAuth().currentUser;
    return user ? await user.getIdToken() : null;
  } catch {
    // No Firebase configured, or no session to read. The route answers with the
    // sign-in prompt, which is the right thing to show either way.
    return null;
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
  /** The wrap the printer asked for, passed through so the page can lay its
      panels out against the same numbers the sheet is cut to. */
  coverSheet?: CoverSheetSpec;
}

/**
 * The book with its contents taken out, for the cover-wrap render.
 *
 * A wrap is three panels — back, spine, front — and `CoverWrapDocument` reads
 * nothing but `cover`, `backCover` and `settings.template`. It short-circuits
 * before the layout pipeline entirely, so not one recipe is ever drawn. Sending
 * the whole book anyway meant a hardcover uploaded every recipe TWICE, over two
 * hops each time (browser → this app's function → the renderer), to draw a
 * cover we had already sent once.
 *
 * Subtractive rather than an allowlist, deliberately. Listing the fields the
 * wrap needs would silently drop the next one somebody adds to it; removing the
 * three fields that hold the recipes cannot, because everything else still
 * travels. `sections` is the book, `itemPlacements` is per-recipe layout, and
 * `stashedCookbook` is an entire second book kept beside the first.
 */
export function coverWrapProject(project: PrintProject): PrintProject {
  return { ...project, sections: [], itemPlacements: undefined, stashedCookbook: undefined };
}

async function renderPdf(request: RenderRequest): Promise<Blob> {
  const idToken = await currentIdToken();
  const response = await fetch("/api/cookbook-pdf", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const body = await response
      .json()
      .then((parsed: { error?: string; needsAuth?: boolean; needsAccount?: boolean }) => parsed)
      .catch(() => ({}) as { error?: string; needsAuth?: boolean; needsAccount?: boolean });
    throw new CookbookPdfError(body.error ?? "The cookbook couldn't be exported.", {
      needsAuth: Boolean(body.needsAuth),
      needsAccount: Boolean(body.needsAccount),
    });
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
    // A minute, not a tick.
    //
    // Revoking synchronously races the browser's own read of the blob, which
    // was known, and a next-tick timeout was the fix. It is not enough. A
    // click only STARTS a download; Chrome then streams the blob out to disk,
    // and a cookbook is several megabytes, so the read is still running long
    // after the tick that scheduled this. Revoke underneath it and the transfer
    // stops where it is — which is the `Unconfirmed NNNNNN.crdownload` left in
    // the downloads folder next to the file that did survive.
    //
    // Nothing is leaked by waiting: the URL is dropped either way, just after
    // the browser has finished with it rather than during.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

/**
 * A copy of the book with every browser-local image uploaded, or the book
 * unchanged when there weren't any (the normal case, and a no-op that costs
 * one pass over the sections).
 *
 * `lib/photoStorage` is loaded lazily for the same reason the auth token above
 * is: it pulls in Firebase Storage, and the export is reachable from a page
 * that may never need it.
 */
async function materializeBookPhotos(project: PrintProject): Promise<PrintProject> {
  try {
    const { materializeProjectPhotos } = await import("@/lib/photoStorage");
    const materialized = await materializeProjectPhotos({
      sections: project.sections,
      cover: project.cover,
      backCover: project.backCover,
      itemPlacements: project.itemPlacements,
    });
    return { ...project, ...materialized };
  } catch (error) {
    // An upload that fails shouldn't cost the cook the whole export — the book
    // still renders, just without whichever photo couldn't be sent ahead.
    console.warn("RecipePrinter: could not upload local photos before export", error);
    return project;
  }
}

export async function downloadCookbookPdf(
  book: PrintProject,
  preset: CookbookPresetId,
  fileName: string,
  /**
   * The cover dimensions the print service stated, when the cook has them.
   *
   * Everything we would compute instead is an estimate of facts only the
   * printer holds — their stock's caliper, their boards, their fold-over — and
   * a wrap that is a quarter inch out is rejected on upload rather than
   * printed slightly wrong. When these are supplied they are used verbatim.
   */
  coverSheet?: CoverSheetSpec,
  /** Returns the files that were saved, in download order — the interior first,
      then the cover wrap where there is one. The caller shows them by name on
      the screen after, because "upload the interior, then the cover" is only
      actionable if it says which file is which. */
): Promise<string[]> {
  const resolved = getCookbookPreset(preset);
  // The renderer is on the server, so every image in the book has to be a URL
  // it can fetch. A photo the browser is still holding locally (a Paprika
  // import that hasn't been saved yet) is a `blob:` URL that means nothing
  // outside this document — it goes to Storage now, on its way out. Saving a
  // project runs the same sweep; a book exported without an intervening save
  // would otherwise print with holes where its photos are.
  const project = await materializeBookPhotos(book);
  const interior = await renderPdf({ project, preset });
  saveBlob(interior, fileName);

  // A case-bound hardcover needs a SECOND file: the cover wrap. Print-on-demand
  // services reject a cover bound into the interior, and the wrap is a
  // different size from the pages, so it cannot be one render. A spiral book
  // has no spine to wrap, so it stays a single file.
  if (!COVER_WRAP_ENABLED || !resolved.wrapRequired) return [fileName];

  // Page count drives the spine's thickness, and the interior render is what
  // actually knows it — so it is read back off the file we just made rather
  // than re-derived from the project and risking disagreement with the book.
  const pageCount = await pdfPageCount(interior);
  const geometry = coverSheet
    ? coverWrapGeometryFromSheet(resolved, coverSheet)
    : coverWrapGeometry(resolved, pageCount);
  const wrap = await renderPdf({
    // The cover, not the book — see `coverWrapProject`. The page count the
    // spine is sized from was already read off the interior above, so nothing
    // here needs the recipes.
    project: coverWrapProject(project),
    preset,
    mode: "cover-wrap",
    pageCount,
    coverSheet,
    sheet: { widthIn: geometry.sheetWidthIn, heightIn: geometry.sheetHeightIn },
  });
  const wrapName = coverWrapFileName(project.cover?.title, preset);
  saveBlob(wrap, wrapName);
  return [fileName, wrapName];
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
