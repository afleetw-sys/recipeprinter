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
  cardsPerSheet?: number;
}

export function readPrintSettings(): StoredPrintSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredPrintSettings) : null;
  } catch {
    return null;
  }
}

export function writePrintSettings(settings: Required<StoredPrintSettings>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRINT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage may be unavailable (private mode); settings stay in memory */
  }
}
