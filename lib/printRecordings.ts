/**
 * What real browsers did when Print was pressed, recorded on 2026-10-09.
 *
 * Each recording is the page-visible events in the order and at the times
 * they happened, in ms after the press, from a probe page that logs them
 * without touching the network mid-print. `return` is when `print()` gave
 * control back; anything timed before it happened INSIDE `print()`.
 *
 * These are observations, not guesses: add one by recording a browser, never
 * by reasoning about one. lib/printAttempt.test.ts replays every recording
 * through lib/printAttempt. To record: serve the probe, open it in the
 * browser, press Print, read its log (for an iPhone app's print code, see
 * tools/ios-print-harness; for Android, the emulator in ~/Library/Android).
 */

export type RecordedEvent = "beforeprint" | "afterprint" | "blur" | "focus" | "return";

export interface PrintRecording {
  name: string;
  /** Browser, version, device, and how the run went. */
  source: string;
  steps: Array<[at: number, event: RecordedEvent]>;
  /** `print()` threw this instead of returning. */
  throws?: string;
  /** When the dialog was on screen, by the tester's eye or the OS: [from, to]
      ms after the press. `to` is null where nothing marks the close. */
  dialogOnScreen: [from: number, to: number | null] | null;
}

export const printRecordings: PrintRecording[] = [
  {
    name: "Chrome 154, Mac",
    source: "Mac, Chrome 154.0, real browser; Print then Cancel after ~4.7s",
    steps: [
      [3, "beforeprint"],
      [4691, "afterprint"],
      [4691, "return"],
    ],
    dialogOnScreen: [3, 4691],
  },
  {
    name: "Safari 26.6, Mac, nothing loading",
    source: "Mac, Safari 26.6.2, real browser; Print then Cancel",
    steps: [
      [74, "beforeprint"],
      [2535, "return"],
      [2535, "afterprint"],
    ],
    dialogOnScreen: [74, 2535],
  },
  {
    name: "Safari 26.6, Mac, an image still loading",
    source:
      "Mac, Safari 26.6.2, real browser; Print while a 6s image loads: print() returned at once, dialog came 1.8s later, Cancel",
    steps: [
      [1, "return"],
      [1843, "beforeprint"],
      [5115, "afterprint"],
    ],
    dialogOnScreen: [1843, 5115],
  },
  {
    name: "Chrome 155, Android",
    source: "Pixel 8 emulator, Android 16, Chrome 155.0.8059.39; Print then back after ~3s",
    steps: [
      [3, "beforeprint"],
      [3080, "afterprint"],
      [3080, "return"],
    ],
    dialogOnScreen: [3, 3080],
  },
  {
    name: "Samsung Internet 30, Android",
    source:
      "Pixel 8 emulator, Android 16, Samsung Internet 30.0.5.24 (Chrome 143 engine); Print then back after ~3s",
    steps: [
      [9, "beforeprint"],
      [54, "afterprint"],
      [54, "return"],
      [58, "blur"],
      [305, "beforeprint"],
      [383, "afterprint"],
      [3292, "focus"],
    ],
    dialogOnScreen: [58, 3292],
  },
  {
    name: "Chrome 133, Android",
    source: "Pixel 8 emulator, Android 16, Chrome 133.0.6943.137 (before the Chrome 151 print change); Print then back",
    steps: [
      [1, "beforeprint"],
      [17, "afterprint"],
      [18, "return"],
      [23, "blur"],
      [862, "beforeprint"],
      [998, "afterprint"],
      [3402, "focus"],
    ],
    dialogOnScreen: [23, 3402],
  },
  {
    name: "Firefox 157, Android",
    source: "Pixel 8 emulator, Android 16, Firefox 157.0.1; Print then back (the page never loses focus)",
    steps: [
      [11, "beforeprint"],
      [14, "afterprint"],
      [45, "return"],
    ],
    dialogOnScreen: [45, null],
  },
  {
    name: "Safari, iPhone, iOS 17.5",
    source: "iPhone 15 simulator, iOS 17.5, Safari; first print of the tab",
    steps: [
      [1, "return"],
      [214, "beforeprint"],
      [313, "afterprint"],
    ],
    dialogOnScreen: [214, null],
  },
  {
    name: "Safari, iPhone, iOS 26.5",
    source: "iPhone 17 Pro simulator, iOS 26.5, Safari; first print of the tab; sheet seen within 0.5s",
    steps: [
      [320, "return"],
      [322, "beforeprint"],
      [502, "afterprint"],
    ],
    dialogOnScreen: [322, null],
  },
  {
    name: "Safari, iPhone, second print, Allow",
    source:
      "iPhone 15 simulator, iOS 17.5, Safari; second print of the tab: 'blocked from automatically printing' alert, Allow tapped after ~12s",
    steps: [
      [38, "return"],
      [39, "blur"],
      [12266, "focus"],
      [12275, "beforeprint"],
      [12323, "afterprint"],
    ],
    dialogOnScreen: [12275, null],
  },
  {
    name: "Safari, iPhone, second print, Ignore",
    source:
      "iPhone 15 simulator, iOS 17.5, Safari; second print of the tab: 'blocked from automatically printing' alert, Ignore tapped after ~68s",
    steps: [
      [37, "return"],
      [38, "blur"],
      [68277, "focus"],
    ],
    // Safari's alert, not a print dialog: up from the blur until the focus.
    dialogOnScreen: [38, 68277],
  },
  {
    name: "Safari, iPhone, second print, quick Ignore",
    source:
      "iPhone 15 simulator, iOS 17.5, Safari; 'blocked from automatically printing' alert, Ignore tapped after ~2s",
    steps: [
      [32, "return"],
      [32, "blur"],
      [2072, "focus"],
    ],
    dialogOnScreen: [32, 2072],
  },
  {
    name: "Firefox's print code, iPhone",
    source:
      "iPhone 15 simulator, iOS 17.5, tools/ios-print-harness in firefox mode (Firefox's open-source print bridge)",
    steps: [
      [3, "return"],
      [183, "beforeprint"],
      [332, "afterprint"],
    ],
    dialogOnScreen: [183, null],
  },
  {
    name: "Google app, iPhone",
    source: "Real iPhone, iOS 26.6.2, Google app 441.5; /print-check button 1",
    steps: [],
    throws: "undefined is not an object (evaluating 'window.webkit.messageHandlers.print.postMessage')",
    dialogOnScreen: null,
  },
];
