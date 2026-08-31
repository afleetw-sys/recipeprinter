#!/usr/bin/env node
/**
 * Regenerates every derived brand asset from two source files.
 *
 *   npm run logo:build
 *
 * TWO sources, because a tab icon and a logo are not the same picture. The
 * full mark is a printer with produce in its tray: legible on a header, and at
 * 16px a blue rounded blob with something indistinct in the middle. The icon
 * mark drops the printer and keeps the produce — two high-contrast shapes that
 * still read at 16px.
 *
 *   public/images/recipeprinter-logo.png     the full mark. Header, print
 *                                            dialog, OG image, schema.org logo.
 *   public/images/recipeprinter-favicon.png  the icon mark. Everything a
 *                                            browser or an OS shows small.
 *
 * If the icon source is missing the script falls back to the full mark and
 * says so, so this never half-breaks — it just goes back to one picture.
 *
 * Derived, so the copies scattered around the repo cannot drift apart:
 *
 *   app/icon.png                        the <link rel="icon"> Next generates
 *   app/apple-icon.png                  180x180 home-screen icon
 *   public/favicon-16x16.png            declared in app/layout.tsx
 *   public/favicon-32x32.png            declared in app/layout.tsx
 *   public/favicon.ico                  the /favicon.ico browsers ask for
 *   app/opengraph-image-logo-base64.ts  inlined for the OG image renderer
 *
 * Bump the ?v= on the icon URLs in app/layout.tsx whenever the icon mark
 * changes, or nobody who has already visited will ever see it.
 *
 * Rendering is done in headless Chrome rather than with `sips`, for one
 * reason that matters: the mark is not square (420x427), and every icon
 * target except icon.png is. `sips` can resize or pad but not pad with
 * TRANSPARENCY, so a square favicon came out either squashed or on a white
 * box. Chrome composites the source onto a transparent canvas at the exact
 * target size, letterboxed, preserving both the aspect ratio and the alpha.
 *
 * Dev-only: `puppeteer-core` is a devDependency and nothing here ships.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGO_SOURCE = resolve(ROOT, "public/images/recipeprinter-logo.png");
const ICON_SOURCE = resolve(ROOT, "public/images/recipeprinter-favicon.png");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

/** Square icon targets, letterboxed onto a canvas of `background`.
 *
 *  The apple icon is the one that must NOT be transparent: iOS composites a
 *  transparent apple-touch-icon onto black, which would put a navy-and-orange
 *  mark on a black tile. Browser favicons keep their alpha so they sit on
 *  whatever the tab strip is. */
/** Corner rounding for browser favicons, as a fraction of the icon's width.
 *  Nothing masks these — a tab shows exactly the bitmap it is given. */
const ICON_RADIUS = 0.2;

const TARGETS = [
  // NOT rounded, deliberately: iOS applies its own squircle mask to an
  // apple-touch-icon, so a pre-rounded one gets rounded twice and comes out
  // with clipped, lumpy corners.
  { out: "app/apple-icon.png", size: 180, background: "#ffffff", pad: 0.12 },
  { out: "public/favicon-32x32.png", size: 32, background: "transparent", radius: ICON_RADIUS },
  { out: "public/favicon-16x16.png", size: 16, background: "transparent", radius: ICON_RADIUS },
];


/** The non-square one: icon.png keeps the mark's own proportions. */
const ICON_MAX = 168;

async function shoot(
  page,
  dataUri,
  width,
  height,
  objectFit,
  background = "transparent",
  pad = 0,
  radius = 0,
) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  const inset = Math.round(width * pad);
  // The radius goes on a wrapper that CLIPS, not on the image itself: the
  // artwork bleeds to all four edges, so rounding has to cut the corners off
  // the picture rather than round a box drawn behind it.
  const corner = radius ? `${(width * radius).toFixed(2)}px` : "0";
  await page.setContent(
    `<style>
       html,body{margin:0;padding:0;background:transparent}
       .frame{width:${width}px;height:${height}px;overflow:hidden;
              border-radius:${corner};background:${background}}
       img{display:block;
           width:${width - inset * 2}px;height:${height - inset * 2}px;
           margin:${inset}px;object-fit:${objectFit}}
     </style>
     <div class="frame"><img src="${dataUri}"></div>`,
    { waitUntil: "load" },
  );
  // The <img> decoding is what we are actually waiting for; `load` on
  // setContent can resolve before a data: image has painted.
  await page.evaluate(() => {
    const img = document.querySelector("img");
    return img.complete ? null : img.decode();
  });
  // Only when the target actually wants alpha. `omitBackground: true` forces a
  // transparent capture, which would have quietly thrown away the white tile
  // the apple icon is given precisely so iOS doesn't composite it onto black.
  return page.screenshot({ type: "png", omitBackground: background === "transparent" });
}

/**
 * A .ico is a tiny container, and since Vista it may hold PNG payloads
 * verbatim rather than BMP — which is what the existing favicon.ico already
 * does. So there is nothing to encode: write the header, the directory, and
 * the PNG bytes we just rendered.
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);

  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width  (0 means 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette size
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += data.length;
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const BASE64_MODULE_HEADER = `// Base64-encoded copy of the RecipePrinter logo, embedded directly so
// app/opengraph-image.tsx never needs to read a file at runtime. Earlier
// attempts (reading public/images/recipeprinter-logo.png, then a co-located
// app/opengraph-image-logo.png via fs.readFileSync) both threw ENOENT on
// Vercel — public/ is never bundled into the serverless function, and
// Next's build tracing did not reliably include the co-located file either.
// A string constant has no such dependency: it's just JS bundled with the
// module that already runs successfully.
//
// GENERATED by scripts/build-logo-assets.mjs — do not hand-edit. Replace
// public/images/recipeprinter-logo.png and run \`npm run logo:build\`.
export const OPENGRAPH_IMAGE_LOGO_BASE64 =
`;

async function main() {
  if (!existsSync(LOGO_SOURCE)) {
    console.error(`Source not found: ${LOGO_SOURCE}`);
    process.exit(1);
  }
  const executablePath =
    process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    console.error("No Chrome found. Install Chrome, or set CHROME_PATH.");
    process.exit(1);
  }

  const logo = readFileSync(LOGO_SOURCE);
  const logoUri = `data:image/png;base64,${logo.toString("base64")}`;

  const hasIconSource = existsSync(ICON_SOURCE);
  const icon = hasIconSource ? readFileSync(ICON_SOURCE) : logo;
  const iconUri = hasIconSource
    ? `data:image/png;base64,${icon.toString("base64")}`
    : logoUri;
  console.log(
    hasIconSource
      ? "icon mark: public/images/recipeprinter-favicon.png"
      : "icon mark: MISSING — falling back to the full logo. Save the icon " +
        "artwork to public/images/recipeprinter-favicon.png and re-run.",
  );

  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();

  // Natural size, so the non-square target keeps the mark's proportions.
  const measure = (uri) =>
    page.evaluate(
      (u) =>
        new Promise((res) => {
          const img = new Image();
          img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
          img.src = u;
        }),
      uri,
    );
  const { w: srcW, h: srcH } = await measure(iconUri);
  const logoSize = await measure(logoUri);
  console.log(`logo ${logoSize.w}x${logoSize.h}  ·  icon ${srcW}x${srcH}`);

  const written = [];
  const icoParts = [];

  for (const { out, size, background, pad, radius } of TARGETS) {
    // `contain` letterboxes rather than cropping or squashing.
    const png = await shoot(page, iconUri, size, size, "contain", background, pad, radius);
    writeFileSync(resolve(ROOT, out), png);
    written.push(`${out} (${size}x${size}, ${png.length} B)`);
    if (size === 16 || size === 32) icoParts.push({ size, data: png });
  }

  const iconW = srcW >= srcH ? ICON_MAX : Math.round((srcW / srcH) * ICON_MAX);
  const iconH = srcW >= srcH ? Math.round((srcH / srcW) * ICON_MAX) : ICON_MAX;
  const iconPng = await shoot(
    page, iconUri, iconW, iconH, "fill", "transparent", 0, ICON_RADIUS,
  );
  writeFileSync(resolve(ROOT, "app/icon.png"), iconPng);
  written.push(`app/icon.png (${iconW}x${iconH}, ${iconPng.length} B)`);

  icoParts.sort((a, b) => a.size - b.size);
  const ico = buildIco(icoParts);
  writeFileSync(resolve(ROOT, "public/favicon.ico"), ico);
  written.push(`public/favicon.ico (${icoParts.map((p) => p.size).join(" + ")}, ${ico.length} B)`);

  // The OG renderer wants the FULL mark at full resolution — a social card is
  // big, and it is the one place the whole printer should appear.
  const b64 = logo.toString("base64");
  // One string literal — see the note in build-og-card.mjs: a `+` chain of
  // this length overflows the lint parser's stack.
  const module = BASE64_MODULE_HEADER + "  " + JSON.stringify(b64) + ";\n";
  writeFileSync(resolve(ROOT, "app/opengraph-image-logo-base64.ts"), module);
  written.push(`app/opengraph-image-logo-base64.ts (${b64.length} chars)`);

  await browser.close();
  console.log("\nwrote:");
  for (const w of written) console.log(`  ${w}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
