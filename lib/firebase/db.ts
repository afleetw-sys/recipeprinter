import {
  connectFirestoreEmulator,
  disableNetwork,
  enableNetwork,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseApp } from "./client";
import { FIREBASE_EMULATOR, useFirebaseEmulators } from "./emulators";
import { firestorePausedForPrint, registerFirestoreNetwork } from "./printPause";

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
    // So a print can close it (lib/firebase/printPause), without the print
    // page having to load Firestore to hold that switch.
    const db = dbInstance;
    registerFirestoreNetwork({ close: () => disableNetwork(db), open: () => enableNetwork(db) });
  }
  return dbInstance;
}

/**
 * Close and reopen Firestore's connection, for one that has stopped answering
 * without dropping (see lib/serverReadDeadline). Firestore cannot tell such a
 * connection apart from a healthy one, so it never replaces it by itself; until
 * now only a reload did. Leaves a print's pause alone: that pause is undone by
 * its own resume.
 */
export function restartFirestoreNetwork(): void {
  if (!dbInstance || firestorePausedForPrint()) return;
  const db = dbInstance;
  void disableNetwork(db)
    .then(() => (firestorePausedForPrint() ? undefined : enableNetwork(db)))
    .catch(() => undefined);
}
