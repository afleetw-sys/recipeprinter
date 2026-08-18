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
import puppeteer from "puppeteer-core";

const PORT = Number(process.env.PDF_DEV_PORT ?? 8899);
const APP_ORIGIN = process.env.RECIPEPRINTER_ORIGIN ?? "http://localhost:3000";
const AUTH = process.env.RECIPEPRINTER_PDF_AUTH ?? "local-dev-secret";

// Keep in sync with COOKBOOK_PRESETS (lib/cookbookPresets.ts) and the function's
// own PRESET_SHEETS — trim plus bleed.
const PRESET_SHEETS = {
  "us-letter": { width: "8.5in", height: "11in" },
  "hardcover-8x10": { width: "8.25in", height: "10.25in" },
};

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
  const sheet = PRESET_SHEETS[payload?.preset ?? "us-letter"];
  if (!payload?.project || !sheet) {
    res.writeHead(400).end("Missing project or unknown preset.");
    return;
  }

  const started = Date.now();
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.evaluateOnNewDocument((injected) => {
      window.__RP_EXPORT__ = injected;
    }, payload);
    // Matches the function: `data-export-ready` is the real guarantee (layout
    // measured, fonts resolved, images decoded), so idling the network too was
    // ~900ms spent on a weaker version of the same thing.
    await page.goto(`${APP_ORIGIN}/export`, {
      waitUntil: "domcontentloaded",
      timeout: 45000,
    });
    await page.waitForSelector('html[data-export-ready="true"]', {
      timeout: 45000,
    });
    const pdf = await page.pdf({
      ...sheet,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      printBackground: true,
    });
    console.log(
      `rendered ${payload.preset} — ${pdf.length} bytes in ${Date.now() - started}ms`,
    );
    res
      .writeHead(200, {
        "content-type": "application/pdf",
        "content-length": pdf.length,
      })
      .end(Buffer.from(pdf));
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
