import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./firebase/storage";
import { getFirebaseAuth, firebaseConfigured } from "./firebase/client";
import { fileToCoverBlob } from "./coverPhoto";
import type { CoverConfig, RecipePagePlacement, Section } from "@/types/recipe";

// Cookbook/recipe photos live in Firebase Storage, and only their download URL
// is ever stored in the queue / project meta / saved Firestore doc — never the
// base64 bytes. That's what keeps sessionStorage under its ~5MB cap while
// editing and keeps a saved project's document under Firestore's 1MB limit.
//
// BACKEND RULE (CookPilot's shared Firebase project — not this repo): writes
// under `recipeprinter/photos/**` are allowed for any image under 12MB, with
// public read so the download URL works in the printed/exported book. Callers
// still surface failures (see friendlyPhotoUploadError) in case that rule ever
// regresses or a write is rejected mid-flight.
const PHOTO_ROOT = "recipeprinter/photos";

function currentScope(): string {
  try {
    return getFirebaseAuth().currentUser?.uid ?? "anon";
  } catch {
    return "anon";
  }
}

function newPhotoPath(): string {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${PHOTO_ROOT}/${currentScope()}/${stamp}-${rand}.jpg`;
}

async function uploadBlob(blob: Blob): Promise<string> {
  if (!firebaseConfigured()) {
    throw new Error("Photo uploads are temporarily unavailable.");
  }
  const storage = getFirebaseStorage();
  const objectRef = ref(storage, newPhotoPath());
  await uploadBytes(objectRef, blob, { contentType: blob.type || "image/jpeg" });
  return getDownloadURL(objectRef);
}

/** Downscales an uploaded file and stores it in Firebase Storage; resolves to
    its download URL (what callers persist in place of the image bytes). */
export async function uploadPhotoFile(file: File): Promise<string> {
  return uploadBlob(await fileToCoverBlob(file));
}

export function isDataUrl(value: string | undefined | null): value is string {
  return typeof value === "string" && value.startsWith("data:");
}

/** Uploads an existing `data:` image URL to Storage and returns its download
    URL. Used by the save-time sweep to evict any base64 that slipped into the
    project before it reaches the Firestore document. Non-data inputs (remote
    URLs, empty) are returned unchanged. */
export async function materializeDataUrl(value: string | undefined): Promise<string | undefined> {
  if (!isDataUrl(value)) return value;
  const blob = await (await fetch(value)).blob();
  return uploadBlob(blob);
}

async function materializeCover(cover: CoverConfig | undefined): Promise<CoverConfig | undefined> {
  if (!cover) return cover;
  const imageUrl = await materializeDataUrl(cover.imageUrl);
  const gridImages = cover.gridImages
    ? ((await Promise.all(cover.gridImages.map((g) => materializeDataUrl(g)))).filter(Boolean) as string[])
    : undefined;
  return { ...cover, imageUrl, gridImages };
}

interface ProjectPhotos {
  sections: Section[];
  cover?: CoverConfig;
  backCover?: CoverConfig;
  itemPlacements?: Record<string, RecipePagePlacement>;
}

/**
 * Belt-and-suspenders before a project is written to Firestore: evicts ANY
 * remaining base64 (`data:`) image anywhere in it to Firebase Storage and
 * returns URL-only copies, guaranteeing the saved document never carries image
 * bytes (which would exceed Firestore's 1MB per-doc limit). With the photo
 * entry points already uploading on add, this is normally a fast no-op — it
 * only does work for legacy/edge data URIs. Remote URLs pass through untouched.
 */
export async function materializeProjectPhotos(project: ProjectPhotos): Promise<ProjectPhotos> {
  const [cover, backCover] = await Promise.all([
    materializeCover(project.cover),
    materializeCover(project.backCover),
  ]);

  const sections = await Promise.all(
    project.sections.map(async (section) => ({
      ...section,
      photoUrl: await materializeDataUrl(section.photoUrl),
      items: await Promise.all(
        section.items.map(async (item) =>
          item.recipe && isDataUrl(item.recipe.image)
            ? { ...item, recipe: { ...item.recipe, image: await materializeDataUrl(item.recipe.image) } }
            : item,
        ),
      ),
    })),
  );

  let itemPlacements = project.itemPlacements;
  if (itemPlacements) {
    const entries = await Promise.all(
      Object.entries(itemPlacements).map(
        async ([id, placement]) =>
          [id, { ...placement, heroImageUrl: await materializeDataUrl(placement.heroImageUrl) }] as const,
      ),
    );
    itemPlacements = Object.fromEntries(entries);
  }

  return { sections, cover, backCover, itemPlacements };
}
