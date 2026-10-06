/**
 * The photo a photo import is reading, so its placeholder can show the photo
 * itself instead of a file name ("Reading IMG_2041.jpg…").
 *
 * In memory only, keyed by queue item id, and only for as long as the parse
 * runs: nothing is uploaded or saved, and an import that survives a reload
 * simply falls back to the label. The photo is the first one chosen, which is
 * the page a multi-photo recipe starts on.
 */
const previews = new Map<string, string>();

export function setImportPreview(itemId: string, source: Blob | string): void {
  releaseImportPreview(itemId);
  previews.set(itemId, typeof source === "string" ? source : URL.createObjectURL(source));
}

export function importPreview(itemId: string): string | undefined {
  return previews.get(itemId);
}

export function releaseImportPreview(itemId: string): void {
  const url = previews.get(itemId);
  if (!url) return;
  previews.delete(itemId);
  if (url.startsWith("blob:")) URL.revokeObjectURL(url);
}
