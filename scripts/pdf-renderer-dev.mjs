/**
 * Local stand-in for the deployed cookbook PDF renderer.
 *
 * Runs the SAME steps as `functions-pdf/src/index.ts` in the CookPilot repo —
 * inject the payload, open `/export`, wait for `data-export-ready`, `page.pdf()`
 * — so local development exercises the real path instead of a mock. The only
 * difference is the browser binary: the deployed function uses
 * `@sparticuz/chromium` (a Linux build for Cloud Run), and this uses whatever
 * Chrome is already on the machine.
 *
 * Also matches the deployed function's RESPONSE shape: {downloadUrl,
 * pageCount} JSON, not the raw PDF bytes. There's no real Storage bucket to
 * upload to locally, so the finished file is kept in memory and served back
 * from this same process's own GET /files/<id>.pdf.
 *
 *   npm run pdf:dev
 *
 * Then point the app at it in `.env.local`:
 *   RECIPEPRINTER_PDF_URL=http://localhost:8899
 *   RECIPEPRINTER_PDF_AUTH=local-dev-secret
 *
 * Dev-only: `puppeteer-core` is a devDependency and nothing here ships to the
 * browser or to production.
 */
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import puppeteer from "puppeteer-core";
import { installPrintImageNormalization } from "./pdf-print-image-normalizer.mjs";

const PORT = Number(process.env.PDF_DEV_PORT ?? 8899);
const APP_ORIGIN = process.env.RECIPEPRINTER_ORIGIN ?? "http://localhost:3000";
const AUTH = process.env.RECIPEPRINTER_PDF_AUTH ?? "local-dev-secret";

/**
 * The deployed function no longer streams the PDF back in its response — Cloud
 * Run caps a single response well below what a large hardcover interior can
 * run to, so it uploads to Storage and hands back {downloadUrl, pageCount}
 * JSON instead (see exportStorage.ts in CookPilot). This local stand-in has no
 * real bucket to upload to, so it keeps the finished file in memory here and
 * serves it back from its own GET /files/<id>.pdf — same shape, no Storage
 * credentials needed for local dev.
 */
const renderedFiles = new Map();
const FILE_TTL_MS = 10 * 60 * 1000;
function storeFile(buffer, downloadFilename) {
  const id = randomUUID();
  renderedFiles.set(id, { buffer, downloadFilename, createdAt: Date.now() });
  setTimeout(() => renderedFiles.delete(id), FILE_TTL_MS).unref();
  return id;
}

// Keep in sync with COOKBOOK_PRESETS (lib/cookbookPresets.ts) and the function's
// own PRESET_SHEETS — trim plus bleed.
const PRESET_SHEETS = {
  "us-letter": { width: "8.5in", height: "11in" },
  // Same 8.5×11 trim as `us-letter`, plus 0.125in bleed on every edge.
  "coil-us-letter": { width: "8.75in", height: "11.25in" },
  // Same sheet as the coil book: a cased hardcover differs in its gutter
  // and its cover, not in the paper.
  "hardcover-us-letter": { width: "8.75in", height: "11.25in" },
  "hardcover-8x10": { width: "8.25in", height: "10.25in" },
};

// Ceiling on a caller-supplied sheet, so a bad request can't ask Chromium for a
// 400-inch page. Mirrors MAX_SHEET_IN in the deployed function.
const MAX_SHEET_IN = 40;

/** Mirrors safeDownloadFilename in CookPilot's exportStorage.ts — strips
    anything that would break a Content-Disposition header. */
function safeDownloadFilename(name) {
  const cleaned = String(name ?? "").replace(/[\x00-\x1f"\\]/g, "").trim();
  return cleaned || "cookbook.pdf";
}

/**
 * The sheet to render at — mirrors `resolveSheet` in the deployed function.
 *
 * A hardcover COVER WRAP has no fixed size (its spine width depends on the
 * book's page count), so an explicit `sheet` from the caller wins over the
 * preset table.
 */
function resolveSheet(payload) {
  const explicit = payload?.sheet;
  if (explicit) {
    const w = Number(explicit.widthIn);
    const h = Number(explicit.heightIn);
    const sane = (n) => Number.isFinite(n) && n > 0 && n <= MAX_SHEET_IN;
    if (!sane(w) || !sane(h)) return null;
    return { width: `${w}in`, height: `${h}in` };
  }
  return PRESET_SHEETS[payload?.preset ?? "us-letter"] ?? null;
}

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const executablePath =
  process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) {
  console.error(
    "No Chrome found. Install Chrome, or set CHROME_PATH to a Chromium binary.",
  );
  process.exit(1);
}

// One browser for the life of this process, mirroring the deployed function's
// one-per-container reuse — so local timings reflect production's warm path.
let browserPromise = null;
async function getBrowser() {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing?.connected) return existing;
  }
  browserPromise = puppeteer.launch({ executablePath, headless: true });
  return browserPromise;
}

// Reuse means the browser outlives each request, so it needs an owner for the
// end of the process too — otherwise stopping the renderer with Ctrl+C leaves a
// headless Chrome running with nothing to serve.
async function shutdown() {
  const browser = await (browserPromise ?? Promise.resolve(null)).catch(() => null);
  await browser?.close().catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

createServer(async (req, res) => {
  if (req.method === "GET" && req.url?.startsWith("/files/")) {
    const id = req.url.slice("/files/".length).replace(/\.pdf$/, "");
    const entry = renderedFiles.get(id);
    if (!entry) {
      res.writeHead(404).end("Not found, or this dev renderer has restarted since it was made.");
      return;
    }
    res
      .writeHead(200, {
        "content-type": "application/pdf",
        "content-length": entry.buffer.length,
        "content-disposition": `attachment; filename="${entry.downloadFilename}"`,
      })
      .end(entry.buffer);
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405).end("Use POST.");
    return;
  }
  if (req.headers.authorization !== AUTH) {
    res.writeHead(401).end("Unauthorized.");
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400).end("Malformed request.");
    return;
  }
  const sheet = resolveSheet(payload);
  if (!payload?.project || !sheet) {
    res.writeHead(400).end("Missing project, unknown preset, or bad sheet.");
    return;
  }

  const started = Date.now();
  const browser = await getBrowser();
  const page = await browser.newPage();
  page.on("console", (msg) => console.log(`  [page console] ${msg.text()}`));
  const DIAG_TIMING = process.env.DIAG_TIMING === "1";
  if (DIAG_TIMING) {
    let n = 0;
    page.on("request", (req) => {
      if (req.url().includes("firebasestorage")) {
        n += 1;
        console.log(`  [req  +${Date.now() - started}ms] #${n} start ${req.url().slice(-40)}`);
      }
    });
    page.on("requestfinished", (req) => {
      if (req.url().includes("firebasestorage")) {
        console.log(`  [done +${Date.now() - started}ms] finish ${req.url().slice(-40)}`);
      }
    });
    page.on("requestfailed", (req) => {
      if (req.url().includes("firebasestorage")) {
        console.log(`  [FAIL +${Date.now() - started}ms] ${req.failure()?.errorText} ${req.url().slice(-40)}`);
      }
    });
  }
  try {
    await installPrintImageNormalization(page);
    await page.evaluateOnNewDocument((injected) => {
      window.__RP_EXPORT__ = injected;
    }, payload);
    // Matches the function: `data-export-ready` is the real guarantee (layout
    // measured, fonts resolved, images decoded), so idling the network too was
    // ~900ms spent on a weaker version of the same thing.
    await page.goto(`${APP_ORIGIN}/export`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.waitForFunction(() =>
      document.documentElement.hasAttribute("data-export-ready") ||
      document.documentElement.hasAttribute("data-export-error"), {
      timeout: 60000,
    });
    const exportError = await page.evaluate(() =>
      document.documentElement.getAttribute("data-export-error"),
    );
    if (exportError) throw new Error(exportError);
    const pageCount = payload.mode === "cover-wrap"
      ? 1
      : await page.$$eval(".recipe-card-page", (pages) => pages.length);
    if (pageCount < 1) throw new Error("The export page completed without any laid-out pages.");
    const pdf = await page.pdf({
      ...sheet,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      printBackground: true,
    });
    console.log(
      `rendered ${payload.preset} — ${pdf.length} bytes in ${Date.now() - started}ms`,
    );
    const pathFilename = payload.mode === "cover-wrap" ? "cover.pdf" : "interior.pdf";
    const downloadFilename = safeDownloadFilename(
      typeof payload.fileName === "string" && payload.fileName.trim()
        ? payload.fileName
        : pathFilename,
    );
    const id = storeFile(Buffer.from(pdf), downloadFilename);
    res
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ downloadUrl: `http://localhost:${PORT}/files/${id}.pdf`, pageCount }));
  } catch (error) {
    console.error("render failed:", error.message);
    res.writeHead(500).end("Could not render the cookbook.");
  } finally {
    await page.close().catch(() => undefined);
  }
}).listen(PORT, () => {
  console.log(`Cookbook PDF renderer (dev) on http://localhost:${PORT}`);
  console.log(`  rendering from ${APP_ORIGIN}/export`);
  console.log(`  using ${executablePath}`);
});
