import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
  signInAnonymously,
  type User,
} from "firebase/auth";

// Initializes the same Firebase project CookPilot uses, so RecipePrinter is a
// genuine second client of CookPilot's backend rather than a reimplementation.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// IndexedDB persistence on the client (matches CookPilot); in-memory on server.
export const auth = (() => {
  if (typeof window === "undefined") return getAuth(app);
  try {
    return initializeAuth(app, { persistence: indexedDBLocalPersistence });
  } catch {
    return getAuth(app);
  }
})();

export const authReady: Promise<void> = auth.authStateReady();

/**
 * CookPilot's parser callables run in the context of an (anonymous) user, just
 * like the CookPilot web app. Sign one in on demand and reuse it.
 */
export async function ensureAnonymousUser(): Promise<User> {
  await authReady;
  if (auth.currentUser) return auth.currentUser;
  const credential = await signInAnonymously(auth);
  return credential.user;
}
