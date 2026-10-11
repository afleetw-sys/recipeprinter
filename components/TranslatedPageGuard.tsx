"use client";

import { installTranslatedPageGuard } from "@/lib/translatedPageGuard";

// At module load, not in an effect: it has to be in place before React's first
// update to a page the translator has already been through.
if (typeof window !== "undefined") installTranslatedPageGuard();

/** Mounts `installTranslatedPageGuard` for every page. Renders nothing. */
export function TranslatedPageGuard() {
  return null;
}
