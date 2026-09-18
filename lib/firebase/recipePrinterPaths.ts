export const RECIPE_PRINTER_PRODUCT_PATH = ["products", "recipePrinter"] as const;

export function recipePrinterUserPath(uid: string) {
  return [...RECIPE_PRINTER_PRODUCT_PATH, "users", uid] as const;
}

export function recipePrinterProjectsPath(uid: string) {
  return [...recipePrinterUserPath(uid), "printProjects"] as const;
}

export function recipePrinterProjectPath(uid: string, projectId: string) {
  return [...recipePrinterProjectsPath(uid), projectId] as const;
}

export function recipePrinterUnlocksPath(uid: string) {
  return [...recipePrinterUserPath(uid), "cookbookUnlocks"] as const;
}

export function recipePrinterUnlockPath(uid: string, unlockId: string) {
  return [...recipePrinterUnlocksPath(uid), unlockId] as const;
}

export const RECIPE_PRINTER_FEEDBACK_PATH = [
  ...RECIPE_PRINTER_PRODUCT_PATH,
  "feedback",
] as const;

/** "Add yours" on the homepage gallery — see lib/gallerySubmissions. Write-only
    from the browser, same shape as feedback above: reviewing one means opening
    the Firebase console, not reading it back through the client SDK. */
export const RECIPE_PRINTER_GALLERY_SUBMISSIONS_PATH = [
  ...RECIPE_PRINTER_PRODUCT_PATH,
  "gallerySubmissions",
] as const;

export const RECIPE_PRINTER_PHOTO_ROOT = "recipeprinter/photos";
export const RECIPE_PRINTER_DEBUG_ROOT = "recipeprinter/debug/failed-imports";
export const RECIPE_PRINTER_GALLERY_SUBMISSIONS_STORAGE_ROOT =
  "recipeprinter/gallery-submissions";

export function recipePrinterUserPhotoRoot(uid: string) {
  return `${RECIPE_PRINTER_PHOTO_ROOT}/users/${uid}`;
}

export function recipePrinterAnonymousPhotoRoot(anonymousOwnerId: string) {
  return `${RECIPE_PRINTER_PHOTO_ROOT}/anonymous/${anonymousOwnerId}`;
}
