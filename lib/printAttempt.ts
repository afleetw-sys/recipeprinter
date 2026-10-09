/**
 * One press of Print: call `print()`, keep the spinner up until the cook can
 * see the print dialog (or is plainly back on the page), and report what
 * happened, once.
 *
 * Every rule here comes from recordings of real browsers pressing Print
 * (lib/printRecordings.ts, 2026-10-09: Chrome and Safari on a Mac; Chrome,
 * a Chrome Custom Tab, Samsung Internet and Firefox on an Android emulator;
 * Safari on the iOS 17.5 and 26.5 simulators; Firefox's iOS print code in
 * tools/ios-print-harness; the Google app on a real iPhone). What they share:
 *
 *  - Most browsers run the whole dialog INSIDE `print()`, firing `beforeprint`
 *    before it returns; Chrome and Mac Safari return only once it has closed.
 *  - iPhone Safari returns first and fires `beforeprint`/`afterprint` just
 *    after, as its sheet slides up; nothing fires when the sheet closes.
 *  - Mac Safari, while anything on the page is still loading, returns at once
 *    with no dialog, and shows it (with `beforeprint`) when loading ends.
 *  - Safari's "blocked from automatically printing" alert on a second iPhone
 *    print takes focus (`blur`) and gives it back (`focus`) on Allow or
 *    Ignore; only Allow is followed by `beforeprint`.
 *  - The Google app's stand-in for `print()` throws.
 *
 * So the spinner goes at the first of:
 *  1. `print()` returned, and `beforeprint` already fired (the dialog has
 *     come, and in most browsers gone);
 *  2. `afterprint`, once `print()` has returned;
 *  3. focus back on the page after losing it, with no dialog following;
 *  4. `print()` throwing;
 *  5. `PRINT_SPINNER_CAP_MS`.
 *
 * Nothing here is per-browser, and every rule is there because a recording
 * fails without it (lib/printAttempt.test.ts). Telemetry rides along and never
 * changes what the button does.
 */

/** Safety net only: no recorded browser needed it. Long, because Mac Safari
    holds its dialog for as long as the page is still loading. */
export const PRINT_SPINNER_CAP_MS = 30_000;
/** After focus returns: Allow on Safari's alert brings `beforeprint` within
    ~10ms (recorded); give it room before reading the focus as Ignore. */
const FOCUS_SETTLE_MS = 300;

export type PrintAttemptEnd =
  | "returned_after_dialog"
  | "afterprint"
  | "focus_returned"
  | "threw"
  | "cap"
  | "left";

export interface PrintAttemptSummary {
  endedBy: PrintAttemptEnd;
  /** How long `print()` held the page. Null if it threw. */
  printReturnedMs: number | null;
  /** When each event first fired, ms after the press. Null if it never did. */
  beforeprintMs: number | null;
  afterprintMs: number | null;
  blurMs: number | null;
  /** How long the spinner was up. */
  spinnerMs: number;
  /** The error a throwing `print()` gave, for naming a broken stand-in. */
  error?: string;
}

export interface PrintAttemptOptions {
  /** Calls the browser's print. Exactly once. */
  print: () => void;
  /** The spinner is done. Called exactly once. */
  onSpinnerOff: (summary: PrintAttemptSummary) => void;
  win?: Window;
  now?: () => number;
}

export interface PrintAttempt {
  /** The page is going away: end now, if not already ended. */
  leave: () => void;
  /** Whether `print()` threw, so the caller can try another way. */
  threw: unknown | null;
}

export function runPrintAttempt({
  print,
  onSpinnerOff,
  win = window,
  now = () => performance.now(),
}: PrintAttemptOptions): PrintAttempt {
  const startedAt = now();
  const since = () => Math.round(now() - startedAt);
  let returnedMs: number | null = null;
  let beforeprintMs: number | null = null;
  let afterprintMs: number | null = null;
  let blurMs: number | null = null;
  let ended = false;
  const timers: number[] = [];

  function end(endedBy: PrintAttemptEnd, error?: string) {
    if (ended) return;
    ended = true;
    timers.forEach((timer) => win.clearTimeout(timer));
    win.removeEventListener("beforeprint", onBefore);
    win.removeEventListener("afterprint", onAfter);
    win.removeEventListener("blur", onBlur);
    win.removeEventListener("focus", onFocus);
    onSpinnerOff({
      endedBy,
      printReturnedMs: returnedMs,
      beforeprintMs,
      afterprintMs,
      blurMs,
      spinnerMs: since(),
      ...(error ? { error } : {}),
    });
  }

  function onBefore() {
    beforeprintMs ??= since();
  }
  function onAfter() {
    afterprintMs ??= since();
    if (returnedMs !== null) end("afterprint");
  }
  function onBlur() {
    blurMs ??= since();
  }
  function onFocus() {
    if (blurMs === null || returnedMs === null) return;
    timers.push(
      win.setTimeout(() => {
        if (beforeprintMs === null) end("focus_returned");
      }, FOCUS_SETTLE_MS),
    );
  }

  win.addEventListener("beforeprint", onBefore);
  win.addEventListener("afterprint", onAfter);
  win.addEventListener("blur", onBlur);
  win.addEventListener("focus", onFocus);

  try {
    print();
  } catch (error) {
    end("threw", error instanceof Error ? error.message : String(error));
    return { leave: () => undefined, threw: error ?? new Error("print() threw") };
  }
  returnedMs = since();
  if (beforeprintMs !== null) {
    end("returned_after_dialog");
  } else {
    timers.push(win.setTimeout(() => end("cap"), PRINT_SPINNER_CAP_MS));
  }
  return { leave: () => end("left"), threw: null };
}
