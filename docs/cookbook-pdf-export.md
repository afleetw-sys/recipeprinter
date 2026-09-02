# Cookbook PDF export

A cookbook downloads as a finished PDF. Nobody sees a print dialog.

## Why it works this way

`window.print()` always opens the browser's own dialog, and no browser lets a
page preselect "Save as PDF" or skip it. The export therefore used to depend on
the cook reading a paragraph and choosing the right destination — and a cookbook
sent to a desktop printer comes back rescaled on **every** page, because the
design bleeds to the sheet edge and printers reserve an unprintable margin.
Rendering server-side removes the choice, and with it the failure mode.

## The path

```
CookbookReadyDialog  →  lib/cookbookPdfExport.ts
                     →  POST /api/cookbook-pdf          (app, holds the secret)
                     →  recipePrinterCookbookPdf        (Cloud Run + Chromium)
                     →  GET  /export                    (app, renders the book)
                     →  page.pdf()  →  download
```

- **`/export`** (`app/export/page.tsx`) renders the book from a payload injected
  into `window.__RP_EXPORT__`. It reuses `usePrintSheets` and `ScaledPage` — the
  same layout engine and the same `print.css` as the preview — so the file people
  pay for cannot drift from the book they approved. It sets
  `<html data-export-ready="true">` once the layout has measured, fonts have
  resolved, and it has painted.
- **`/api/cookbook-pdf`** exists to keep `RECIPEPRINTER_PDF_AUTH` server-side.
  Calling the renderer from the browser would ship a shared secret to every
  visitor and let anyone burn 2GiB of Chromium on demand.
- **The renderer** lives in the CookPilot repo at `functions-pdf/`, as its **own
  Firebase codebase**. A codebase deploys as one bundle, so Chromium (~50MB)
  sitting in `functions/` would have been added to the cold start of every
  unrelated function — `extractRecipe`, `parseRecipeFromURL`, the RevenueCat
  webhook. Isolated, nothing else pays for it.

## Running it locally

```bash
npm run pdf:dev      # renderer on :8899, in a second terminal
npm run dev
```

and in `.env.local`:

```
RECIPEPRINTER_PDF_URL=http://localhost:8899
RECIPEPRINTER_PDF_AUTH=local-dev-secret
```

`scripts/pdf-renderer-dev.mjs` runs the same steps as the deployed function —
inject payload, open `/export`, wait for `data-export-ready`, `page.pdf()` — so
local work exercises the real path rather than a mock. The only difference is
the browser: the function uses `@sparticuz/chromium` (a Linux build for Cloud
Run), the script uses whatever Chrome is already installed (`CHROME_PATH` to
override). `puppeteer-core` is a devDependency; nothing here reaches the browser
or production.

If the dev server isn't on port 3000, point the renderer at it:
`RECIPEPRINTER_ORIGIN=http://localhost:3001 npm run pdf:dev`.

Without those two env vars the export button reports "PDF export isn't
configured on this deployment" — that is this state, not a broken cookbook.

## Deploying it

1. `cd ~/Desktop/CookPilot/functions-pdf && npm install`

   The codebase has a `predeploy` hook that runs `npm run build`, so the
   TypeScript is compiled for you. Without it the deploy fails on
   `functions-pdf/lib/index.js does not exist` — `main` points at the compiled
   output, and nothing else would ever emit it.
2. Set the shared secret (any long random string):
   `npx firebase-tools functions:secrets:set RECIPEPRINTER_PDF_AUTH -P recipeapp`
3. Export it: add `export {recipePrinterCookbookPdf} from "./index";` is not
   needed — `functions-pdf/src/index.ts` *is* the entry point.
4. Deploy **only** this codebase, so the main functions are untouched:
   `npx firebase-tools deploy --only functions:pdf -P recipeapp`
   (`-P recipeapp` = cookpilot-bbecb, NOT the `.firebaserc` default.)
5. In Vercel, set on the **recipeprinter-1zf6** project:
   - `RECIPEPRINTER_PDF_URL` — the deployed function's URL
   - `RECIPEPRINTER_PDF_AUTH` — the same secret value

Until both Vercel vars are set, `/api/cookbook-pdf` returns 503 and the dialog
says export isn't configured — a deployment state, not a broken cookbook.

## Keeping the trim sizes in sync

`PRESET_SHEETS` in `functions-pdf/src/index.ts` must match `COOKBOOK_PRESETS` in
`lib/cookbookPresets.ts`. Separate repos, no shared package — the same hand-sync
arrangement as `RECIPEPRINTER_PREMIUM_TEMPLATES`.

## Verified locally (2026-08-17)

Driving the system Chrome through the identical steps, against the dev server:

| Preset | Pages | MediaBox | Expected |
|---|---|---|---|
| `hardcover-8x10` | 8 | 594 × 738pt = 8.250 × 10.250in | 8×10 trim + 0.125in bleed ✓ |
| `us-letter` | 8 | 612 × 792pt = 8.500 × 11.000in | Letter ✓ |

Ready signal fired in ~2s; a rendered recipe page carried its running header,
folio, full-bleed band, ingredients and steps. The whole path was also exercised
through `/api/cookbook-pdf` itself (200, `application/pdf`, 223KB), and a
malformed request returned 502 with a JSON error rather than a corrupt file.

## Speed

Measured locally (3-recipe book, hardcover 8×10, byte-identical output each time):

| | |
|---|---|
| First export on a cold container | ~1.5s |
| Every export after | **~0.6s** |

Two things get it there, both in the renderer:

- **One Chromium per container, not per request.** Launching it was the single
  most expensive step (~700ms warm, seconds cold) and was pure overhead — the
  browser that just rendered a book renders the next one fine. The page closes
  after each request; the browser stays.
- **`domcontentloaded`, not `networkidle0`.** Idling the network cost ~900ms per
  export while only *guessing* fonts and images had arrived. `/export` now
  states it exactly: `data-export-ready` waits for the measured layout,
  `document.fonts.ready`, **and** every photo to decode. Dropping the network
  wait without that would have captured books before their photos appeared.
  How that decode is waited on matters enormously — see below.

If cold starts ever matter more than cost, `minInstances: 1` on the function
keeps one container warm — that is a standing bill, so it is not on by default.

### The 20 seconds that were not work

A 3-recipe fixture has no photos, which is why the timings above looked
finished. A real cookbook does, and every export of one spent **20.3 seconds
waiting for nothing** — reproducibly, to within 50ms of `IMAGE_WAIT_MS`,
whether the book held 10 recipes or 80.

The deck keeps every face but the active one in a `display: none` subtree
(`data-preview-hidden`, see `ScaledPage`), and Chromium never finishes an image
inside one: the bytes arrive, `naturalWidth` fills in, and then `complete`
stays false and `decode()` never settles. `/export` was calling `decode()` on
`document.images` — so on a 40-recipe book, 34 of the 45 images on the page
were promises that could not resolve, and the readiness signal was pinned to
its own deadline. The photos themselves had all arrived in **996ms**.

`useExportReady` now decodes one detached `Image` per distinct source instead.
Same cache entry, and the guarantee is the one that was actually wanted: every
photo's pixels are decoded and resident before the renderer captures, which is
what `page.pdf()` needs when it renders in print media where nothing is hidden.

Measured on a 40-recipe book with photos, hardcover 8×10, **byte-identical
output** (45,753,225 bytes both ways):

| | before | after |
|---|---|---|
| Layout + readiness | 20,338ms | **995ms** |
| `page.pdf()` | 4,743ms | 4,745ms |
| **Total** | **25,116ms** | **5,882ms** |

Do not reintroduce a wait on `document.images` here. Anything hidden on screen
cannot resolve, and the failure is silent — it costs the deadline, not the
book, so nothing ever reports it.

### What is left, in order

| Cost | 40 recipes | 80 recipes |
|---|---|---|
| Layout + readiness | ~1.0s | ~2.2s |
| `page.pdf()` | ~4.7s | ~9.5s |
| File the cook then downloads | ~46MB | ~91MB |

`page.pdf()` is Chromium rasterizing full-bleed photo pages; it scales with
page count and there is no obvious slack in it.

The file size is the bigger remaining cost, and it is not the PDF's overhead —
Chromium passes each photo's **original JPEG bytes straight through**, so a
book's file is about the sum of its photos. Ours are capped at 1600px on the
long edge on upload (`lib/coverPhoto.ts`), but a photo imported from a recipe
site is whatever that site served, uncapped. Normalizing those on import would
shrink the download proportionally — at a real cost, since 1600px across an
8.25in bleed is already only ~194dpi, so anything larger is currently printing
better than that, not worse.

Cold start is now a much larger share of a first export than it was: a 2GiB
container that has to pull ~50MB of Chromium. `minInstances: 1` on the function
removes it for a standing bill.


## Still on browser print

Recipe **cards** still use `window.print()`. They're a free print job on plain
paper with no bleed, so the print dialog is the right tool and there is nothing
to warn about. Only cookbooks route through the renderer.

## Note on the `@media print` cleanup

`page.pdf()` renders in **print media**, and the export route deliberately
depends on that: the existing `@media print` rules are what un-hide the
non-active faces and reset `.recipe-page-slide` opacity. So those rules are
**not** dead and must not be deleted while the renderer works this way.

What the PDF work did retire is the browser-print *export round trip* — the
`.rp-exporting` class and geometry vars the deck used to put on for the instant
`window.print()` fired, and the state machine around it. Deleting the `@media
print` block itself would require the export route to carry its own screen-media
stylesheet first.
