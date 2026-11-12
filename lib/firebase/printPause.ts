/**
 * Firestore's connection closed for the moment Safari's `print()` needs the
 * page quiet, and reopened as soon as the print is under way.
 *
 * Kept apart from lib/firebase/db.ts so the print page can hold these without
 * the Firestore SDK (about 90 kB gzipped) in its first load: a cook who never
 * signs in never needs it, and there is nothing to close until something has
 * started Firestore. `getDb` registers the connection here when it does.
 */

interface FirestoreNetwork {
  close(): Promise<void>;
  open(): Promise<void>;
}

let network: FirestoreNetwork | null = null;

/** Called once by `getDb`, with the connection it just started. */
export function registerFirestoreNetwork(started: FirestoreNetwork): void {
  network = started;
}

/** Whether a print has the connection closed (lib/firebase/db's restart leaves it alone then). */
export function firestorePausedForPrint(): boolean {
  return paused;
}

/** Longest Firestore stays closed for a print that never starts. */
const PRINT_PAUSE_CAP_MS = 10_000;
let paused = false;
let printPauseCap: ReturnType<typeof setTimeout> | null = null;
let pendingResume: ReturnType<typeof setTimeout> | null = null;

/**
 * Close Firestore's connection so Safari will open the print dialog now.
 *
 * WebKit's `window.print()` does nothing while the page has any request still
 * loading; it waits for the last one to finish and prints then
 * (`m_shouldPrintWhenFinishedLoading` in LocalDOMWindow). Chrome has no such
 * wait. After any read or write, Firestore keeps a streaming `Listen/channel`
 * fetch open until it has been idle for 60 seconds, so a signed-in cook's Print
 * click sat behind it for whatever was left of that minute, usually 20 seconds
 * or more. Measured 2026-10-01 in WKWebView on the real /print page: 54.1 s
 * with the stream open, 0.15 s with it closed first.
 *
 * Synchronous on purpose: `print()` must stay inside the click (see
 * lib/printGesture), so nothing may be awaited before it. Closing takes a few
 * ms, which is why the Print button calls this on pointerdown, a task ahead of
 * its click. Writes made while closed queue locally and go out on resume.
 * Never starts Firestore just to close it.
 */
export function pauseFirestoreForPrint(): void {
  if (!network) return;
  if (pendingResume !== null) {
    // A resume asked for in this same task (the click let go of the press,
    // then went on to print): cancel it rather than reopen and close again.
    clearTimeout(pendingResume);
    pendingResume = null;
  }
  if (!paused) {
    paused = true;
    void network.close().catch(() => undefined);
  }
  if (printPauseCap !== null) clearTimeout(printPauseCap);
  printPauseCap = setTimeout(resumeFirestoreAfterPrint, PRINT_PAUSE_CAP_MS);
}

/**
 * Undo `pauseFirestoreForPrint`. Safe to call when nothing is paused.
 *
 * Reopens a task later, so a pause in the same task wins: a Print click
 * resumes for every outcome, and the one that goes on to print re-pauses.
 * Reads made while closed fail as offline, so anything that is not a print
 * should not leave it closed for long.
 */
export function resumeFirestoreAfterPrint(): void {
  if (!network || !paused || pendingResume !== null) return;
  pendingResume = setTimeout(() => {
    pendingResume = null;
    if (printPauseCap !== null) clearTimeout(printPauseCap);
    printPauseCap = null;
    paused = false;
    if (network) void network.open().catch(() => undefined);
  }, 0);
}
