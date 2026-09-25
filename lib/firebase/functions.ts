import { connectFunctionsEmulator, getFunctions, type Functions } from "firebase/functions";
import { getFirebaseApp } from "./client";
import { FIREBASE_EMULATOR, useFirebaseEmulators } from "./emulators";

// Lazy, never initializes Functions during server prerender (see client.ts).
// App Check is initialized inside getFirebaseApp(), so callable requests from
// this instance carry an attestation token.
let functionsInstance: Functions | null = null;
export function getFns(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(
      getFirebaseApp(),
      process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1",
    );
    if (useFirebaseEmulators) {
      connectFunctionsEmulator(functionsInstance, FIREBASE_EMULATOR.host, FIREBASE_EMULATOR.functionsPort);
    }
  }
  return functionsInstance;
}
