/**
 * Inspect an exported cookbook PDF: page size, and whether photos actually
 * made it in.
 *
 * Two failures this catches, both of which look fine locally and only show up
 * at the print shop:
 *
 *  - A page whose whole surface is ONE image at page size means the page was
 *    rasterized rather than drawn as vector. Text on such a page is pixels, and
 *    scales badly. (A CSS `filter` anywhere in the page is the usual cause —
 *    Chrome cannot express one in vector PDF and flattens the whole stacking
 *    context to a bitmap.)
 *  - Zero images across a book that should have photos means the renderer never
 *    loaded them. The export deliberately does not block on a failed image
 *    (`image.decode().catch(...)` in app/export/page.tsx), so an unreachable
 *    photo URL yields a complete-looking book with no pictures and no error.
 *
 * Usage:  node scripts/inspect-cookbook-pdf.mjs <file.pdf>
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/inspect-cookbook-pdf.mjs <file.pdf>");
  process.exit(1);
}

const buf = readFileSync(path);
const raw = buf.toString("latin1");

// Page boxes. Parsed straight out of the file rather than with a PDF library so
// this stays dependency-free and runnable anywhere the repo is checked out.
const boxes = [...raw.matchAll(/\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*\]/g)]
  .map((m) => [Number(m[3]) - Number(m[1]), Number(m[4]) - Number(m[2])]);

const sizes = new Map();
for (const [w, h] of boxes) {
  const key = `${(w / 72).toFixed(4)} x ${(h / 72).toFixed(4)} in  (${w} x ${h} pt)`;
  sizes.set(key, (sizes.get(key) ?? 0) + 1);
}

console.log(`file: ${path}`);
console.log(`size: ${(buf.length / 1_000_000).toFixed(1)} MB`);
console.log(`\npage boxes found: ${boxes.length}`);
for (const [key, count] of sizes) console.log(`  ${count} page(s): ${key}`);

// Image XObjects, with pixel dimensions.
const images = [...raw.matchAll(/\/Subtype\s*\/Image[\s\S]{0,400}?\/Width\s+(\d+)[\s\S]{0,400}?\/Height\s+(\d+)/g)]
  .map((m) => [Number(m[1]), Number(m[2])]);
const alt = [...raw.matchAll(/\/Width\s+(\d+)[\s\S]{0,400}?\/Height\s+(\d+)[\s\S]{0,400}?\/Subtype\s*\/Image/g)]
  .map((m) => [Number(m[1]), Number(m[2])]);
const all = images.length >= alt.length ? images : alt;

console.log(`\nembedded images: ${all.length}`);
if (all.length === 0) {
  console.log("  *** NONE. If this book has photos, they never loaded during render.");
  console.log("      Check that the photo URLs are fetchable by the RENDERER, not just your browser.");
} else {
  const counts = new Map();
  for (const [w, h] of all) {
    const key = `${w}x${h}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, n] of [...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    const [w, h] = key.split("x").map(Number);
    const pageish = boxes.some(([pw, ph]) =>
      Math.abs(w / (pw / 72) - 300) < 40 && Math.abs(h / (ph / 72) - 300) < 40);
    console.log(`  ${n}x  ${key} px${pageish ? "   <-- PAGE-SIZED RASTER (page was flattened)" : ""}`);
  }
}
