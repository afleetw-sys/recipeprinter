/**
 * Render the customer's EXACT cookbook content directly against the local
 * renderer (pdf-renderer-dev.mjs on localhost:8899), bypassing /api/cookbook-pdf
 * entirely — no auth token needed, and this never touches Firestore at all.
 *
 * Reads its source from the local snapshot file only (parent + content docs
 * captured by cookbook-diagnostic-snapshot.mjs), merges them into the real
 * PrintProject shape the app sends, and posts it straight to the renderer —
 * same mechanism pdf-export-stress.mjs uses for the synthetic fixture, except
 * with her real recipes so we see the REAL renderer error text, not a 502
 * bubbled through three layers.
 *
 *   npm run pdf:dev   (separately, if not already running)
 *   DIAG_SNAPSHOT_IN=/path/to/customer-snapshot.json \
 *   DIAG_PRESET=hardcover-8x10 \
 *     node cookbook-diagnostic-render.mjs
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SNAPSHOT_IN = process.env.DIAG_SNAPSHOT_IN;
const renderer = process.env.DIAG_RENDERER ?? "http://localhost:8899";
const auth = process.env.RECIPEPRINTER_PDF_AUTH ?? "local-dev-secret";
const preset = process.env.DIAG_PRESET ?? "hardcover-8x10";
const output = resolve(process.env.DIAG_OUTPUT ?? `tmp/pdfs/customer-diagnostic-${preset}.pdf`);

if (!SNAPSHOT_IN) {
  console.error("Set DIAG_SNAPSHOT_IN to the snapshot file written by cookbook-diagnostic-snapshot.mjs");
  process.exit(1);
}
if (/recipeprinter\.com|cloudfunctions\.net|run\.app/i.test(renderer)) {
  throw new Error("Refusing to send this to a production-looking renderer URL.");
}

const snapshot = JSON.parse(await readFile(resolve(SNAPSHOT_IN), "utf8"));
if (!snapshot.parent || !snapshot.content) {
  console.error("Snapshot is missing parent/content. Nothing sent.");
  process.exit(1);
}

// Full PrintProject = the lightweight parent, with its stub `sections`
// replaced by the real ones (and itemPlacements/stashedCookbook) from content
// — same merge the app does when it opens a split-storage project.
const project = { ...snapshot.parent, ...snapshot.content };

const payload = { preset, project };

console.log(`\nRendering the customer's REAL cookbook content locally — no Firestore involved.`);
console.log(`preset:  ${preset}`);
console.log(`sections: ${project.sections.length}`);
console.log(`recipes:  ${project.sections.reduce((n, s) => n + (s.items?.length ?? 0), 0)}`);
console.log(`renderer: ${renderer}\n`);

const startedAt = Date.now();
try {
  const response = await fetch(renderer, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: auth },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(300_000),
  });
  const elapsedMs = Date.now() - startedAt;
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.log(JSON.stringify({
      outcome: "renderer error",
      status: response.status,
      elapsedMs,
      detail,
    }, null, 2));
    process.exit(1);
  }
  const body = Buffer.from(await response.arrayBuffer());
  const pageCount = Number(response.headers.get("x-recipeprinter-page-count"));
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, body);
  console.log(JSON.stringify({
    outcome: "success",
    pageCount,
    pdfBytes: body.length,
    elapsedMs,
    output,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    outcome: "request failed",
    elapsedMs: Date.now() - startedAt,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  }, null, 2));
  process.exit(1);
}
