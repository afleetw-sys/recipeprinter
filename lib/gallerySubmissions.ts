"use client";

import { track } from "@/lib/analytics";
import { fileToCoverBlob } from "@/lib/coverPhoto";
import { uid } from "@/lib/ids";
import {
  RECIPE_PRINTER_GALLERY_SUBMISSIONS_PATH,
  RECIPE_PRINTER_GALLERY_SUBMISSIONS_STORAGE_ROOT,
} from "@/lib/firebase/recipePrinterPaths";

/**
 * "Add yours", on the homepage's "Fresh off the printer" strip.
 *
 * The 2026-09-10 removal of the old mailto version (see the comment on
 * `PHOTOS` in lib/communityGallery.ts) argued that a submission belongs on
 * email, so there is always an identifiable sender behind a photo of someone's
 * kitchen. This keeps that shape without the mailto: the photo and the doc
 * describing it are both WRITE-ONLY from the browser (see firestore.rules /
 * storage.rules — `allow read: if false` on both), so nothing submitted here
 * can be read back by any client, ever. Reviewing one means opening the
 * Firebase console, same as `lib/feedback.ts`. Approving one still means
 * adding it to `lib/communityGallery.ts` by hand, same as every photo
 * already there — this only replaces the inbox, not the curation.
 */
export interface GallerySubmissionInput {
  email?: string;
  photo: File;
}

export async function submitGalleryPhoto(input: GallerySubmissionInput): Promise<void> {
  const [
    { addDoc, collection, serverTimestamp },
    { getDb },
    { getFirebaseStorage },
    { ref, uploadBytes },
  ] = await Promise.all([
    import("firebase/firestore"),
    import("@/lib/firebase/db"),
    import("@/lib/firebase/storage"),
    import("firebase/storage"),
  ]);

  // Same downscale/re-encode every other hand-picked photo in the app gets
  // (see lib/photoStorage.ts) — a phone photo can otherwise sit well past the
  // Storage rule's 12MB cap before it is even resized.
  const blob = await fileToCoverBlob(input.photo);
  const imagePath = `${RECIPE_PRINTER_GALLERY_SUBMISSIONS_STORAGE_ROOT}/${uid()}.jpg`;
  await uploadBytes(ref(getFirebaseStorage(), imagePath), blob, {
    contentType: "image/jpeg",
  });

  await addDoc(collection(getDb(), ...RECIPE_PRINTER_GALLERY_SUBMISSIONS_PATH), {
    email: input.email || null,
    imagePath,
    status: "new",
    source: "fresh-off-the-printer",
    createdAt: serverTimestamp(),
  });

  track("gallery_photo_submitted", {});
}
