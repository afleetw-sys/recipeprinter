"use client";

import type { PrintProject } from "@/types/recipe";
import { recipePrinterUserPhotoRoot } from "@/lib/firebase/recipePrinterPaths";
import { localStore } from "@/lib/storage";
import {
  loadPrintProject,
  loadPrintProjectHead,
  PrintProjectConflictError,
  savePrintProject,
} from "@/lib/printProjects";
import {
  transferCookbookProjectUnlockLocal,
} from "@/lib/cookbookUnlocks";
import { collectProjectPhotoUrls, mapProjectPhotoUrls } from "@/lib/photoStorage";

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

/**
 * The anonymous photos this project still points at, each once.
 *
 * WHERE a photo can live is not this module's question to answer — it is the
 * same question the save-time sweep asks, and answering it twice is how the two
 * drifted: this walk never knew about `dedication` art or a recipe's
 * `photoHistory`, so a signed-out cook with a photo on either of them was
 * adopted into an account still pointing at anonymous storage. Both now read
 * `mapProjectPhotoUrls`, so a new photo field is covered here by construction.
 */
async function assetUrls(project: PrintProject): Promise<string[]> {
  const urls = await collectProjectPhotoUrls(project);
  return Array.from(new Set(urls.filter(anonymousRecipePrinterAsset)));
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

/** Points every copied photo at its new home under the account. Reads the same
    walk `assetUrls` does, so a field that gets collected cannot then fail to be
    rewritten — which is the pairing the post-save verification checks. */
function rewriteAssets(
  project: PrintProject,
  assets: Record<string, string>,
): Promise<PrintProject> {
  return mapProjectPhotoUrls(project, (url) => assets[url] ?? url);
}

export async function adoptAnonymousProject(
  uid: string,
  project: PrintProject,
  options: {
    /** The cook was shown the conflict below and chose to overwrite anyway.
        Only ever set from that answer — never inferred, or the guard would be
        back to trusting the belief it exists to check. */
    overwriteExisting?: boolean;
  } = {},
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
  /**
   * Whether an earlier run of THIS adoption already began writing that
   * document, which is the only thing that entitles this one to overwrite it.
   *
   * `saving` means the assets were copied and `savePrintProject` was reached;
   * `complete` means it landed. Both mean the document at the destination is
   * this book. Every other status — and no manifest at all — means we have
   * never written there, so anything already sitting at that id belongs to
   * somebody else's save and is not ours to replace. See the guard below.
   *
   * Deliberately read off the PREVIOUS manifest, before this attempt overwrites
   * it: a run that ends in the conflict below records `failed`, which is not a
   * claim, so a retry cannot launder itself into one.
   */
  const resumesOurOwnWrite =
    previous?.uid === uid &&
    previous.sourceProjectId === project.id &&
    (previous.status === "saving" || previous.status === "complete");
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
      await assetUrls(project),
      manifest,
      (sourceUrl, existingDestination) =>
        copyAsset(uid, destinationProjectId, sourceUrl, existingDestination),
    );
    manifest = { ...manifest, status: "saving" };
    writeManifest(manifest);
    // Revision and creation time only — the destination's own content is about
    // to be replaced by `adopted`, so reading it in full would be wasted bytes.
    const existingDestination = await loadPrintProjectHead(uid, destinationProjectId);
    /**
     * Adoption REPLACES the destination, and that is only safe where there is
     * nothing there to lose.
     *
     * Taking `existingDestination.revision` below rather than checking it is
     * what makes this path unable to conflict — deliberately, because the
     * normal case is a document that does not exist yet and a revision of 0
     * would be refused by nothing. But "cannot conflict" also means "cannot
     * notice", and adoption runs precisely when the caller believes the account
     * has no copy of this book. Every way of being wrong about that ends here:
     * a read that failed and was reported as a miss, a `loadPrintProjectHead`
     * that could not answer during the attach check, a content index pointing
     * this working copy at a document some other book already owns.
     *
     * So confirm the belief instead of acting on it. A document we have never
     * written is somebody's saved work, and a book whose recipes we are about
     * to overwrite wholesale deserves the same question every other save asks.
     * The caller already knows this error: it surfaces as "Newer version
     * found", with the choice between loading that version and overwriting it.
     */
    if (existingDestination && !resumesOurOwnWrite && !options.overwriteExisting) {
      throw new PrintProjectConflictError();
    }
    const adopted = await rewriteAssets(
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
    const verifiedAssets = new Set(verified ? await collectProjectPhotoUrls(verified) : []);
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
