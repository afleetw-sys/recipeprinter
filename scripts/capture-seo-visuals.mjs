/**
 * Dev-only: capture the SEO landing pages' product-UI proof visuals straight
 * from the running app, so every "screenshot" on the marketing pages is the
 * real interface rather than a mockup.
 *
 * Usage:  node scripts/capture-seo-visuals.mjs [baseUrl] [shot]
 *         node scripts/capture-seo-visuals.mjs http://localhost:64274 import-modes
 *
 * `puppeteer-core` is a devDependency and nothing here ships to the app; this
 * is a build-time tool for producing files in public/images.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ONLY = process.argv[3] ?? null;
const OUT_DIR = path.resolve("public/images");

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
  console.error("No Chrome found. Set CHROME_PATH to a Chromium binary.");
  process.exit(1);
}

/** Tight clip around an element, in CSS px, with even padding. Product-UI
    shots keep their own proportions rather than being forced into the 4:3 of
    the printed-card photographs — the figure reads the aspect back from the
    file, so nothing gets cropped. */
async function clipTo(page, selector, pad = 24) {
  const box = await (await page.$(selector)).boundingBox();
  const { width: pw, height: ph } = page.viewport();
  const x = Math.max(0, box.x - pad);
  const y = Math.max(0, box.y - pad);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(Math.min(box.width + pad * 2, pw - x)),
    height: Math.round(Math.min(box.height + pad * 2, ph - y)),
  };
}


/** The recipe both halves of the before/after show, so the comparison is the
    same dish rendered two ways rather than two different recipes. */
const DEMO_RECIPE = {
  title: "Brown Butter Banana Bread",
  prepTime: "15 min",
  cookTime: "55 min",
  servings: "8",
  ingredients: [
    { amount: "3", name: "ripe bananas, mashed" },
    { amount: "1/2", unit: "cup", name: "brown butter, cooled" },
    { amount: "3/4", unit: "cup", name: "brown sugar" },
    { amount: "2", name: "eggs" },
    { amount: "1 3/4", unit: "cups", name: "all-purpose flour" },
    { amount: "1", unit: "tsp", name: "baking soda" },
    { amount: "1/2", unit: "tsp", name: "fine salt" },
  ],
  instructions: [
    { step: 1, text: "Heat the oven to 350F and butter a loaf pan." },
    { step: 2, text: "Brown the butter in a light pan until the solids turn golden and it smells nutty, about 8 minutes. Cool slightly." },
    { step: 3, text: "Whisk the bananas, butter, sugar, and eggs until smooth." },
    { step: 4, text: "Fold in the flour, baking soda, and salt just until no dry streaks remain." },
    { step: 5, text: "Pour into the pan and bake 55 minutes, until a skewer comes out clean." },
  ],
};

/** A second recipe for the fallback row: rows that both end in the same card
    image read as one visual repeated, not two claims. */
const CAPTION_RECIPE = {
  title: "Chili Crisp Noodles",
  prepTime: "5 min",
  cookTime: "10 min",
  servings: "2",
  ingredients: [
    { amount: "8", unit: "oz", name: "wheat noodles" },
    { amount: "3", unit: "tbsp", name: "chili crisp" },
    { amount: "2", unit: "tbsp", name: "soy sauce" },
    { amount: "1", unit: "tbsp", name: "black vinegar" },
    { amount: "2", name: "garlic cloves, grated" },
    { amount: "2", name: "spring onions, sliced" },
  ],
  instructions: [
    { step: 1, text: "Boil the noodles until just tender, then drain, saving a splash of the water." },
    { step: 2, text: "Whisk the chili crisp, soy sauce, vinegar, and garlic in the bottom of a bowl." },
    { step: 3, text: "Add the noodles and a spoonful of the noodle water, and toss until glossy." },
    { step: 4, text: "Top with the spring onions and eat straight away." },
  ],
};

/** Put a ready recipe straight into the session queue and open the print
    preview. Skips the parse API entirely: the card that comes back is the real
    print renderer's output, not a re-drawing of it. */
async function openPrintPreview(page, recipe = DEMO_RECIPE) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate((recipe) => {
    const item = {
      id: "seo-demo",
      method: "text",
      source: "Pasted text",
      status: "ready",
      title: recipe.title,
      recipe,
      addedAt: Date.now(),
    };
    sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify([item]));
    localStorage.setItem("recipeprinter:queue:recovery:v1", JSON.stringify([item]));
  }, recipe);
  await page.goto(`${BASE}/print?size=card-6x4`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 1800));
}


const TMP_DIR = path.resolve(
  process.env.SEO_TMP_DIR ?? "node_modules/.cache/seo-visuals",
);

// The site's own tokens (app/globals.css), so the composed image sits in the
// page rather than beside it: flat surfaces, hairline borders, one teal accent.
const T = {
  page: "#f5f7fb", card: "#ffffff", ink: "#111111", inkSoft: "#667085",
  line: "rgba(17,17,17,0.08)", lineStrong: "rgba(17,17,17,0.14)",
  accent: "#60cac4", accentInk: "#2f7d78",
};

/** A fixed 3:2 frame: the pile and the card sit side by side, which is the
    comparison the row is making, and a landscape rectangle is the shape that
    holds it without cropping. */
function composition(sheets, longShot, cardShot, sheetW, sheetH) {
  const W = 1200, H = 800, PAD = 60;
  const thumbW = 340;
  const thumbH = Math.round(sheetH * (thumbW / sheetW));
  const stepX = 19, stepY = 10;
  const pile = Array.from({ length: sheets }, (_, j) => {
    const pageIndex = sheets - 1 - j;
    return `
    <div style="position:absolute;left:${j * stepX}px;top:${j * stepY}px;z-index:${j};
                width:${thumbW}px;height:${thumbH}px;
                border:1px solid ${T.lineStrong};border-radius:4px;background:${T.card};overflow:hidden;
                background-image:url('file://${longShot}');background-size:${thumbW}px auto;
                background-position:0 -${pageIndex * thumbH}px;background-repeat:no-repeat;"></div>`;
  }).join("");
  const pileW = thumbW + (sheets - 1) * stepX;
  const pileH = thumbH + (sheets - 1) * stepY;
  return `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;background:${T.page};
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${T.ink}}
    #frame{width:${W}px;height:${H}px;padding:${PAD}px;display:flex;
           align-items:center;justify-content:center;gap:48px}
    .col{display:flex;flex-direction:column;gap:22px}
    .label{font-size:20px;font-weight:700;letter-spacing:-0.015em}
    .sub{font-size:15px;color:${T.inkSoft};font-weight:600;margin-top:3px}
    .rule{width:1px;align-self:stretch;background:${T.line}}
    .count{display:inline-flex;align-items:center;gap:9px}
    .dot{width:9px;height:9px;border-radius:99px;background:${T.accent}}
  </style><div id="frame">
    <div class="col">
      <div style="position:relative;width:${pileW}px;height:${pileH}px">${pile}</div>
      <div><div class="label">${sheets} sheets</div>
        <div class="sub">the page as it prints</div></div>
    </div>
    <div class="rule"></div>
    <div class="col">
      <img src="file://${cardShot}" style="width:470px;height:auto;display:block;
        border:1px solid ${T.line};border-radius:9px;background:${T.card}">
      <div><div class="label count"><span class="dot"></span>1 card</div>
        <div class="sub">the same recipe, from Recipe Printer</div></div>
    </div>
  </div>`;
}

/** Two artifacts side by side in the shared 3:2 frame, each with a label. The
    before/after and the paste/card rows are the same argument in the same
    shape, so they share one layout rather than two near-identical ones. */
function pairComposition(left, right) {
  const W = 1200, H = 800, PAD = 60;
  const framed = (a) => a.frame === "phone"
    ? `<div style="width:${a.width + 22}px;padding:11px;border-radius:34px;background:#1c1c1e">
         <img src="file://${a.src}" style="width:${a.width}px;height:auto;display:block;
           border-radius:24px;background:${T.card}">
       </div>`
    : `<img src="file://${a.src}" style="width:${a.width}px;height:auto;display:block;
         border:1px solid ${T.line};border-radius:9px;background:${T.card}">`;
  const side = (a) => `
    <div class="col">
      ${framed(a)}
      <div><div class="label${a.dot ? " count" : ""}">${a.dot ? '<span class="dot"></span>' : ""}${a.label}</div>
        <div class="sub">${a.sub}</div></div>
    </div>`;
  return `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;background:${T.page};
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:${T.ink}}
    #frame{width:${W}px;height:${H}px;padding:${PAD}px;display:flex;
           align-items:center;justify-content:center;gap:48px}
    .col{display:flex;flex-direction:column;gap:22px}
    .label{font-size:20px;font-weight:700;letter-spacing:-0.015em}
    .sub{font-size:15px;color:${T.inkSoft};font-weight:600;margin-top:3px}
    .rule{width:1px;align-self:stretch;background:${T.line}}
    .count{display:inline-flex;align-items:center;gap:9px}
    .dot{width:9px;height:9px;border-radius:99px;background:${T.accent}}
  </style><div id="frame">${side(left)}<div class="rule"></div>${side(right)}</div>`;
}

/** Clip around several elements at once — a labelled field is a label plus a
    control, and clipping only the control lops the label in half. */
async function clipUnion(page, selectors, pad = 18, padTop = pad) {
  const boxes = [];
  for (const sel of selectors) {
    const el = await page.$(sel);
    if (el) boxes.push(await el.boundingBox());
  }
  if (boxes.length === 0) throw new Error(`Nothing matched ${selectors.join(", ")}`);
  const x0 = Math.min(...boxes.map((b) => b.x)) - pad;
  // Top padding is separate: reaching a full pad above a labelled field
  // clips the bottom edge of whatever sits above it into the shot.
  const y0 = Math.min(...boxes.map((b) => b.y)) - padTop;
  const x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad;
  const y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  const { width: pw, height: ph } = page.viewport();
  const x = Math.max(0, x0), y = Math.max(0, y0);
  return {
    x: Math.round(x), y: Math.round(y),
    width: Math.round(Math.min(x1 - x, pw - x)),
    height: Math.round(Math.min(y1 - y, ph - y)),
  };
}

const SHOTS = {
  /**
   * "For the pages that fight back" — the four import sources, with the paste
   * fallback open and holding a real recipe. Shows the recovery path the copy
   * promises, not just a row of buttons.
   */
  /**
   * "It keeps the recipe and drops everything else" — the same recipe printed
   * two ways. The left stack is a recipe page of realistic length actually
   * rendered and paginated at US Letter, so the sheet count is measured rather
   * than asserted; the right card is the real print renderer's output. See
   * scripts/seo-assets/typical-recipe-page.html for what the left side is and,
   * just as importantly, what it is not.
   */
  /**
   * "For the pages that fight back" — the payoff the copy promises: unstructured
   * text pasted straight in, and the same clean card out the other side. Shows
   * the recovery rather than the failure, which also means no real recipe site
   * has to be cast as the broken one.
   */
  "pasted-text": async (page) => {
    // 1. The app at phone width, holding a recipe the way a caption gives it to
    //    you. A phone-shaped artifact also carries the row's own claim that this
    //    works from the couch, which a cropped desktop textarea never did.
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".rp-import-panel");
    for (const button of await page.$$(".mode-toggle__item")) {
      const label = await button.evaluate((el) => el.textContent?.trim());
      if (label === "Paste Text") { await button.click(); break; }
    }
    await page.waitForSelector(".rp-import-panel textarea");
    await page.type(
      ".rp-import-panel textarea",
      "chili crisp noodles!! 8oz wheat noodles, 3 tbsp chili crisp, 2 tbsp soy, 1 tbsp black vinegar, 2 cloves garlic grated, spring onions. boil noodles til just tender save a splash of the water. whisk chili crisp soy vinegar garlic in the bowl. add noodles + splash of water, toss til glossy. spring onions on top, eat immediately",
      { delay: 0 },
    );
    await page.$eval(".rp-import-panel textarea", (el) => { el.scrollTop = 0; el.blur(); });
    await new Promise((r) => setTimeout(r, 350));
    const phoneShot = path.join(TMP_DIR, "phone.png");
    // Anchor on the bar's own text and walk up to the full-width container:
    // the tray's class differs between its collapsed and expanded forms, and a
    // missed selector silently falls back to the whole viewport, which drags
    // the page footer into frame half-cropped.
    const trayBottom = await page.evaluate(() => {
      const leaf = [...document.querySelectorAll("*")]
        .filter((n) => n.children.length === 0 && n.textContent.trim() === "Ready to print")
        .pop();
      if (!leaf) return null;
      let bar = leaf;
      while (bar && bar.getBoundingClientRect().width < 300) bar = bar.parentElement;
      return bar ? Math.ceil(bar.getBoundingClientRect().bottom) : null;
    });
    if (trayBottom === null) console.log("  note: no print tray found, using full viewport");
    const { width: phoneW, height: phoneH } = page.viewport();
    await page.screenshot({
      path: phoneShot,
      clip: { x: 0, y: 0, width: phoneW, height: Math.min(trayBottom ?? phoneH, phoneH) },
    });

    // 2. The card that recipe becomes.
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 6 });
    await openPrintPreview(page, CAPTION_RECIPE);
    const cardShot = path.join(TMP_DIR, "caption-card.png");
    const card = await page.$(".recipe-page-deck .recipe-card--front");
    if (!card) throw new Error("No card in the print deck — did the queue seed fail?");
    await card.screenshot({ path: cardShot });

    // 3. Same frame as the before/after. Different labels on purpose: the
    //    sheets-vs-card counting belongs to that row, not this one.
    await page.setViewport({ width: 1320, height: 920, deviceScaleFactor: 2 });
    const composed = path.join(TMP_DIR, "pasted-text.html");
    writeFileSync(composed, pairComposition(
      { src: phoneShot, width: 270, frame: "phone", label: "pasted text", sub: "no link needed" },
      { src: cardShot, width: 745, label: "printable card", sub: "the same clean layout", dot: true },
    ));
    await page.goto(`file://${composed}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    return { element: "#frame" };
  },

  "before-after": async (page) => {
    const SHEET_W = 816;   // 8.5in at 96dpi
    const SHEET_H = 1056;  // 11in

    // 1. Render the long page and measure how many sheets it really takes.
    await page.setViewport({ width: SHEET_W, height: SHEET_H, deviceScaleFactor: 2 });
    await page.goto(`file://${path.resolve("scripts/seo-assets/typical-recipe-page.html")}`, {
      waitUntil: "networkidle0",
    });
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const sheets = Math.ceil(pageHeight / SHEET_H);
    const longShot = path.join(TMP_DIR, "long-page.png");
    await page.screenshot({ path: longShot, fullPage: true });
    console.log(`  measured ${sheets} sheets (${pageHeight}px at ${SHEET_H}px/sheet)`);

    // 2. The real card, straight out of the print preview.
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 6 });
    await openPrintPreview(page);
    const cardShot = path.join(TMP_DIR, "card.png");
    const card = await page.$(".recipe-page-deck .recipe-card--front");
    if (!card) throw new Error("No card in the print deck — did the queue seed fail?");
    await card.screenshot({ path: cardShot });

    // 3. Compose the two, in the landing pages' own visual language.
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    // Written to disk rather than passed as a data: URL — a data: document is
    // opaque-origin and silently refuses to load the file:// screenshots, which
    // renders the pile blank and the card as a broken-image icon.
    const composed = path.join(TMP_DIR, "before-after.html");
    writeFileSync(composed, composition(sheets, longShot, cardShot, SHEET_W, SHEET_H));
    await page.goto(`file://${composed}`, { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 400));
    // Element screenshot rather than a computed clip: the frame is authored at
    // an exact square and a clip rectangle kept coming back short.
    return { element: "#frame" };
  },

  "import-modes": async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
    await page.waitForSelector(".rp-import-panel");
    const buttons = await page.$$(".mode-toggle__item");
    for (const button of buttons) {
      const label = await button.evaluate((el) => el.textContent?.trim());
      if (label === "Paste Text") { await button.click(); break; }
    }
    await page.waitForSelector(".rp-import-panel textarea");
    await page.type(
      ".rp-import-panel textarea",
      "Brown Butter Banana Bread\n\n3 ripe bananas, mashed\n1/2 cup brown butter\n3/4 cup brown sugar\n2 eggs\n1 3/4 cups flour\n\nHeat the oven to 350F.\nWhisk the bananas, butter, sugar, and eggs.\nFold in the flour, then pour into a loaf pan.",
      { delay: 0 },
    );
    // Typing leaves the caret at the end, scrolling the box past its first
    // lines; a shot of a half-scrolled field reads as a rendering bug.
    await page.$eval(".rp-import-panel textarea", (el) => {
      el.scrollTop = 0;
      el.blur();
    });
    await new Promise((r) => setTimeout(r, 350));
    return clipTo(page, ".rp-import-panel", 28);
  },
};

const run = Object.entries(SHOTS).filter(([name]) => !ONLY || name === ONLY);
if (run.length === 0) {
  console.error(`Unknown shot "${ONLY}". Known: ${Object.keys(SHOTS).join(", ")}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_DIR, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true });
try {
  for (const [name, capture] of run) {
    const page = await browser.newPage();
    await page.setViewport({ width: 880, height: 1100, deviceScaleFactor: 2 });
    const target = await capture(page);
    const file = path.join(OUT_DIR, `seo-${name}.png`);
    if (target.element) {
      await (await page.$(target.element)).screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, clip: target });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
