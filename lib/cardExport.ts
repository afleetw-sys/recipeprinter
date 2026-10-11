"use client";

import type { ProLockReason } from "@/lib/recipePrinterPurchases";
import type { ExportOutput } from "@/types/export";
import type { PrintProject } from "@/types/recipe";

/**
 * Downloads recipe cards as a file: PDF, PNG or JPG.
 *
 * Rendered on the server from the same `/export` page as a cookbook's PDF, so
 * the file is the preview rather than a second drawing of it (see
 * docs/cookbook-pdf-export.md). Open to everyone; `/api/card-export` applies
 * the same Pro locks a print does, from the caller's own entitlements.
 */

export class CardExportError extends Error {
  /** The server says this deck needs Pro. The print page already checks the
      same locks before asking, so this is the two disagreeing. */
  readonly needsPro: boolean;
  readonly reasons: ProLockReason[];
  readonly status?: number;

  constructor(message: string, options: { status?: number; needsPro?: boolean; reasons?: ProLockReason[] } = {}) {
    super(message);
    this.name = "CardExportError";
    this.status = options.status;
    this.needsPro = options.needsPro ?? false;
    this.reasons = options.reasons ?? [];
  }
}

/** Long edge of a browser-local photo sent inline, and its JPEG quality. A
    card photo prints a few inches wide; this is 300 dpi at over five. */
const INLINE_PHOTO_EDGE = 1600;
const INLINE_PHOTO_QUALITY = 0.85;

/** A browser-local photo as a `data:` URL small enough to travel in the request. */
async function inlinePhoto(url: string): Promise<string> {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const scale = Math.min(1, INLINE_PHOTO_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", INLINE_PHOTO_QUALITY);
}

/**
 * The deck with every photo somewhere the renderer can reach.
 *
 * The renderer is a server: a `blob:` URL means nothing to it. An account's
 * photos go to Storage, as a save would send them. Signed out there is no
 * Storage to send them to (only an account stores a photo), so they travel
 * inside the request, shrunk to what a card can show.
 */
async function withReachablePhotos(project: PrintProject): Promise<PrintProject> {
  const { hasAccountSession, isLocalImage, mapProjectPhotoUrls, materializeProjectPhotos } = await import(
    "@/lib/photoStorage"
  );
  if (hasAccountSession()) {
    const { photos } = await materializeProjectPhotos({
      sections: project.sections,
      itemPlacements: project.itemPlacements,
    });
    return { ...project, ...photos };
  }
  return mapProjectPhotoUrls(project, (url) => (isLocalImage(url) ? inlinePhoto(url) : url));
}

async function accountIdToken(): Promise<string | null> {
  try {
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const user = getFirebaseAuth().currentUser;
    return user && !user.isAnonymous ? await user.getIdToken() : null;
  } catch {
    return null;
  }
}

/** "Lemon-Pasta" from the deck's first recipe, or a plain name for several. */
export function cardExportFileName(project: PrintProject): string {
  const recipes = project.sections.flatMap((section) => section.items).filter((item) => item.recipe);
  if (recipes.length !== 1) return "Recipe cards";
  return recipes[0].recipe?.title?.trim() || "Recipe card";
}

export async function downloadCards({
  project,
  output,
  revenueCatUserId,
}: {
  project: PrintProject;
  output: ExportOutput;
  /** Signed out, a purchase belongs to the browser's anonymous RevenueCat id. */
  revenueCatUserId: string | null;
}): Promise<void> {
  let ready: PrintProject;
  try {
    ready = await withReachablePhotos(project);
  } catch (error) {
    console.warn("RecipePrinter: could not prepare photos for a card download", error);
    throw new CardExportError("We couldn't prepare your photos. Check your connection and try again.");
  }
  const idToken = await accountIdToken();
  const response = await fetch("/api/card-export", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(idToken ? { authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({
      output,
      fileName: cardExportFileName(ready),
      project: ready,
      ...(idToken ? {} : { customerId: revenueCatUserId }),
    }),
  });
  const body = (await response.json().catch(() => null)) as
    | { error?: string; needsPro?: boolean; reasons?: ProLockReason[]; downloadUrl?: string; fileName?: string }
    | null;
  if (!response.ok || !body?.downloadUrl) {
    throw new CardExportError(body?.error ?? "The download couldn't be made. Try again in a moment.", {
      status: response.status,
      needsPro: Boolean(body?.needsPro),
      reasons: body?.reasons,
    });
  }
  // Handed to the browser's own download manager. The name that lands is the
  // file's own Content-Disposition, set by the renderer: `download` is not
  // honoured across origins, and Storage is always another origin.
  const link = document.createElement("a");
  link.href = body.downloadUrl;
  link.download = body.fileName ?? "";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
