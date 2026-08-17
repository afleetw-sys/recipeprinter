"use client";

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

export async function downloadCookbookPdf(
  project: PrintProject,
  preset: CookbookPresetId,
  fileName: string,
): Promise<void> {
  const response = await fetch("/api/cookbook-pdf", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project, preset }),
  });

  if (!response.ok) {
    const detail = await response
      .json()
      .then((body: { error?: string }) => body.error)
      .catch(() => undefined);
    throw new CookbookPdfError(detail ?? "The cookbook couldn't be exported.");
  }

  const blob = await response.blob();
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

/** A filename someone can find later, from the book's own name. */
export function cookbookPdfFileName(title: string | undefined): string {
  const base = (title ?? "").trim() || "Cookbook";
  const safe = base.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60);
  return `${safe || "Cookbook"}.pdf`;
}
