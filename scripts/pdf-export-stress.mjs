/**
 * Privacy-safe cookbook PDF stress fixture.
 *
 * Starts a local image server, builds a synthetic 148-recipe cookbook with one
 * distinct 4000x3000 URL per recipe, sends it directly to the local/development
 * renderer, and writes the returned PDF under tmp/pdfs/.
 *
 *   npm run dev
 *   npm run pdf:dev
 *   npm run pdf:stress
 *
 * Override with PDF_STRESS_RECIPES, PDF_STRESS_RENDERER, PDF_STRESS_AUTH,
 * PDF_STRESS_PRESET, or PDF_STRESS_OUTPUT. Never point this at production.
 */
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const recipeCount = positiveInteger(process.env.PDF_STRESS_RECIPES, 148);
const renderer = process.env.PDF_STRESS_RENDERER ?? "http://localhost:8899";
const auth = process.env.PDF_STRESS_AUTH ?? "local-dev-secret";
const preset = process.env.PDF_STRESS_PRESET ?? "hardcover-8x10";
const output = resolve(process.env.PDF_STRESS_OUTPUT ?? `tmp/pdfs/stress-${recipeCount}.pdf`);

if (/recipeprinter\.com|cloudfunctions\.net|run\.app/i.test(renderer)) {
  throw new Error("Refusing to send a stress fixture to a production-looking renderer URL.");
}

const photo = await sharp({
  create: { width: 4000, height: 3000, channels: 3, background: "#8b5e3c" },
})
  .composite([
    {
      input: Buffer.from(
        '<svg width="4000" height="3000"><circle cx="2000" cy="1500" r="900" fill="#dfb96d"/><path d="M0 2600 L4000 500" stroke="#375b45" stroke-width="240"/></svg>',
      ),
    },
  ])
  .jpeg({ quality: 96 })
  .toBuffer();

const imageServer = createServer((req, res) => {
  if (!req.url?.startsWith("/photo-")) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, {
    "content-type": "image/jpeg",
    "content-length": photo.length,
    "cache-control": "no-store",
  });
  res.end(photo);
});
await new Promise((resolveReady) => imageServer.listen(0, "127.0.0.1", resolveReady));
const address = imageServer.address();
if (!address || typeof address === "string") throw new Error("Could not start fixture image server.");
const imageOrigin = `http://127.0.0.1:${address.port}`;

const items = Array.from({ length: recipeCount }, (_, index) => {
  const number = index + 1;
  return {
    id: `stress-recipe-${number}`,
    method: "manual",
    source: "synthetic stress fixture",
    status: "ready",
    title: `Synthetic Recipe ${number}`,
    addedAt: number,
    recipe: {
      title: `Synthetic Recipe ${number}`,
      description: "Synthetic content used only to exercise cookbook pagination and rendering.",
      image: `${imageOrigin}/photo-${number}.jpg`,
      prepTime: "25 minutes",
      cookTime: "45 minutes",
      servings: "8 servings",
      ingredients: Array.from({ length: 18 }, (_, row) => ({
        raw: `${row + 1} cups synthetic ingredient with enough text to exercise line wrapping`,
      })),
      instructions: Array.from({ length: 12 }, (_, row) => ({
        step: row + 1,
        text: `Complete synthetic preparation step ${row + 1}, then continue mixing and cooking until the fixture has representative multi-line text.`,
      })),
    },
  };
});

const sections = Array.from({ length: Math.ceil(recipeCount / 20) }, (_, sectionIndex) => ({
  id: `stress-section-${sectionIndex + 1}`,
  title: `Synthetic Chapter ${sectionIndex + 1}`,
  intro: "Synthetic chapter introduction for stress testing only.",
  showOpener: true,
  items: items.slice(sectionIndex * 20, (sectionIndex + 1) * 20),
}));

const payload = {
  preset,
  project: {
    id: "synthetic-pdf-stress-fixture",
    kind: "cookbook",
    title: "Synthetic PDF Stress Fixture",
    sections,
    cover: { title: "Synthetic PDF Stress Fixture", imageUrl: `${imageOrigin}/photo-cover.jpg` },
    settings: {
      cardSize: "letter",
      template: "classic",
      doubleSided: true,
      showPhoto: true,
      showSourceUrl: false,
      showDescription: true,
      showCutLines: false,
      cookbookMode: true,
      tableOfContents: true,
      sectionDividers: true,
      photoStyle: "card",
    },
    createdAt: 1,
    updatedAt: 1,
  },
};

const startedAt = Date.now();
try {
  const response = await fetch(renderer, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`Renderer returned ${response.status}: ${await response.text()}`);
  const body = Buffer.from(await response.arrayBuffer());
  const pageCount = Number(response.headers.get("x-recipeprinter-page-count"));
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    throw new Error("Renderer omitted a valid page-count header.");
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, body);
  console.log(JSON.stringify({
    outcome: "success",
    recipes: recipeCount,
    sourcePhotoBytes: photo.length,
    pageCount,
    pdfBytes: body.length,
    totalMs: Date.now() - startedAt,
    output,
  }, null, 2));
} finally {
  await new Promise((resolveClosed) => imageServer.close(resolveClosed));
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
