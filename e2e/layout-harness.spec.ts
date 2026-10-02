import { expect, test } from "./guarded";

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
 * Not on every pull request: a full sweep takes minutes. The Layout workflow
 * runs it nightly and on any change to the cards, the themes or the engine.
 * Locally: `npm run test:layout`.
 */

const SCALES = [1, 0.47, 1.4];

interface HarnessReport {
  complete: boolean;
  envHealthy: boolean;
  renderScale: number;
  summary: Record<string, number>;
  inv1Failures: { id: string; overflowPx: number }[];
  structuralFailures: { id: string; incomplete: boolean; emptyFace: boolean; outOfOrder: boolean }[];
  timedOut: string[];
}

const report = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const harness = (window as unknown as { __layoutHarness?: HarnessReport }).__layoutHarness;
    if (!harness) return null;
    const { complete, envHealthy, renderScale, summary, inv1Failures, structuralFailures, timedOut } = harness;
    return { complete, envHealthy, renderScale, summary, inv1Failures, structuralFailures, timedOut };
  });

for (const scale of SCALES) {
  test(`every recipe fits its card, rendered at ${scale}×`, async ({ page }, testInfo) => {
    test.setTimeout(20 * 60_000);
    await page.goto(`/print/harness?scale=${scale}`);

    // The harness refuses to run when print.css hasn't applied, because every
    // face would then measure as fitting and the sweep would pass on nothing.
    await expect.poll(async () => (await report(page))?.envHealthy, { timeout: 30_000 }).toBe(true);
    await expect.poll(async () => (await report(page))?.renderScale).toBe(scale);

    await page.getByRole("button", { name: "Run all" }).click();
    await expect
      .poll(async () => (await report(page))?.complete, { timeout: 18 * 60_000, intervals: [2_000] })
      .toBe(true);

    const result = (await report(page))!;
    await testInfo.attach(`layout-${scale}x.json`, {
      body: JSON.stringify(result, null, 2),
      contentType: "application/json",
    });

    expect(result.summary.total, "combos measured").toBeGreaterThan(0);
    expect(result.timedOut, "combos the corrector never settled").toEqual([]);
    expect(result.inv1Failures, "combos whose text runs off the card").toEqual([]);
    expect(result.structuralFailures, "combos missing a line, with a blank face, or out of order").toEqual([]);
  });
}
