import path from "node:path";
import { expect, test as base } from "@playwright/test";

const PUBLIC_DIR = path.resolve("public");

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
      // next/image's resized copies, answered with the original file from
      // public/ instead of `next start`'s optimizer. The page's markup (srcset,
      // sizes, layout) is still exactly what ships; only the server's resize is
      // skipped, and production never runs that resize anyway: Vercel's own
      // image service does. Next merges every request for one size into the
      // first, so a single resize that never finished on a busy CI runner held
      // every later page that wanted that size, and page.goto waits for the
      // page's images. The phone sizes (w=750 at 3x) were wanted by nothing
      // else, so every iPhone test that opened the homepage at a phone width
      // timed out in a row until the job was cancelled (2026-11-13, run
      // 43536928717). Remote images never come through here (next.config.mjs).
      await page.route(/\/_next\/image\?/, (route) => {
        const source = new URL(route.request().url()).searchParams.get("url") ?? "";
        const file = path.resolve(PUBLIC_DIR, `.${source}`);
        if (!source.startsWith("/") || !file.startsWith(PUBLIC_DIR + path.sep)) return route.continue();
        return route.fulfill({ path: file });
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
