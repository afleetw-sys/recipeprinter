"use client";

import { getBlob, getDownloadURL, getMetadata, ref, uploadBytes } from "firebase/storage";
import type { PrintProject } from "@/types/recipe";
import { getFirebaseStorage } from "@/lib/firebase/storage";
import { recipePrinterUserPhotoRoot } from "@/lib/firebase/recipePrinterPaths";
import { localStore } from "@/lib/storage";
import { createPrintProjectId, loadPrintProject, savePrintProject } from "@/lib/printProjects";
import {
  isCookbookProjectUnlocked,
  persistCookbookProjectUnlock,
  transferCookbookProjectUnlockLocal,
} from "@/lib/cookbookUnlocks";

const MANIFEST_KEY = "recipeprinter:anonymous-adoption:v1";

export interface AdoptionManifest {
  sourceProjectId: string;
  destinationProjectId?: string;
  uid: string;
  assets: Record<string, string>;
  status: "pending" | "copying" | "saving" | "failed" | "complete";
  error?: string;
}

export function readAdoptionManifest(): AdoptionManifest | null {
  return localStore.getJson<AdoptionManifest>(MANIFEST_KEY);
}

function writeManifest(manifest: AdoptionManifest) {
  localStore.setJson(MANIFEST_KEY, manifest);
}

function anonymousRecipePrinterAsset(url: string | undefined): url is string {
  if (!url) return false;
  try {
    const decoded = decodeURIComponent(url);
    return (
      decoded.includes("/recipeprinter/photos/anonymous/") ||
      // Compatibility with the original unscoped anonymous prefix.
      decoded.includes("/recipeprinter/photos/anon/")
    );
  } catch {
    return false;
  }
}

function assetUrls(project: PrintProject): string[] {
  const values: Array<string | undefined> = [
    project.cover?.imageUrl,
    project.backCover?.imageUrl,
    ...(project.cover?.gridImages ?? []),
    ...(project.backCover?.gridImages ?? []),
    ...project.sections.flatMap((section) => [
      section.photoUrl,
      ...section.items.map((item) => item.recipe?.image),
    ]),
    ...Object.values(project.itemPlacements ?? {}).map((placement) => placement.heroImageUrl),
  ];
  return Array.from(new Set(values.filter(anonymousRecipePrinterAsset)));
}

function stableName(source: string): string {
  let hash = 2166136261;
  for (let i = 0; i < source.length; i += 1) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(36)}.jpg`;
}

async function copyAsset(
  uid: string,
  projectId: string,
  sourceUrl: string,
  existingDestination?: string,
): Promise<string> {
  const storage = getFirebaseStorage();
  const destinationRef = ref(
    storage,
    `${recipePrinterUserPhotoRoot(uid)}/adopted/${projectId}/${stableName(sourceUrl)}`,
  );
  if (existingDestination) {
    await getMetadata(destinationRef);
    return existingDestination;
  }
  const sourceRef = ref(storage, sourceUrl);
  const [blob, metadata] = await Promise.all([getBlob(sourceRef), getMetadata(sourceRef)]);
  await uploadBytes(destinationRef, blob, {
    contentType: metadata.contentType ?? blob.type ?? "image/jpeg",
  });
  await getMetadata(destinationRef);
  return getDownloadURL(destinationRef);
}

function replaceUrl(value: string | undefined, assets: Record<string, string>) {
  return value ? assets[value] ?? value : value;
}

function rewriteAssets(project: PrintProject, assets: Record<string, string>): PrintProject {
  const rewriteCover = (cover: PrintProject["cover"]) =>
    cover
      ? {
          ...cover,
          imageUrl: replaceUrl(cover.imageUrl, assets),
          gridImages: cover.gridImages?.map((url) => replaceUrl(url, assets) ?? url),
        }
      : cover;
  return {
    ...project,
    cover: rewriteCover(project.cover),
    backCover: rewriteCover(project.backCover),
    sections: project.sections.map((section) => ({
      ...section,
      photoUrl: replaceUrl(section.photoUrl, assets),
      items: section.items.map((item) =>
        item.recipe?.image
          ? { ...item, recipe: { ...item.recipe, image: replaceUrl(item.recipe.image, assets) } }
          : item,
      ),
    })),
    itemPlacements: project.itemPlacements
      ? Object.fromEntries(
          Object.entries(project.itemPlacements).map(([id, placement]) => [
            id,
            { ...placement, heroImageUrl: replaceUrl(placement.heroImageUrl, assets) },
          ]),
        )
      : undefined,
  };
}

export async function adoptAnonymousProject(
  uid: string,
  project: PrintProject,
): Promise<PrintProject> {
  const previous = readAdoptionManifest();
  let destinationProjectId =
    previous?.uid === uid && previous.sourceProjectId === project.id
      ? previous.destinationProjectId
      : undefined;
  if (!destinationProjectId) {
    const collision = await loadPrintProject(uid, project.id);
    destinationProjectId = collision ? createPrintProjectId() : project.id;
  }
  let manifest: AdoptionManifest = {
    sourceProjectId: project.id,
    destinationProjectId,
    uid,
    assets:
      previous?.uid === uid && previous.sourceProjectId === project.id ? previous.assets : {},
    status: "copying",
  };
  writeManifest(manifest);
  try {
    for (const sourceUrl of assetUrls(project)) {
      const destination = await copyAsset(
        uid,
        destinationProjectId,
        sourceUrl,
        manifest.assets[sourceUrl],
      );
      manifest = { ...manifest, assets: { ...manifest.assets, [sourceUrl]: destination } };
      writeManifest(manifest);
    }
    manifest = { ...manifest, status: "saving" };
    writeManifest(manifest);
    const existingDestination = await loadPrintProject(uid, destinationProjectId);
    const adopted = rewriteAssets(
      {
        ...project,
        id: destinationProjectId,
        ownerUid: uid,
        revision: Number(existingDestination?.revision ?? 0),
        createdAt: existingDestination?.createdAt ?? project.createdAt,
      },
      manifest.assets,
    );
    const saved = await savePrintProject(adopted);
    const verified = await loadPrintProject(uid, destinationProjectId);
    const verifiedJson = JSON.stringify(verified);
    if (
      !verified ||
      verified.ownerUid !== uid ||
      verified.id !== destinationProjectId ||
      Object.values(manifest.assets).some((url) => !verifiedJson.includes(url))
    ) {
      throw new Error("The saved project could not be verified.");
    }
    // Carry any cookbook unlock across the id change and back it up under the
    // new owner. A signed-out purchase only ever wrote localStorage (no uid);
    // adoption is the first moment we can durably persist it to Firestore, so a
    // "buy first, make an account later" cookbook survives a device switch.
    transferCookbookProjectUnlockLocal(project.id, destinationProjectId);
    if (isCookbookProjectUnlocked(destinationProjectId)) {
      await persistCookbookProjectUnlock(uid, destinationProjectId).catch(() => undefined);
    }
    writeManifest({ ...manifest, status: "complete", error: undefined });
    return saved;
  } catch (error) {
    writeManifest({
      ...manifest,
      status: "failed",
      error: error instanceof Error ? error.message : "Transfer failed",
    });
    throw error;
  }
}
