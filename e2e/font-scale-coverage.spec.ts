import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";
import { FONT_SCALES } from "../lib/fontScale";

/**
 * Text size moves every text on a recipe page, on every theme and size, cards
 * and cookbook pages alike. print.css scales the shared type variables, so a
 * size written straight into a rule (the headnote's 10pt, a theme's title in
 * its own units) stays put while everything around it grows, and the card
 * reads as broken. This reads each visible text's computed size at Normal and
 * at Biggest (`/print/harness?specimen=1`, app/print/harness/FontSpecimens.tsx)
 * and holds every ratio to the step.
 */

const BIGGEST = FONT_SCALES[FONT_SCALES.length - 1];

/** Every element that draws text of its own, keyed by where it sits and what
    it says, with its computed font size in px. */
async function textSizes(page: Page, font: number, book: boolean): Promise<Record<string, number>> {
  await page.goto(`/print/harness?specimen=1&font=${font}${book ? "&book=1" : ""}`);
  await page.locator("[data-specimens-ready]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page.evaluate(() => {
    const out: Record<string, number> = {};
    for (const specimen of Array.from(document.querySelectorAll<HTMLElement>("[data-specimen]"))) {
      const seen = new Map<string, number>();
      const faces = specimen.querySelectorAll<HTMLElement>(".recipe-card");
      faces.forEach((face, faceIndex) => {
        for (const el of Array.from(face.querySelectorAll<HTMLElement>("*"))) {
          // Theme art drawn in SVG is a picture, not type; it keeps its size.
          if (el.closest("svg")) continue;
          const ownText = Array.from(el.childNodes)
            .filter((n) => n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent ?? "")
            .join("")
            .trim();
          if (!ownText || !el.checkVisibility({ visibilityProperty: true, opacityProperty: false })) continue;
          const base = `${specimen.dataset.specimen}|face${faceIndex}|${el.className}|${ownText}`;
          const n = seen.get(base) ?? 0;
          seen.set(base, n + 1);
          out[`${base}#${n}`] = parseFloat(getComputedStyle(el).fontSize);
        }
      });
    }
    return out;
  });
}

// Computed sizes are the engine's answer to the stylesheet, the same in every
// browser; one is enough.
test.skip(({ browserName }) => browserName !== "chromium", "Chromium only");

for (const book of [false, true]) {
  test(`every text on a ${book ? "cookbook page" : "card"} grows with the text size`, async ({ page }) => {
    test.setTimeout(120_000);
    const normal = await textSizes(page, 1, book);
    const biggest = await textSizes(page, BIGGEST, book);

    expect(Object.keys(normal).length, "texts found").toBeGreaterThan(100);
    expect(Object.keys(biggest).sort(), "the same texts at both sizes").toEqual(Object.keys(normal).sort());

    const wrong = Object.entries(normal)
      .map(([key, px]) => ({ key, ratio: Math.round((biggest[key] / px) * 1000) / 1000 }))
      .filter(({ ratio }) => Math.abs(ratio - BIGGEST) > 0.01);
    expect(wrong, `texts that did not scale by ${BIGGEST}`).toEqual([]);
  });
}
