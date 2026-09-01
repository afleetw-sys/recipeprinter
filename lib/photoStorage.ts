import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage } from "./firebase/storage";
import { getFirebaseAuth, firebaseConfigured } from "./firebase/client";
import { fileToCoverBlob } from "./coverPhoto";
import type { CoverConfig, RecipePagePlacement, Section } from "@/types/recipe";
import { localStore } from "@/lib/storage";
import {
  recipePrinterAnonymousPhotoRoot,
  recipePrinterUserPhotoRoot,
} from "./firebase/recipePrinterPaths";

// Cookbook/recipe photos live in Firebase Storage, and only their download URL
// is ever stored in the queue / project meta / saved Firestore doc — never the
// base64 bytes. That's what keeps sessionStorage under its ~5MB cap while
// editing and keeps a saved project's document under Firestore's 1MB limit.
//
// Storage rules keep signed-in uploads under their UID and anonymous uploads
// under a browser-owned capability prefix. Images remain publicly readable so
// saved books and print/export URLs continue to render.
export const ANONYMOUS_OWNER_STORAGE_KEY = "recipeprinter:anonymous-owner:v1";

export function anonymousOwnerId(): string {
  const existing = localStore.get(ANONYMOUS_OWNER_STORAGE_KEY);
  if (existing) return existing;
  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  localStore.set(ANONYMOUS_OWNER_STORAGE_KEY, next);
  return next;
}

function currentRoot(): string {
  try {
    const uid = getFirebaseAuth().currentUser?.uid;
    return uid
      ? recipePrinterUserPhotoRoot(uid)
      : recipePrinterAnonymousPhotoRoot(anonymousOwnerId());
  } catch {
    return recipePrinterAnonymousPhotoRoot(anonymousOwnerId());
  }
}

function newPhotoPath(): string {
  const stamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 10);
  return `${currentRoot()}/${stamp}-${rand}.jpg`;
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

/**
 * An image that only exists in this browser: base64 bytes inline (`data:`), or
 * a blob URL pointing at something we are holding locally and haven't uploaded
 * (a Paprika photo — see lib/localPhotos.ts).
 *
 * Both are broken data in a saved document. A data URL blows Firestore's 1MB
 * per-document limit; a blob URL is worse, because it *looks* like a URL and
 * then resolves to nothing the moment the document that minted it is gone —
 * on another device, in the PDF renderer, in next week's tab.
 */
export function isLocalImage(value: string | undefined | null): value is string {
  return typeof value === "string" && (value.startsWith("data:") || value.startsWith("blob:"));
}

/** Uploads a browser-local image URL to Storage and returns its download URL.
    Used by the save-time sweep to evict anything that would not survive the
    trip into a Firestore document. Remote URLs and empties pass through. */
export async function materializeDataUrl(value: string | undefined): Promise<string | undefined> {
  if (!isLocalImage(value)) return value;
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
        section.items.map(async (item) => {
          if (!item.recipe || !isLocalImage(item.recipe.image)) return item;
          const image = await materializeDataUrl(item.recipe.image);
          // The photo is in Storage now, so the local copy stops being the
          // source: leaving `localPhotoId` on the saved item would have a
          // later hydration replace this real URL with a browser-only one.
          const { localPhotoId: _uploaded, ...uploadedItem } = item;
          return { ...uploadedItem, recipe: { ...item.recipe, image } };
        }),
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
