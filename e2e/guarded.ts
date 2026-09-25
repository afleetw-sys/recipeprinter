import { expect, test as base } from "@playwright/test";

/**
 * `test`, with two guarantees checked after every test:
 *
 * - the page threw no uncaught error, which is how a crash that the UI papers
 *   over (an error boundary, a retry) still fails the test;
 * - the browser never contacted anything but localhost. The test server has
 *   the real Firebase, RevenueCat, CookPilot and analytics settings blanked
 *   (playwright.config.ts); this is what proves a change hasn't started
 *   reaching a real service anyway.
 */
export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use) => {
      const pageErrors: string[] = [];
      const external = new Set<string>();
      page.on("pageerror", (error) => pageErrors.push(error.message));
      page.on("request", (request) => {
        const { hostname, protocol } = new URL(request.url());
        if (protocol.startsWith("http") && hostname !== "127.0.0.1" && hostname !== "localhost") {
          external.add(hostname);
        }
      });
      await use();
      expect(pageErrors, "uncaught errors on the page").toEqual([]);
      expect(Array.from(external), "requests that left localhost").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
