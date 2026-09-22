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
async function currentIdToken(forceRefresh = false): Promise<string | null> {
  try {
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const user = getFirebaseAuth().currentUser;
    return user ? await user.getIdToken(forceRefresh) : null;
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
  photoFinish?: "standard" | "edge";
  pageCount?: number;
  sheet?: { widthIn: number; heightIn: number };
  /** The wrap the printer asked for, passed through so the page can lay its
      panels out against the same numbers the sheet is cut to. */
  coverSheet?: CoverSheetSpec;
  /** What the cook will actually see in their downloads folder. The renderer
      sets this as the finished file's Content-Disposition — the HTML anchor
      `download` attribute a browser would otherwise use is not reliably
      honored cross-origin (Storage's domain, not this app's), which is
      exactly where the file now lives. See exportStorage.ts in CookPilot. */
  fileName?: string;
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

async function postRender(request: RenderRequest, idToken: string | null): Promise<Response> {
  return fetch("/api/cookbook-pdf", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify(request),
  });
}

type ErrorBody = { error?: string; needsAuth?: boolean; needsAccount?: boolean };

interface RenderedPdf {
  downloadUrl: string;
  pageCount: number;
}

export type CookbookPdfProgress = "preparing" | "rendering-pages" | "rendering-cover";

async function renderPdf(request: RenderRequest): Promise<RenderedPdf> {
  const idToken = await currentIdToken();
  let response = await postRender(request, idToken);
  let body: ErrorBody = {};

  // A token the server turned away is often just a stale one. Get a fresh one
  // and ask once more before telling anybody anything about their account.
  if (response.status === 401 && idToken) {
    const refreshed = await currentIdToken(true);
    if (refreshed) response = await postRender(request, refreshed);
  }

  if (!response.ok) {
    body = await response.json().catch(() => ({}) as ErrorBody);
    // Someone who IS signed in and still gets "sign in again" has been handed a
    // button that opens nothing (the sign-in dialog only exists while nobody is
    // signed in). Say what will actually help instead.
    if (response.status === 401 && idToken) {
      throw new CookbookPdfError(
        "We couldn't confirm your sign-in. Sign out from the account menu, sign back in, and try again.",
        { needsAuth: false, needsAccount: false },
      );
    }
    throw new CookbookPdfError(body.error ?? "The cookbook couldn't be exported.", {
      needsAuth: Boolean(body.needsAuth),
      needsAccount: Boolean(body.needsAccount),
    });
  }

  // The route no longer hands back the PDF itself — a large hardcover
  // interior can run well past what a single HTTP response is allowed to
  // carry (a real 288-page book came out at 490MB), a ceiling neither this
  // app nor the renderer can configure away. Instead it's a Storage URL. This
  // used to be fetched right here into a Blob — but that meant buffering the
  // WHOLE file in this tab's memory with no progress feedback at all before
  // anything could start, which is worse than the wall it was working around:
  // a real download button hands the transfer to the browser's own download
  // manager, streamed straight to disk, with a real progress bar, for a file
  // that can run past what most memory-buffered approaches handle gracefully
  // anyway. See `triggerDownload` below and downloadPreparedFile.
  const success = (await response.json().catch(() => null)) as
    | {downloadUrl?: unknown; pageCount?: unknown}
    | null;
  const downloadUrl = success?.downloadUrl;
  const pageCount = success?.pageCount;
  if (
    typeof downloadUrl !== "string" ||
    !downloadUrl ||
    typeof pageCount !== "number" ||
    !Number.isSafeInteger(pageCount) ||
    pageCount < 1
  ) {
    throw new CookbookPdfError("The cookbook renderer returned an invalid response. Try again in a moment.");
  }
  return {downloadUrl, pageCount};
}

/** Starts a real browser download — the download manager's own, streamed
    straight to disk, not a Blob buffered in this tab's memory first. The
    `download` attribute is a same-origin nicety only; the filename that
    actually lands (cross-origin, which Storage always is here) comes from
    the object's own Content-Disposition, set server-side at upload time —
    see the `fileName` field on RenderRequest and exportStorage.ts. */
function triggerDownload(url: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export interface PreparedPdfFile {
  name: string;
  downloadUrl: string;
  role: "pages" | "cover";
}

/** The one call every download button in the UI makes — no zip, no bundling.
    Two files (a hardcover's interior and cover) are now two separate,
    cook-initiated clicks rather than one script firing two downloads at
    once, which is what the zip step existed to work around in the first
    place (browsers block an unsolicited SECOND automatic download; they do
    not block two the cook actually clicked for). */
export function downloadPreparedFile(file: PreparedPdfFile): void {
  triggerDownload(file.downloadUrl, file.name);
}

export interface PreparedCookbookPages {
  project: PrintProject;
  preset: CookbookPresetId;
  file: PreparedPdfFile;
  pageCount: number;
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
    const { collectProjectPhotoUrls, materializeProjectPhotos } = await import("@/lib/photoStorage");
    // The renderer is on a server and fetches every image by URL, so a chapter
    // collage or a hero's photo history left holding `blob:` strings renders as
    // a hole in the printed book. Same field list as the save — see
    // `materializeProjectPhotos`.
    const { photos } = await materializeProjectPhotos({
      sections: project.sections,
      cover: project.cover,
      backCover: project.backCover,
      dedication: project.dedication,
      itemPlacements: project.itemPlacements,
      // The cover-wrap render strips this out again (`coverWrapProject`), but
      // the interior carries it, and an export is a document like any other.
      stashedCookbook: project.stashedCookbook,
    });
    // `uploadedRecipeImages` is dropped here on purpose: an export has no queue
    // to point back at, and the save path is what owns that. A book exported
    // without an intervening save pays one upload; the next save settles it.
    const materialized = { ...project, ...photos };
    await assertExportPhotosAreRemote(materialized, collectProjectPhotoUrls);
    return materialized;
  } catch (error) {
    console.warn("RecipePrinter: could not upload local photos before export", error);
    if (error instanceof CookbookPdfError) throw error;
    throw new CookbookPdfError(
      "We couldn't prepare your photos for export. Check your connection and try again.",
    );
  }
}

/** Exported for the narrow regression test: server-side rendering cannot ever
    resolve a browser-local URL, so this is an explicit precondition rather than
    something left for Chromium to discover after an expensive request. */
export async function assertExportPhotosAreRemote(
  project: PrintProject,
  collect: (project: PrintProject) => Promise<string[]> = async (value) => {
    const { collectProjectPhotoUrls } = await import("@/lib/photoStorage");
    return collectProjectPhotoUrls(value);
  },
): Promise<void> {
  const localPhotos = (await collect(project)).filter((url) => /^(?:blob:|data:)/i.test(url));
  if (localPhotos.length > 0) {
    throw new CookbookPdfError(
      `We couldn't prepare ${localPhotos.length === 1 ? "one photo" : `${localPhotos.length} photos`} for export. Check your connection and try again.`,
    );
  }
}

export async function prepareCookbookPages(
  book: PrintProject,
  preset: CookbookPresetId,
  fileName: string,
  /** Real client-observable milestones only. The renderer does not stream its
      internal layout work, so the UI must not invent finer-grained progress. */
  onProgress?: (progress: CookbookPdfProgress) => void,
  photoFinish: "standard" | "edge" = "standard",
): Promise<PreparedCookbookPages> {
  onProgress?.("preparing");
  // The renderer is on the server, so every image in the book has to be a URL
  // it can fetch. A photo the browser is still holding locally (a Paprika
  // import that hasn't been saved yet) is a `blob:` URL that means nothing
  // outside this document — it goes to Storage now, on its way out. Saving a
  // project runs the same sweep; a book exported without an intervening save
  // would otherwise print with holes where its photos are.
  const project = await materializeBookPhotos(book);
  onProgress?.("rendering-pages");
  const interior = await renderPdf({ project, preset, fileName, photoFinish });
  return {
    project,
    preset,
    file: { name: fileName, downloadUrl: interior.downloadUrl, role: "pages" },
    pageCount: interior.pageCount,
  };
}

export async function prepareCookbookCover(
  pages: PreparedCookbookPages,
  coverSheet?: CoverSheetSpec,
  onProgress?: (progress: CookbookPdfProgress) => void,
): Promise<PreparedPdfFile | null> {
  const resolved = getCookbookPreset(pages.preset);
  if (!COVER_WRAP_ENABLED || !resolved.wrapRequired) return null;
  // Page count drives the spine's thickness, and the renderer is what actually
  // knows it. It validates the PDF page tree against the laid-out sheets, then
  // returns that authoritative count beside the file; the browser never has to
  // decode a potentially 90MB PDF into a string just to rediscover one number.
  const pageCount = pages.pageCount;
  const geometry = coverSheet
    ? coverWrapGeometryFromSheet(resolved, coverSheet)
    : coverWrapGeometry(resolved, pageCount);
  // The pages download has its own button now — this no longer has to race
  // it, so this transition is just "the cover render started."
  onProgress?.("rendering-cover");
  const fileName = coverWrapFileName(pages.project.cover?.title, pages.preset);
  const wrap = await renderPdf({
    // The cover, not the book — see `coverWrapProject`. The page count the
    // spine is sized from was already read off the interior above, so nothing
    // here needs the recipes.
    project: coverWrapProject(pages.project),
    preset: pages.preset,
    mode: "cover-wrap",
    pageCount,
    coverSheet,
    sheet: { widthIn: geometry.sheetWidthIn, heightIn: geometry.sheetHeightIn },
    fileName,
  });
  return {
    name: fileName,
    downloadUrl: wrap.downloadUrl,
    role: "cover",
  };
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
