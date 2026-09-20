import { localStore } from "@/lib/storage";

// Whether the cook has already seen the post-print dialog on this device. The
// answer to "have we shown it?" defaults to NO when storage is unreadable (see
// lib/storage), so a cook in a browser that blocks site data sees it every time
// rather than never. Moved here from app/print/page.tsx unchanged.
export const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:post-print-dialog:last-shown:v1";

export function shouldShowPostPrintDialog() {
  return localStore.get(POST_PRINT_DIALOG_STORAGE_KEY) === null;
}

export function markPostPrintDialogShown() {
  localStore.set(POST_PRINT_DIALOG_STORAGE_KEY, "1");
}
