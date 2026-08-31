#!/usr/bin/env node
/**
 * Renders a REAL recipe card and saves it as the social card's artwork.
 *
 *   npm run dev                      (in another terminal)
 *   npm run og:card                  (or: OG_CARD_URL=http://localhost:3000 npm run og:card)
 *
 * Why render rather than draw: the OG image used to fake a card out of grey
 * bars, which is exactly what made it look machine-generated. This drives the
 * actual app — same components, same print.css, same template — and photographs
 * the result, so the picture in a link preview is the thing the product makes
 * rather than an illustration of it.
 *
 * It seeds the queue in sessionStorage (lib/queue.ts) and lets the page do the
 * rest, so it exercises the same path a person does. The template and size come
 * from the query string, which app/print/page.tsx already reads.
 *
 * Output: public/images/og-recipe-card.png, embedded as base64 by
 * scripts/build-og-card-base64.mjs — `public/` is never bundled into Vercel's
 * serverless function, so the OG route cannot read it from disk at runtime.
 *
 * Dev-only: `puppeteer-core` is a devDependency and nothing here ships.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "public/images/og-recipe-card.png");
const BASE = process.env.OG_CARD_URL ?? "http://localhost:3000";

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

const ing = (name, amount, unit, section) => ({ name, amount, unit, section });
const step = (n, text, section) => ({ step: n, text, section });

/** A real recipe, chosen because it fills a card honestly: two ingredient
    sections, enough steps to reach the second column, nothing invented. */
const RECIPE = {
  title: "Bruschetta",
  totalTime: "PT7M",
  servings: 24,
  ingredients: [
    ing("Roma tomatoes, diced", "6", "", "For the tomato bruschetta"),
    ing("basil leaves, chopped", "1/3", "cup", "For the tomato bruschetta"),
    ing("garlic cloves, divided", "5", "", "For the tomato bruschetta"),
    ing("balsamic vinegar", "1", "Tbsp", "For the tomato bruschetta"),
    ing("extra virgin olive oil", "2", "Tbsp", "For the tomato bruschetta"),
    ing("sea salt", "1/2", "tsp", "For the tomato bruschetta"),
    ing("black pepper", "1/4", "tsp", "For the tomato bruschetta"),
    ing("balsamic glaze (optional)", "", "", "For the tomato bruschetta"),
    ing("baguette", "1", "", "For the toasts"),
    ing("extra virgin olive oil", "3", "Tbsp", "For the toasts"),
    ing("shredded parmesan cheese", "1/3", "cup", "For the toasts"),
  ],
  instructions: [
    step(1, "Core and dice tomatoes (or use a food chopper). Drain any excess juice and transfer tomatoes to a medium bowl.", "Make the tomato bruschetta topping"),
    step(2, "Chop basil - stack basil leaves and roll them into a tube. Using a sharp knife, thinly slice the basil into ribbons and transfer to the bowl with tomatoes.", "Make the tomato bruschetta topping"),
    step(3, "Press the garlic cloves and add to the bowl along with the balsamic vinegar and olive oil.", "Make the tomato bruschetta topping"),
    step(4, "Season with salt and pepper and stir to combine. Set aside while you make the toasts.", "Make the tomato bruschetta topping"),
    step(5, "Slice the baguette on the diagonal into half-inch pieces and arrange on a baking sheet.", "Toast the bread"),
    step(6, "Brush both sides with olive oil and bake at 425F until golden at the edges, about 5 minutes.", "Toast the bread"),
  ],
};

async function main() {
  const executablePath =
    process.env.CHROME_PATH ?? CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) {
    console.error("No Chrome found. Install Chrome, or set CHROME_PATH.");
    process.exit(1);
  }

  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  // deviceScaleFactor 2 so the card survives being scaled down into a 1200px
  // canvas without the type going soft.
  await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });

  // Seed the queue on the origin first — sessionStorage is per-origin, so this
  // has to happen on a page from the same server, not about:blank.
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate((recipe) => {
    sessionStorage.setItem(
      "recipeprinter:queue:v1",
      JSON.stringify([
        {
          id: "og-card",
          method: "text",
          source: "og",
          status: "ready",
          title: recipe.title,
          recipe,
          addedAt: Date.now(),
        },
      ]),
    );
  }, RECIPE);

  // 6x4, not letter: an index card is the iconic shape of the thing, and a
  // letter sheet left two thirds of itself empty under a seven-line recipe.
  const TEMPLATE = process.env.OG_CARD_TEMPLATE ?? "bistro";
  const SIZE = process.env.OG_CARD_SIZE ?? "card-6x4";
  await page.goto(`${BASE}/print?template=${TEMPLATE}&size=${SIZE}`, { waitUntil: "networkidle0" });
  await page.waitForSelector(".recipe-card", { timeout: 45000 });
  // Fonts, then a beat for the layout settler to finish moving content between
  // faces — screenshotting mid-settle catches a card with items still hopping.
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 2500));

  // The deck scales each page down to fit the viewport (`.recipe-page-scaler`
  // carries a CSS transform), so screenshotting the card as-is captured a
  // 265px thumbnail of it. Undo the transform and let the card sit at its true
  // physical size — 8.5in of letter at 96dpi — before photographing it.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".recipe-page-scaler")) {
      el.style.transform = "none";
      el.style.transformOrigin = "top left";
    }
    for (const el of document.querySelectorAll(".recipe-print-preview, .recipe-spread__page, .recipe-deck")) {
      el.style.overflow = "visible";
    }
  });
  await new Promise((r) => setTimeout(r, 800));

  // Pick the WIDEST .recipe-card, not the first. The theme picker renders a
  // thumbnail of every template into the same page, and those come earlier in
  // the DOM — grabbing `.recipe-card` blind photographed a 190px swatch of the
  // template list rather than the sheet in the deck.
  const cards = await page.$$(".recipe-card");
  let card = null;
  let widest = 0;
  for (const el of cards) {
    const box = await el.boundingBox();
    if (box && box.width > widest) {
      widest = box.width;
      card = el;
    }
  }
  if (!card) {
    console.error("No .recipe-card rendered — is the dev server up at " + BASE + "?");
    await browser.close();
    process.exit(1);
  }
  console.log(`found ${cards.length} cards on the page; widest is ${Math.round(widest)}px`);
  const shot = await card.screenshot({ type: "png" });
  writeFileSync(OUT, shot);
  const box = await card.boundingBox();
  console.log(`wrote ${OUT}  (${Math.round(box.width)}x${Math.round(box.height)} css px @2x, ${shot.length} B)`);
  await browser.close();

  // And the copy the OG route actually reads. `public/` is never bundled into
  // Vercel's serverless function — the same ENOENT that forced the logo to be
  // a string constant (see app/opengraph-image.tsx) — so the card ships as JS.
  // ONE string literal, deliberately unwrapped. Emitting this as a chain of
  // 120-char pieces joined by `+` builds a left-nested AST thousands deep, and
  // `next lint` blew its parser stack on it — "Maximum call stack size
  // exceeded", which fails the build rather than warning. A single literal is
  // one node however long the line is.
  const b64 = readFileSync(OUT).toString("base64");
  const header = [
    "/**",
    " * A real recipe card, rendered by scripts/build-og-card.mjs and embedded",
    " * here because public/ is not bundled into Vercel's serverless function.",
    " *",
    " * GENERATED - do not hand-edit. Re-run `npm run og:card` with the dev",
    " * server up to refresh it; OG_CARD_TEMPLATE / OG_CARD_SIZE pick a",
    " * different template or card size.",
    " */",
    "export const OPENGRAPH_CARD_BASE64 =",
  ].join("\n");
  writeFileSync(
    resolve(ROOT, "app/opengraph-image-card-base64.ts"),
    header + "\n  " + JSON.stringify(b64) + ";\n",
  );
  console.log("wrote app/opengraph-image-card-base64.ts (" + b64.length + " chars)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
