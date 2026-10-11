/**
 * Recipe cards as pictures, for the dev renderer.
 *
 * The same page the PDF is printed from, photographed in print media so the
 * workspace's screen-only rules stay out of it: one picture per card, without
 * the sheet's print margin, at print resolution. Kept in step with
 * CookPilot's functions-pdf/src/cardImages.ts.
 */

/** 300 dpi against CSS's 96: a letter page is 2550×3300, a 4×6 card 1800×1200. */
const IMAGE_SCALE = 300 / 96;
const JPG_QUALITY = 92;

/** @returns {Promise<Buffer[]>} one image per card or page, in print order */
export async function captureCardImages(page, output) {
  await page.emulateMediaType("print");
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: IMAGE_SCALE });
  // The card itself, not the sheet it prints on: the sheet's margin is there
  // for a printer's unprintable edge, and a picture has no such edge. At 4×6
  // it also means one picture per card rather than two cards on a sheet.
  const cards = await page.$$(".recipe-card-page .recipe-card:not(.recipe-card--blank)");
  const targets = cards.length > 0 ? cards : await page.$$(".recipe-card-page");
  const images = [];
  for (const target of targets) {
    const shot = await target.screenshot(
      output === "jpg" ? { type: "jpeg", quality: JPG_QUALITY } : { type: "png" },
    );
    images.push(Buffer.from(shot));
  }
  return images;
}

/** "Lemon-Pasta.png" → "Lemon-Pasta-2.png" for the second of several. */
export function numberedName(fileName, index, total) {
  if (total < 2) return fileName;
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName;
  const ext = dot > 0 ? fileName.slice(dot) : "";
  return `${stem}-${index + 1}${ext}`;
}
