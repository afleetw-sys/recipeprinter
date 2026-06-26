import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth";

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
    throw new Error(
      "Firebase isn't configured. Set the NEXT_PUBLIC_FIREBASE_* env vars to use CookPilot features.",
    );
  }
  appInstance = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
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
    authInstance = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  } catch {
    authInstance = getAuth(app);
  }
  return authInstance;
}

/**
 * CookPilot parser callables expect an authenticated Firebase context. Use an
 * anonymous session for parser-only imports unless the user is already signed in.
 */
export async function ensureParserUser(): Promise<User> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
