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

const port = (value: string | undefined, fallback: number) => Number(value) || fallback;

/** Must match firebase.e2e.json, or for the referral preview its own
    firebase.referral-preview.json (other ports, so it can run beside the tests). */
export const FIREBASE_EMULATOR = {
  host: "127.0.0.1",
  authPort: port(process.env.NEXT_PUBLIC_FIREBASE_AUTH_PORT, 9199),
  firestorePort: port(process.env.NEXT_PUBLIC_FIREBASE_FIRESTORE_PORT, 8180),
  storagePort: port(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_PORT, 9299),
  /** CookPilot's callables have no emulator; e2e/stubs/cookpilot.mjs answers them. The
      referral preview moves its own stand-in elsewhere so it can run beside the tests. */
  functionsPort: port(process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_PORT, 3211),
} as const;
