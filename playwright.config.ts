import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

/**
 * Browser tests: the app driven the way a person (or the PDF renderer) drives
 * it, in a real Chromium. Run with `npm run test:e2e`.
 *
 * Always against localhost, never a deployed site. Analytics only starts on the
 * production hostnames (lib/appEnvironment.ts), so nothing here can reach
 * PostHog.
 *
 * CI serves a production build, so the test sees what ships; locally it uses
 * the dev server so a run starts in seconds. Its own port and build directory,
 * so it never collides with a dev server already running on :3000.
 */
const PORT = 3210;
const STUB_PORT = 3211;
const ci = Boolean(process.env.CI);
const PARSER_SECRET = "e2e-parser-secret";

/**
 * Local Firebase emulators (firebase.e2e.json), under a `demo-` project id:
 * Firebase guarantees a demo project never reaches a real one. Firestore and
 * Storage run on the JVM, so without Java (a laptop may not have it) only Auth
 * starts; CI installs Java and gets all three.
 */
const EMULATOR_PROJECT = "demo-recipeprinter";
function hasJava(): boolean {
  try {
    execSync("java -version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
const emulators = hasJava() ? "auth,firestore,storage" : "auth";

/** The app's Firebase config for tests: fake keys, the demo project, and the
    flag that points every Firebase client at the emulators above. */
const firebaseTestEnv = {
  NEXT_PUBLIC_FIREBASE_EMULATORS: "1",
  NEXT_PUBLIC_FIREBASE_API_KEY: "e2e-fake-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "127.0.0.1",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: EMULATOR_PROJECT,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${EMULATOR_PROJECT}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:e2e",
};

/**
 * Every setting in `.env.local` blanked. That file holds the REAL Firebase
 * project, RevenueCat key, CookPilot parser (which bills a scraper) and PDF
 * renderer; Next never overrides a variable that is already defined, so an
 * empty one here keeps each of them out of the test server. Tests add back
 * only the local stand-ins they need, below.
 */
function blankedLocalEnv(): Record<string, string> {
  if (!existsSync(".env.local")) return {};
  const names = readFileSync(".env.local", "utf8").match(/^[A-Z0-9_]+(?==)/gm) ?? [];
  return Object.fromEntries(names.map((name) => [name, ""]));
}

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
  webServer: [
    {
      command:
        `npx -y firebase-tools@14.27.0 emulators:start --config firebase.e2e.json ` +
        `--only ${emulators} --project ${EMULATOR_PROJECT}`,
      url: "http://127.0.0.1:9199",
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `node e2e/stubs/cookpilot.mjs`,
      url: `http://127.0.0.1:${STUB_PORT}/health`,
      env: { COOKPILOT_STUB_PORT: String(STUB_PORT), RECIPEPRINTER_PARSER_SECRET: PARSER_SECRET },
      // Never reused: only this process may answer as "CookPilot".
      reuseExistingServer: false,
    },
    {
      command: ci
        ? `NEXT_DIST_DIR=.next-e2e npx next build && NEXT_DIST_DIR=.next-e2e npx next start -p ${PORT}`
        : `NEXT_DIST_DIR=.next-e2e npx next dev -p ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      env: {
        ...blankedLocalEnv(),
        ...firebaseTestEnv,
        COOKPILOT_RECIPE_PARSER_URL: `http://127.0.0.1:${STUB_PORT}/parse-url`,
        COOKPILOT_SUPPLIED_HTML_PARSER_URL: `http://127.0.0.1:${STUB_PORT}/parse-html`,
        RECIPEPRINTER_PARSER_SECRET: PARSER_SECRET,
      },
      // Never reused: a server started some other way would carry the real
      // settings from .env.local, and an import test would bill the real parser.
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
