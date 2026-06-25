import { getFunctions, type Functions } from "firebase/functions";
import { getFirebaseApp } from "./client";
import "./appCheck";

// Lazy — never initializes Functions during server prerender (see client.ts).
let functionsInstance: Functions | null = null;
export function getFns(): Functions {
  if (!functionsInstance) {
    functionsInstance = getFunctions(
      getFirebaseApp(),
      process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || "us-central1",
    );
  }
  return functionsInstance;
}
