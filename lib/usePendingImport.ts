"use client";

import { useEffect, useRef } from "react";
import { takePendingImport } from "@/lib/pendingImport";
import type { QueueItem } from "@/types/recipe";

/**
 * Finishes an import that was started somewhere else.
 *
 * The SEO landing pages show a single capture input rather than the whole
 * importer, stash whatever was submitted, and hand the visitor to the app
 * mid-import (see components/seo/SeoCapture and lib/pendingImport). This is the
 * other end of that: whoever is the destination calls this once and the import
 * lands as though it had been started there.
 *
 * Lifted out of `PrinterWorkspace` because the destination is changing. It used
 * to be the homepage, which meant a visitor who pasted a link on a landing page
 * arrived at a second importer rather than at their recipe. Now it is the
 * studio, and having one implementation means the move was a change of caller
 * rather than a second copy of the handoff.
 *
 * Waits for the queue to hydrate first, so seeding the pending item cannot race
 * the sessionStorage rehydrate and get overwritten by it. Runs exactly once per
 * mount — `takePendingImport` is consume-and-delete, so even if two surfaces
 * called this only one could win, and a refresh can never re-import.
 */
export function usePendingImport({
  enabled,
  hydrated,
  addUrl,
  addText,
  addImages,
  addCookPilotRecipes,
}: {
  enabled: boolean;
  hydrated: boolean;
  addUrl: (url: string) => void;
  addText: (text: string) => void;
  addImages: (images: string[], label: string) => void;
  addCookPilotRecipes: (recipes: QueueItem[]) => number;
}) {
  const consumedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !hydrated || consumedRef.current) return;
    consumedRef.current = true;
    let cancelled = false;
    void takePendingImport().then((pending) => {
      if (cancelled || !pending) return;
      if (pending.kind === "url") addUrl(pending.url);
      else if (pending.kind === "text") addText(pending.text);
      else if (pending.kind === "cookpilot") addCookPilotRecipes(pending.recipes);
      else if (pending.kind === "images") addImages(pending.images, pending.label);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, hydrated, addUrl, addText, addImages, addCookPilotRecipes]);
}
