import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests: the app driven the way a person (or the PDF renderer) drives
 * it, in a real Chromium. Run with `npm run test:e2e`.
 *
 * Always against localhost, never a deployed site. Analytics only starts on the
 * production hostnames (lib/appEnvironment.ts), so nothing here can reach
 * PostHog, and nothing talks to production Firebase, CookPilot or RevenueCat.
 *
 * CI serves a production build, so the test sees what ships; locally it uses
 * the dev server so a run starts in seconds. Its own port and build directory,
 * so it never collides with a dev server already running on :3000.
 */
const PORT = 3210;
const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: ci,
  retries: 0,
  reporter: ci ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: ci
      ? `NEXT_DIST_DIR=.next-e2e npx next build && NEXT_DIST_DIR=.next-e2e npx next start -p ${PORT}`
      : `NEXT_DIST_DIR=.next-e2e npx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !ci,
    timeout: 300_000,
  },
});
