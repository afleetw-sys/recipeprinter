import { expect, type Locator } from "@playwright/test";

/**
 * Waits until React has taken over this element.
 *
 * Every page is server-rendered, so its buttons and fields are visible, and
 * pass Playwright's "actionable" checks, before any JavaScript has run. A click
 * then does nothing, and Enter in a field does the browser's own form submit,
 * which reloads the page. On a fast laptop the gap is too short to notice; on a
 * slow CI runner (the iPhone project especially) it is where tests went red at
 * random. Wait for this instead of retrying an action until it happens to land.
 */
export async function untilHydrated(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps"))), {
      message: "React never took over the element",
    })
    .toBe(true);
}
