/**
 * Browser tests point the app at local Firebase emulators instead of a real
 * project (see playwright.config.ts and firebase.e2e.json). Only the test
 * server sets this; a deployed build never does, so every branch that reads it
 * is dead code in production.
 */
export const useFirebaseEmulators = process.env.NEXT_PUBLIC_FIREBASE_EMULATORS === "1";

/**
 * Local testing of the import allowance with a real sign-in: ONLY the callable
 * functions go to a local stand-in (`functionsPort` below), while Auth,
 * Firestore and Storage stay on the real project. That way someone can sign in
 * with their own account on localhost and still exercise the limit against a
 * private backend, without the real meter ever hearing about it. Set by hand
 * for a local dev server; a deployed build never sets it.
 */
export const useLocalFunctions =
  useFirebaseEmulators || process.env.NEXT_PUBLIC_FIREBASE_LOCAL_FUNCTIONS === "1";

/** Must match firebase.e2e.json. */
export const FIREBASE_EMULATOR = {
  host: "127.0.0.1",
  authPort: 9199,
  firestorePort: 8180,
  storagePort: 9299,
  /** CookPilot's callables have no emulator; e2e/stubs/cookpilot.mjs answers them. */
  functionsPort: 3211,
} as const;
