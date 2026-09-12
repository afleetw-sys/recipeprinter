"use client";

import type { PrintProject } from "@/types/recipe";
import { recipePrinterUserPhotoRoot } from "@/lib/firebase/recipePrinterPaths";
import { localStore } from "@/lib/storage";
import { loadPrintProject, loadPrintProjectHead, savePrintProject } from "@/lib/printProjects";
import {
  transferCookbookProjectUnlockLocal,
} from "@/lib/cookbookUnlocks";

const MANIFEST_KEY = "recipeprinter:anonymous-adoption:v1";

/**
 * How many photos are copied at once.
 *
 * Adoption used to copy them strictly one at a time, and a copy is not a cheap
 * thing to put in series: every photo comes DOWN to this browser out of the
 * anonymous folder and goes back UP under the account. A book with eighty
 * photos was eighty of those round trips end to end, with nothing on screen —
 * at the exact moment a signed-out purchase is becoming an account purchase,
 * which is the worst moment in this app to look like it has hung.
 *
 * Small on purpose. Each unit in flight holds a whole photo in memory and they
 * all share one connection, so this is picked to keep a slow link working
 * rather than to saturate a fast one. Most of the win is in leaving one-at-a-
 * time at all; going much wider buys little and risks the phones that need
 * this most.
 */
const ASSET_COPY_CONCURRENCY = 5;

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

/** `items` in fixed-size groups, in order. Never emits an empty group. */
function batches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Copies one photo and resolves to its new URL. `existingDestination` is the
    URL a previous run already recorded for it, which lets the copier confirm
    that object is still there rather than send the bytes again. */
type CopyOneAsset = (sourceUrl: string, existingDestination?: string) => Promise<string>;

/**
 * Copies a project's anonymous photos into the account, and returns the
 * manifest recording which source became which destination.
 *
 * `copy` is injected rather than called directly. `copyAsset` reaches the
 * Storage SDK through `await import` — deliberately, so the print page does not
 * carry it (see there) — and a dynamically-imported module is not something a
 * test can stand in front of, so the scheduling here would have been untestable
 * welded to it. Same move, for the same reason, as `planDuplicateCleanup`'s
 * injected `grantUnlock`.
 *
 * Batched rather than serial, and the manifest is written once per batch rather
 * than once per photo. The manifest is the resume record — a copy that already
 * landed is not repeated on a retry — so flushing per batch means an
 * interruption can cost at most one batch of re-copying, in exchange for not
 * re-serializing the whole asset map after every single photo.
 */
export async function copyProjectAssets(
  sourceUrls: readonly string[],
  manifest: AdoptionManifest,
  copy: CopyOneAsset,
): Promise<AdoptionManifest> {
  let current = manifest;

  for (const batch of batches(sourceUrls, ASSET_COPY_CONCURRENCY)) {
    const settled = await Promise.allSettled(
      batch.map(async (sourceUrl) => ({
        sourceUrl,
        destination: await copy(sourceUrl, current.assets[sourceUrl]),
      })),
    );

    const copied: Record<string, string> = {};
    for (const result of settled) {
      if (result.status === "fulfilled") copied[result.value.sourceUrl] = result.value.destination;
    }
    // Recorded even when a sibling in the same batch failed. Those copies really
    // happened and their bytes really are in the account's folder, so keeping
    // them is what makes the retry cheaper than the first attempt rather than an
    // identical repeat of it.
    current = { ...current, assets: { ...current.assets, ...copied } };
    writeManifest(current);

    const failed = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failed) throw failed.reason;
  }

  return current;
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

// Every field of a project that can hold a photo URL, flattened. The single
// source of truth for "where do asset URLs live", so both the copy pass (which
// filters to anonymous sources) and the post-save verification (which checks the
// rewritten destinations landed) read the same field set.
function projectAssetFields(project: PrintProject): Array<string | undefined> {
  const stash = project.stashedCookbook;
  return [
    project.cover?.imageUrl,
    project.backCover?.imageUrl,
    ...(project.cover?.gridImages ?? []),
    ...(project.backCover?.gridImages ?? []),
    ...project.sections.flatMap((section) => [
      section.photoUrl,
      // A chapter collage is usually curated from recipe photos (already
      // covered below), but the picker also accepts an uploaded one.
      ...(section.gridImages ?? []),
      ...section.items.map((item) => item.recipe?.image),
    ]),
    ...Object.values(project.itemPlacements ?? {}).map((placement) => placement.heroImageUrl),
    // A book set aside by "switch to recipe cards" holds its own cover art,
    // chapter photos and hero images. It's persisted with the project now, so
    // adoption has to bring its assets across too — otherwise restoring the
    // stash months later hands back a book still pointing at anonymous storage
    // this account never owned.
    stash?.cover?.imageUrl,
    stash?.backCover?.imageUrl,
    ...(stash?.cover?.gridImages ?? []),
    ...(stash?.backCover?.gridImages ?? []),
    ...(stash?.sections ?? []).flatMap((section) => [
      section.photoUrl,
      ...(section.gridImages ?? []),
    ]),
    ...Object.values(stash?.itemPlacements ?? {}).map((placement) => placement.heroImageUrl),
  ];
}

function assetUrls(project: PrintProject): string[] {
  return Array.from(new Set(projectAssetFields(project).filter(anonymousRecipePrinterAsset)));
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
  // Storage reached through `await import`, like the rest of the Firebase
  // surface. This module is imported statically by the print page but only runs
  // when a signed-out draft is adopted into an account, so a top-level import
  // charged every /print load for a path most visits never take.
  const [{ getBlob, getDownloadURL, getMetadata, ref, uploadBytes }, { getFirebaseStorage }] =
    await Promise.all([import("firebase/storage"), import("@/lib/firebase/storage")]);
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
  // `uploadBytes` resolves once the object is committed, so it IS the
  // confirmation that the copy landed. There used to be a `getMetadata` on the
  // destination here, immediately after, asking the object it had just written
  // whether it existed — a whole extra round trip per photo, in a loop whose
  // cost is round trips. The `getMetadata` on the SOURCE above stays: that one
  // is read for its `contentType`, which the copy has no other way to learn.
  await uploadBytes(destinationRef, blob, {
    contentType: metadata.contentType ?? blob.type ?? "image/jpeg",
  });
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
  const rewritePlacements = (placements: PrintProject["itemPlacements"]) =>
    placements
      ? Object.fromEntries(
          Object.entries(placements).map(([id, placement]) => [
            id,
            { ...placement, heroImageUrl: replaceUrl(placement.heroImageUrl, assets) },
          ]),
        )
      : undefined;
  const stash = project.stashedCookbook;
  return {
    ...project,
    cover: rewriteCover(project.cover),
    backCover: rewriteCover(project.backCover),
    sections: project.sections.map((section) => ({
      ...section,
      photoUrl: replaceUrl(section.photoUrl, assets),
      gridImages: section.gridImages?.map((url) => replaceUrl(url, assets) ?? url),
      items: section.items.map((item) =>
        item.recipe?.image
          ? { ...item, recipe: { ...item.recipe, image: replaceUrl(item.recipe.image, assets) } }
          : item,
      ),
    })),
    itemPlacements: rewritePlacements(project.itemPlacements),
    // The set-aside book gets the same treatment — its section list holds ids
    // rather than recipes, so only the art fields need rewriting. Must stay in
    // step with `projectAssetFields`, which is what the post-save verification
    // checks these against.
    stashedCookbook: stash
      ? {
          ...stash,
          cover: rewriteCover(stash.cover),
          backCover: rewriteCover(stash.backCover),
          sections: stash.sections.map((section) => ({
            ...section,
            photoUrl: replaceUrl(section.photoUrl, assets),
            gridImages: section.gridImages?.map((url) => replaceUrl(url, assets) ?? url),
          })),
          itemPlacements: rewritePlacements(stash.itemPlacements),
        }
      : undefined,
  };
}

export async function adoptAnonymousProject(
  uid: string,
  project: PrintProject,
): Promise<PrintProject> {
  const previous = readAdoptionManifest();
  // Adoption is an UPSERT on the working copy's own id, never a fork. Project
  // ids are random (lib/ids), so a document already sitting at this id is this
  // same book being adopted again — a reload, a second visit, a retry after a
  // failed save. Minting a new id there produced a duplicate cookbook in the
  // account on every such pass. The only id that may differ from the working
  // copy's is one a previous adoption already redirected to (kept below so an
  // interrupted adoption resumes into the document it started writing).
  const destinationProjectId =
    (previous?.uid === uid && previous.sourceProjectId === project.id
      ? previous.destinationProjectId
      : undefined) ?? project.id;
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
    manifest = await copyProjectAssets(
      assetUrls(project),
      manifest,
      (sourceUrl, existingDestination) =>
        copyAsset(uid, destinationProjectId, sourceUrl, existingDestination),
    );
    manifest = { ...manifest, status: "saving" };
    writeManifest(manifest);
    // Revision and creation time only — the destination's own content is about
    // to be replaced by `adopted`, so reading it in full would be wasted bytes.
    const existingDestination = await loadPrintProjectHead(uid, destinationProjectId);
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
    // Check each rewritten URL sits in an actual asset field of the reloaded
    // project — an exact Set membership, not a substring scan of the serialized
    // blob (Firebase download URLs share a long common prefix, so one asset's
    // URL being a substring of another's could pass a `.includes` check even
    // when its own field was never rewritten).
    const verifiedAssets = new Set(
      verified ? projectAssetFields(verified).filter((url): url is string => Boolean(url)) : [],
    );
    if (
      !verified ||
      verified.ownerUid !== uid ||
      verified.id !== destinationProjectId ||
      Object.values(manifest.assets).some((url) => !verifiedAssets.has(url))
    ) {
      throw new Error("The saved project could not be verified.");
    }
    // Carry any cookbook unlock across the id change, locally. Adoption used to
    // ALSO write the unlock to Firestore here, because a signed-out purchase had
    // only ever reached localStorage and this was the first moment a uid existed
    // to durably attach it to. The server owns that now: the purchase is
    // recorded against the anonymous RevenueCat id at checkout and granted on
    // the TRANSFER event RevenueCat fires when the buyer signs in — which is the
    // same moment, from a better-informed side. The client write is denied by
    // the rules regardless.
    transferCookbookProjectUnlockLocal(project.id, destinationProjectId);
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
