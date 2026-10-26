import type { Page } from "@playwright/test";
import { expect, test } from "./guarded";

/**
 * "Show what's missing" never reaches paper or a PDF. Its prompts (an empty
 * field's "Add servings", a STEPS heading waiting for its first step, the note
 * prompt, an empty cover line) are placeholders for the screen: printed with
 * the reveal on, the card under edit came out of the printer saying "Add
 * servings". So with print media on, every editable page drawn with the
 * reveal on must draw exactly what it draws with the reveal off, on every
 * theme and size, cards and cookbook pages, covers and chapter openers
 * included (`/print/harness?reveal=1`, app/print/harness/RevealSpecimens.tsx).
 */

test.skip(({ browserName }) => browserName !== "chromium", "print media CSS is the same rule in every engine");

/** For each page pair, everything each copy draws in print media: each visible
    element's own text, and each visible field's value, or its placeholder when
    it is empty (the browser draws that too). */
async function printedPairs(page: Page, book: boolean) {
  await page.goto(`/print/harness?reveal=1${book ? "&book=1" : ""}`);
  await page.locator("[data-reveal-specimens-ready]").waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  return page.evaluate(() => {
    const drawn = (root: Element) => {
      const out: string[] = [];
      for (const el of Array.from(root.querySelectorAll<HTMLElement>("*"))) {
        if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
          const shown = el.value || el.placeholder;
          if (shown.trim()) out.push(shown.trim());
          continue;
        }
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join("")
          .trim();
        if (own) out.push(own);
      }
      return out.sort();
    };
    return Array.from(document.querySelectorAll<HTMLElement>("[data-reveal-pair]")).map((pair) => ({
      id: pair.dataset.revealPair!,
      reveal: drawn(pair.querySelector('[data-variant="reveal"]')!),
      plain: drawn(pair.querySelector('[data-variant="plain"]')!),
    }));
  });
}

for (const book of [false, true]) {
  test(`nothing "show what's missing" adds is printed, on ${book ? "cookbook pages" : "cards"}`, async ({ page }) => {
    test.setTimeout(120_000);
    const pairs = await printedPairs(page, book);
    expect(pairs.length, "pages compared").toBeGreaterThan(30);
    // A recipe page always prints its title; an empty back cover may rightly
    // print nothing at all.
    expect(
      pairs.filter(({ id }) => /\|(empty|partial)$/.test(id)).every(({ plain }) => plain.length > 0),
      "every recipe page prints something",
    ).toBe(true);

    const extra = pairs.flatMap(({ id, reveal, plain }) => {
      const left = [...plain];
      return reveal.filter((text) => {
        const i = left.indexOf(text);
        if (i === -1) return true;
        left.splice(i, 1);
        return false;
      }).map((text) => `${id}: "${text}"`);
    });
    expect(extra, "printed only because the reveal was on").toEqual([]);
  });
}
