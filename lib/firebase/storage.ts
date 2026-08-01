import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getFirebaseApp } from "./client";

// Lazy, never initializes Storage during server prerender (see client.ts).
// App Check is initialized inside getFirebaseApp(), so SDK Storage calls
// (uploadBytes/getDownloadURL) are attested — note that `<img>` loads of a
// download URL are plain browser GETs and can't be (see appCheck.ts).
let storageInstance: FirebaseStorage | null = null;
export function getFirebaseStorage(): FirebaseStorage {
  if (!storageInstance) storageInstance = getStorage(getFirebaseApp());
  return storageInstance;
}
