/**
 * Recipe cards as pictures, for the dev renderer.
 *
 * The same page the PDF is printed from, photographed in print media so the
 * workspace's screen-only rules stay out of it: one picture per card at 4×6,
 * one per page at Full Page, at print resolution. Kept in step with
 * CookPilot's functions-pdf/src/cardImages.ts.
 */

/** 300 dpi against CSS's 96: a letter page is 2550×3300, a 4×6 card 1800×1200. */
const IMAGE_SCALE = 300 / 96;
const JPG_QUALITY = 92;

/** @returns {Promise<Buffer[]>} one image per card or page, in print order */
export async function captureCardImages(page, payload, output) {
  await page.emulateMediaType("print");
  await page.setViewport({ width: 816, height: 1056, deviceScaleFactor: IMAGE_SCALE });
  // A 4×6 sheet holds two cards, and nobody wants the sheet as a picture.
  const perCard = payload?.project?.settings?.cardSize === "card-6x4";
  const selector = perCard
    ? ".recipe-card-page .recipe-card:not(.recipe-card--blank)"
    : ".recipe-card-page";
  const targets = await page.$$(selector);
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
