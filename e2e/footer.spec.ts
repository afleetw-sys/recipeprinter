import { expect, test } from "./guarded";

/**
 * The footer is the bottom of the page, never a band floating halfway up the
 * window because the page above it was short. A window this tall is taller
 * than most of these pages, which is the case that used to float.
 */
test.use({ viewport: { width: 1280, height: 2000 } });

const PAGES = ["/", "/account", "/projects", "/about", "/faq", "/how-it-works", "/features", "/privacy", "/terms"];

test("the footer reaches the bottom of the window on every page, however short", async ({ context }) => {
  for (const path of PAGES) {
    // A tab each: the homepage and /account both replace their own URL once
    // they settle, and in WebKit that cuts off a goto made in the same tab.
    const tab = await context.newPage();
    await tab.goto(path);
    const footer = tab.locator("footer").last();
    await expect(footer, path).toBeVisible();
    const gap = await footer.evaluate((el) => window.innerHeight - el.getBoundingClientRect().bottom);
    expect(gap, `${path}: space under the footer`).toBeLessThanOrEqual(1);
    await tab.close();
  }
});
