import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  browserPopupRedirectResolver,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  type Auth,
} from "firebase/auth";
import { ensureAppCheck } from "./appCheck";

// Initializes the same Firebase project CookPilot uses, so RecipePrinter is a
// genuine second client of CookPilot's backend rather than a reimplementation.
//
// Everything here is LAZY. Nothing runs at module load, important because Next
// statically prerenders this client tree on the server at build time, where the
// NEXT_PUBLIC_FIREBASE_* values may be absent. Eager init would throw
// `auth/invalid-api-key` during the Vercel build. Init happens on first use,
// which only ever occurs in the browser.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** True when the Firebase web config is present (CookPilot features need it). */
export function firebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let appInstance: FirebaseApp | null = null;
export function getFirebaseApp(): FirebaseApp {
  if (appInstance) return appInstance;
  if (!firebaseConfigured()) {
    throw new Error("Recipe import and account features are temporarily unavailable.");
  }
  appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  // Initialize App Check the moment the app exists, so EVERY service obtained
  // from it — Auth, Firestore, Storage, Functions — has its requests attested.
  // No-ops on the server and after the first call (see `ensureAppCheck`).
  ensureAppCheck(appInstance);
  return appInstance;
}

let authInstance: Auth | null = null;
export function getFirebaseAuth(): Auth {
  if (authInstance) return authInstance;
  const app = getFirebaseApp();
  if (typeof window === "undefined") {
    authInstance = getAuth(app);
    return authInstance;
  }
  try {
    authInstance = initializeAuth(app, {
      persistence: indexedDBLocalPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    });
  } catch {
    authInstance = getAuth(app);
  }
  return authInstance;
}
