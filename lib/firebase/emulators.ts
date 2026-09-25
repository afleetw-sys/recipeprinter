/**
 * Browser tests point the app at local Firebase emulators instead of a real
 * project (see playwright.config.ts and firebase.e2e.json). Only the test
 * server sets this; a deployed build never does, so every branch that reads it
 * is dead code in production.
 */
export const useFirebaseEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";

/** Must match firebase.e2e.json. */
export const FIREBASE_EMULATOR = {
  host: "127.0.0.1",
  authPort: 9199,
  firestorePort: 8180,
  storagePort: 9299,
} as const;
