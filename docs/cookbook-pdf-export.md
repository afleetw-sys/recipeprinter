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
  `document.fonts.ready`, **and** every image to `decode()`. Dropping the network
  wait without that would have captured books before their photos appeared.

If cold starts ever matter more than cost, `minInstances: 1` on the function
keeps one container warm — that is a standing bill, so it is not on by default.

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
