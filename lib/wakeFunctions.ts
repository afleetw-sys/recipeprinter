import { isProductionRuntime } from "@/lib/appEnvironment";

/**
 * Starting CookPilot's functions before a cook needs them.
 *
 * At a few imports a day Google shuts each function down between uses, and the
 * next call waits for it to start: the import meter 3.9s at the median for a
 * cook's first import of a visit, the link parser 2.7s and the photo parser
 * 4.3s, against well under half a second once running (PostHog and timings,
 * 2026-11-02). An import box wakes them as it shows and when it's touched.
 *
 * A wake-up is a bare POST with no App Check token or parser secret, so each
 * function turns it away before any of its own code runs: nothing is read,
 * written, fetched or counted, but the instance has started. Plain text, so the
 * browser sends it without a CORS preflight, and `no-cors`, so the refusal is
 * never read.
 */

/**
 * How long a wake-up counts for. Google shuts a function down after about 15
 * idle minutes; waking it again sooner is a wasted request, later a cold start.
 */
const WARM_FOR_MS = 5 * 60 * 1000;
const wokenAt = new Map<string, number>();

export function wakeFunction(name: string, nowMs: number = Date.now()): void {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return;
  const last = wokenAt.get(name);
  if (last !== undefined && nowMs - last < WARM_FOR_MS) return;
  wokenAt.set(name, nowMs);
  const region = process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1";
  try {
    void fetch(`https://${region}-${projectId}.cloudfunctions.net/${name}`, {
      method: "POST",
      mode: "no-cors",
      keepalive: true,
      body: "{}",
    }).catch(() => {});
  } catch {
    /* Nothing depends on it. */
  }
}

/**
 * The parsers a card import reaches first: the link parser behind
 * `/api/parse`, and the photo parser. Only from the real site, whose imports
 * are the ones a cook waits on.
 */
export function warmImportParsers(nowMs: number = Date.now()): void {
  if (!isProductionRuntime()) return;
  wakeFunction("recipePrinterParseRecipeFromURL", nowMs);
  wakeFunction("parseRecipeFromImages", nowMs);
}

/**
 * The two functions behind signing in with an emailed code. Cold, the code
 * check took 4.6s and the send 2.6s, against 0.15s running (2026-11-04), and
 * the check is what someone waits on after typing the code: 4 to 13 seconds
 * in PostHog. Woken as the sign-in form shows, and the check again when the
 * code screen does, so both are up by the time anyone presses a button.
 */
export function warmEmailCodeSignIn(nowMs: number = Date.now()): void {
  if (!isProductionRuntime()) return;
  wakeFunction("recipePrinterEmailCodeSend", nowMs);
  wakeFunction("recipePrinterEmailCodeVerify", nowMs);
}

export function warmEmailCodeCheck(nowMs: number = Date.now()): void {
  if (!isProductionRuntime()) return;
  wakeFunction("recipePrinterEmailCodeVerify", nowMs);
}

export function resetWokenFunctionsForTest(): void {
  wokenAt.clear();
}
