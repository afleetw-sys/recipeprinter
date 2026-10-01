import {
  connectFirestoreEmulator,
  disableNetwork,
  enableNetwork,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseApp } from "./client";
import { FIREBASE_EMULATOR, useFirebaseEmulators } from "./emulators";

// Lazy, never initializes Firestore during server prerender (see client.ts).
// App Check is initialized inside getFirebaseApp(), so this Firestore instance
// is already attested by the time it issues a request.
let dbInstance: Firestore | null = null;
export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseApp());
    if (useFirebaseEmulators) {
      connectFirestoreEmulator(dbInstance, FIREBASE_EMULATOR.host, FIREBASE_EMULATOR.firestorePort);
    }
  }
  return dbInstance;
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
  if (!dbInstance) return;
  if (pendingResume !== null) {
    // A resume asked for in this same task (the click let go of the press,
    // then went on to print): cancel it rather than reopen and close again.
    clearTimeout(pendingResume);
    pendingResume = null;
  }
  if (!paused) {
    paused = true;
    void disableNetwork(dbInstance).catch(() => undefined);
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
  if (!dbInstance || !paused || pendingResume !== null) return;
  pendingResume = setTimeout(() => {
    pendingResume = null;
    if (printPauseCap !== null) clearTimeout(printPauseCap);
    printPauseCap = null;
    paused = false;
    if (dbInstance) void enableNetwork(dbInstance).catch(() => undefined);
  }, 0);
}
