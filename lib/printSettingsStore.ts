"use client";

import { localStore } from "@/lib/storage";

/**
 * Where the device's print-layout preferences are kept, and nothing else.
 *
 * Split out of lib/printSettings so a module that only needs to READ the stored
 * settings doesn't have to pull in the validators — those compare against
 * `PRINT_CARD_SIZE_OPTIONS` / `RECIPE_PRINT_TEMPLATE_OPTIONS`, which live in
 * components/RecipeCardPrint, which is the entire ~1,900-line printable-card
 * component tree. lib/localProjects reads these settings while filing a book
 * from the HOMEPAGE, where that tree is otherwise absent from the bundle
 * entirely; importing it there would have put every recipe-card template on the
 * critical path of a page that never draws one.
 *
 * lib/printSettings re-exports everything here, so existing callers are
 * unaffected and there is still one import site for the common case.
 */

// Layout preferences carry over across visits (device-local, no account/sync)
// so going back to add another recipe doesn't reset the print setup. Shared
// with the /print/[slug] loader, which seeds these from a sharedRecipeCards
// doc before handing off to the real /print page.
export const PRINT_SETTINGS_STORAGE_KEY = "recipeprinter:print-settings:v1";

export interface StoredPrintSettings {
  cardSize?: string;
  template?: string;
  doubleSided?: boolean;
  showCutLines?: boolean;
  showPhoto?: boolean;
  showSourceUrl?: boolean;
}

export function readPrintSettings(): StoredPrintSettings | null {
  const parsed = localStore.getJson<StoredPrintSettings>(PRINT_SETTINGS_STORAGE_KEY);
  return parsed && typeof parsed === "object" ? parsed : null;
}

export function writePrintSettings(settings: Required<StoredPrintSettings>) {
  // Survivable if it fails: settings stay correct for this session, they just
  // won't carry over to the next visit.
  localStore.setJson(PRINT_SETTINGS_STORAGE_KEY, settings);
}
