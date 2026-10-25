import { expect, test } from "./guarded";
import { DEFAULT_FONT_SCALE, FONT_SCALES, type FontScale } from "../lib/fontScale";

/**
 * Every fixture recipe, on every theme, at both card sizes, with and without a
 * photo and a source link: nothing falls off the card, nothing goes missing,
 * no face comes out blank, ingredients stay ahead of the method, and the
 * corrector always settles. It is the sweep `/print/harness` runs by hand
 * (app/print/harness/README.md), which only ever caught anything on the days
 * somebody remembered to open it.
 *
 * At more than one render scale, because the live preview never draws a card
 * at 1.0: it shrinks a letter card to about 0.47 to fit the pane and enlarges a
 * 6x4. A measurement that mixes screen px with CSS px agrees with itself at 1.0
 * and nowhere else, which is how a clipped last step once shipped past a
 * harness reading 816/816 (0e97724).
 *
 * At every text size a cook can pick (lib/fontScale.ts), because each one is a
 * different card as far as fitting goes: Biggest is a long recipe on a short
 * card, Smallest is the under-fill case. Every step at 1×; the two extremes at
 * the other render scales, where a step in between can't fail unless one of
 * its neighbours already has. And cookbook pages, which are their own card
 * (book chrome, the preset's sheet), at every text size.
 *
 * Not on every pull request: a full sweep takes minutes. The Layout workflow
 * runs it nightly and on any change to the cards, the themes or the engine,
 * sharded across machines. Locally: `npm run test:layout`, or one run with
 * `npm run test:layout -- -g "1.2"`.
 */

interface Run {
  scale: number;
  font: FontScale;
  book: boolean;
}

const EXTREMES: FontScale[] = [FONT_SCALES[0], DEFAULT_FONT_SCALE, FONT_SCALES[FONT_SCALES.length - 1]];
const RUNS: Run[] = [
  ...FONT_SCALES.map((font) => ({ scale: 1, font, book: false })),
  ...[0.47, 1.4].flatMap((scale) => EXTREMES.map((font) => ({ scale, font, book: false }))),
  ...FONT_SCALES.map((font) => ({ scale: 1, font, book: true })),
];

interface HarnessReport {
  complete: boolean;
  envHealthy: boolean;
  renderScale: number;
  fontScales: number[];
  book: boolean;
  summary: Record<string, number>;
  inv1Failures: { id: string; overflowPx: number }[];
  structuralFailures: { id: string; incomplete: boolean; emptyFace: boolean; outOfOrder: boolean }[];
  timedOut: string[];
}

const report = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const harness = (window as unknown as { __layoutHarness?: HarnessReport }).__layoutHarness;
    if (!harness) return null;
    const { complete, envHealthy, renderScale, fontScales, book, summary, inv1Failures, structuralFailures, timedOut } =
      harness;
    return { complete, envHealthy, renderScale, fontScales, book, summary, inv1Failures, structuralFailures, timedOut };
  });

for (const { scale, font, book } of RUNS) {
  const what = book ? "cookbook page" : "card";
  test(`every recipe fits its ${what} at text size ${font}, rendered at ${scale}×`, async ({ page }, testInfo) => {
    test.setTimeout(20 * 60_000);
    await page.goto(`/print/harness?scale=${scale}&font=${font}${book ? "&book=1" : ""}`);

    // The harness refuses to run when print.css hasn't applied, because every
    // face would then measure as fitting and the sweep would pass on nothing.
    await expect.poll(async () => (await report(page))?.envHealthy, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await report(page))?.renderScale).toBe(scale);
    // A typo'd or dropped parameter would sweep Normal cards and pass.
    expect((await report(page))?.fontScales).toEqual([font]);
    expect((await report(page))?.book).toBe(book);

    await page.getByRole("button", { name: "Run all" }).click();
    await expect
      .poll(async () => (await report(page))?.complete, { timeout: 18 * 60_000, intervals: [2_000] })
      .toBe(true);

    const result = (await report(page))!;
    await testInfo.attach(`layout-${book ? "book-" : ""}f${font}-${scale}x.json`, {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });

    expect(result.summary.total, "combos measured").toBeGreaterThan(0);
    expect(result.timedOut, "combos the corrector never settled").toEqual([]);
    expect(result.inv1Failures, "combos whose text runs off the card").toEqual([]);
    expect(result.structuralFailures, "combos missing a line, with a blank face, or out of order").toEqual([]);
  });
}
