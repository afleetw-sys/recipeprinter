import { getFirestore, type Firestore } from "firebase/firestore";
import { getFirebaseApp } from "./client";
import "./appCheck";

// Lazy — never initializes Firestore during server prerender (see client.ts).
let dbInstance: Firestore | null = null;
export function getDb(): Firestore {
  if (!dbInstance) dbInstance = getFirestore(getFirebaseApp());
  return dbInstance;
}
