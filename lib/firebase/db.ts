import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseApp } from "./client";

// Lazy, never initializes Firestore during server prerender (see client.ts).
// App Check is initialized inside getFirebaseApp(), so this Firestore instance
// is already attested by the time it issues a request.
let dbInstance: Firestore | null = null;
export function getDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}
