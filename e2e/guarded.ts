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
      page.on("pageerror", (error) => {
        // WebKit reports Firestore's open listen channel, cancelled by a
        // reload or navigation, as an uncaught error. It is the page going
        // away, not a fault in it.
        if (/Firestore\/Listen\/channel.*due to access control checks/.test(error.message)) return;
        // A browser warning (WebKit raises it as an error) that a resize
        // callback changed layout again; nothing failed.
        if (error.message.startsWith("ResizeObserver loop")) return;
        pageErrors.push(error.message);
      });
      // Firestore's network layer (the WebChannel it reaches the emulator
      // through) checks whether the internet is up by loading this pixel when
      // a request to the emulator stumbles. It is the SDK, not the app, and it
      // is blocked here so a slow runner can't send it out.
      const FIRESTORE_CONNECTIVITY_PROBE = /^https:\/\/www\.google\.com\/images\/cleardot\.gif/;
      await page.route(FIRESTORE_CONNECTIVITY_PROBE, (route) => route.abort());
      page.on("request", (request) => {
        if (FIRESTORE_CONNECTIVITY_PROBE.test(request.url())) return;
        const { hostname, protocol } = new URL(request.url());
        if (protocol.startsWith("http") && hostname !== "127.0.0.1" && hostname !== "localhost") {
          external.add(hostname);
        }
      });
      // /api/parse allows 30 imports per caller per 10 minutes, and every
      // test's browser is the same caller. Each test gets its own address, so
      // the suite can grow without its tests using up one shared budget.
      const caller = `10.${randomOctet()}.${randomOctet()}.${randomOctet()}`;
      await page.route("**/api/parse", (route) =>
        route.continue({ headers: { ...route.request().headers(), "x-forwarded-for": caller } }),
      );
      await use();
      expect(pageErrors, "uncaught errors on the page").toEqual([]);
      expect(Array.from(external), "requests that left localhost").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

const randomOctet = () => Math.floor(Math.random() * 256);
