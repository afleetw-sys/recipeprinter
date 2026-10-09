// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRINT_SPINNER_CAP_MS, runPrintAttempt, type PrintAttemptSummary } from "@/lib/printAttempt";
import { printRecordings, type PrintRecording } from "@/lib/printRecordings";

/**
 * Every recorded real browser, replayed through the Print button's logic.
 *
 * The rule each one must keep: the spinner is up until the cook can see the
 * print dialog, and it does not outlive the dialog. Where nothing marks the
 * dialog closing (iPhone sheets, Firefox on Android), it must be gone by the
 * time the dialog is fully up, since the cook can close it at any moment
 * after that and nothing would tell us.
 */

let clock = 0;
beforeEach(() => {
  vi.useFakeTimers();
  clock = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

/** One frame: a spinner that goes this close to the dialog arriving is not
    seen to go early. */
const FRAME_MS = 16;
/** The settling time the dialog needs to cover the page once it starts. */
const DIALOG_RISE_MS = 600;

function replay(recording: PrintRecording) {
  const ret = recording.steps.find(([, event]) => event === "return")?.[0] ?? 0;
  const inside = recording.steps.filter(([at, event]) => event !== "return" && at <= ret);
  const after = recording.steps.filter(([at, event]) => event !== "return" && at > ret);
  let summary: PrintAttemptSummary | null = null;
  let calls = 0;

  runPrintAttempt({
    now: () => clock,
    print: () => {
      if (recording.throws) throw new TypeError(recording.throws);
      for (const [at, event] of inside) {
        clock = at;
        window.dispatchEvent(new Event(event));
      }
      clock = ret;
    },
    onSpinnerOff: (s) => {
      calls += 1;
      summary ??= s;
    },
  });
  for (const [at, event] of after) {
    vi.advanceTimersByTime(at - clock);
    clock = at;
    window.dispatchEvent(new Event(event));
  }
  vi.advanceTimersByTime(PRINT_SPINNER_CAP_MS + 1_000);
  clock += PRINT_SPINNER_CAP_MS + 1_000;
  return { summary: summary as PrintAttemptSummary | null, calls };
}

describe("the Print spinner, replayed against real browsers", () => {
  for (const recording of printRecordings) {
    it(recording.name, () => {
      const { summary, calls } = replay(recording);
      expect(calls, "spinner turned off exactly once").toBe(1);
      if (!summary) throw new Error("no summary");
      // The cap is for nothing ever happening; a real wait can outlast it.
      const lastEvent = Math.max(0, ...recording.steps.map(([at]) => at));
      if (lastEvent < PRINT_SPINNER_CAP_MS) {
        expect(summary.endedBy, "needed the safety cap").not.toBe("cap");
      }

      if (recording.throws) {
        expect(summary.endedBy).toBe("threw");
        expect(summary.error).toBe(recording.throws);
        return;
      }
      const [shown, closed] = recording.dialogOnScreen ?? [0, null];
      const ret = recording.steps.find(([, event]) => event === "return")?.[0] ?? 0;
      // Up until the dialog can be seen (within a frame).
      expect(summary.spinnerMs, "spinner gone before the dialog appeared").toBeGreaterThanOrEqual(shown - FRAME_MS);
      // And not left spinning once the dialog is there to close.
      const latest = closed ?? shown + DIALOG_RISE_MS;
      expect(summary.spinnerMs, "spinner outlived the dialog").toBeLessThanOrEqual(Math.max(latest, ret));
    });
  }

  it("reports each event once, at its first firing", () => {
    const samsung = printRecordings.find((r) => r.name.startsWith("Samsung"));
    if (!samsung) throw new Error("missing recording");
    const { summary } = replay(samsung);
    expect(summary).toMatchObject({ beforeprintMs: 9, afterprintMs: 54, printReturnedMs: 54 });
  });
});
