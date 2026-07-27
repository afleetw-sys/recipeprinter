import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFirebaseApp } from "./client";
import "./appCheck";

// Lazy, never initializes Storage during server prerender (see client.ts).
// Only used by the best-effort failed-image debug capture (lib/failedImageCapture.ts).
let storageInstance: FirebaseStorage | null = null;
export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) storageInstance = getStorage(getFirebaseApp());
  return storageInstance;
}
