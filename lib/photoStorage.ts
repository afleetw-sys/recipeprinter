import { getFirebaseAuth, firebaseConfigured } from "./firebase/client";
import { fileToCoverBlob, normalizePhotoBlob } from "./coverPhoto";
import type {
  CoverConfig,
  QueueItem,
  RecipePagePlacement,
  Section,
  StashedCookbook,
} from "@/types/recipe";
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
// Moved to lib/anonymousOwner.ts so lib/parser.ts can reach it without pulling
// this module's Firebase imports into the bundle of every page that can import
// a recipe. Re-exported because plenty of code already asks for it here, and
// this is still where it is used.
import { anonymousOwnerId } from "@/lib/anonymousOwner";
export { ANONYMOUS_OWNER_STORAGE_KEY, anonymousOwnerId } from "@/lib/anonymousOwner";

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
  // `firebase/storage` reached through `await import` rather than at module
  // scope. This module is imported statically by the print page and the image
  // picker, so a top-level import put the Storage SDK in front of first paint
  // on every route that can show a photo — for a code path that does nothing
  // until somebody actually adds one. `lib/firebase/storage.ts` is lazy about
  // *initializing* Storage, which is a different thing from keeping it out of
  // the bundle.
  const [{ getDownloadURL, ref, uploadBytes }, { getFirebaseStorage }] = await Promise.all([
    import("firebase/storage"),
    import("./firebase/storage"),
  ]);
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
    trip into a Firestore document. Remote URLs and empties pass through.

    Normalized on the way through, like every photo added by hand. This used to
    upload the raw bytes, which made a Paprika import the one way to get an
    uncapped full-resolution photo into a book — and the renderer passes each
    photo's original bytes straight into the PDF, so those landed whole in the
    file people download. `normalizePhotoBlob` is the tolerant encoder on
    purpose: this runs mid-save and mid-export, where a photo that fails to
    re-encode must still reach Storage rather than vanish from the book. */
export async function materializeDataUrl(value: string | undefined): Promise<string | undefined> {
  if (!isLocalImage(value)) return value;
  const blob = await (await fetch(value)).blob();
  return uploadBlob(await normalizePhotoBlob(blob));
}

/**
 * `materializeDataUrl` for the whole-project sweep, where one bad photo must
 * not take the other forty with it.
 *
 * The sweep is built out of `Promise.all`, so a single rejection rejected the
 * lot: `materializeProjectPhotos` threw, and the two callers both handled that
 * badly. The export caught it and returned the project *unchanged* — so one
 * photo failing meant none of them were uploaded, which is the opposite of
 * what its comment promises ("without whichever photo couldn't be sent
 * ahead"). The save had no isolation at all, so an unreadable photo made an
 * entire cookbook unsaveable.
 *
 * Keeping the original value on failure is what "without whichever photo"
 * actually looks like. Note the residual: a `blob:` URL kept this way is still
 * a dangling reference in the saved document — one broken photo instead of a
 * blocked save, which is the better of the two, not a cure.
 */
async function materializeOrKeep(value: string | undefined): Promise<string | undefined> {
  try {
    return await materializeDataUrl(value);
  } catch (error) {
    if (isLocalImage(value)) {
      console.warn("RecipePrinter: could not upload a local photo; keeping the local copy", error);
    }
    return value;
  }
}

/**
 * Everything in a book that can hold a photo.
 *
 * Structural rather than `PrintProject` so the save-time sweep can pass the six
 * fields it cares about and adoption can pass a whole project; `mapProjectPhotoUrls`
 * is generic over it and hands back whatever it was given, with the rest of the
 * document untouched.
 */
export interface ProjectPhotos {
  sections: Section[];
  cover?: CoverConfig;
  backCover?: CoverConfig;
  /** Legacy front matter, still a CoverConfig and so still able to carry art. */
  dedication?: CoverConfig;
  itemPlacements?: Record<string, RecipePagePlacement>;
  /** A book set aside by "print as recipe cards instead". Its art is as real as
      the live book's and comes from the same places, so it is walked too —
      otherwise restoring the stash months later hands back a book whose chapter
      openers point at object URLs that died with the document that minted them. */
  stashedCookbook?: StashedCookbook;
}

/**
 * Where in the book a photo URL was found.
 *
 * Deliberately only as detailed as some caller actually needs. Exactly one
 * distinction is load-bearing: the save-time sweep reports which RECIPE photos
 * moved, so the working copy can stop treating the browser's copy as the source
 * (see `MaterializedPhotos`). A `heroImageUrl` hangs off an item id too, but it
 * is layout art rather than the recipe's own photo, so it is not that. Nothing
 * else asks anything, so nothing else is described.
 */
export type PhotoSite = { kind: "recipeImage"; itemId: string } | { kind: "art" };

const ART: PhotoSite = { kind: "art" };

/** What to do with one photo URL. Returning it unchanged makes the walk a
    read — which is how the two collecting callers use it. */
export type VisitPhotoUrl = (
  url: string,
  site: PhotoSite,
) => string | undefined | Promise<string | undefined>;

async function visitOne(
  url: string | undefined,
  site: PhotoSite,
  visit: VisitPhotoUrl,
): Promise<string | undefined> {
  return url ? visit(url, site) : url;
}

/** A list of photos, with anything the visit emptied dropped rather than left
    as a hole in the collage. */
async function visitList(
  urls: readonly string[] | undefined,
  visit: VisitPhotoUrl,
): Promise<string[] | undefined> {
  if (!urls) return undefined;
  const next = await Promise.all(urls.map((url) => visitOne(url, ART, visit)));
  return next.filter((url): url is string => Boolean(url));
}

async function visitCover<T extends CoverConfig>(
  cover: T | undefined,
  visit: VisitPhotoUrl,
): Promise<T | undefined> {
  if (!cover) return cover;
  const [imageUrl, gridImages] = await Promise.all([
    visitOne(cover.imageUrl, ART, visit),
    visitList(cover.gridImages, visit),
  ]);
  return { ...cover, imageUrl, gridImages };
}

/**
 * A chapter opener's art.
 *
 * `gridImages` is the one that bites. A collage defaults to the chapter's OWN
 * recipe photos (`sectionRecipeImages` on the print page), so for a Paprika
 * import those defaults are `blob:` URLs — real-looking strings that resolve to
 * nothing outside the document that minted them.
 *
 * Generic because a live `Section` and a stashed `SectionMeta` differ only in
 * whether they hold recipes or ids, and neither difference is art.
 */
async function visitSectionArt<T extends { photoUrl?: string; gridImages?: string[] }>(
  section: T,
  visit: VisitPhotoUrl,
): Promise<T> {
  const [photoUrl, gridImages] = await Promise.all([
    visitOne(section.photoUrl, ART, visit),
    visitList(section.gridImages, visit),
  ]);
  return { ...section, photoUrl, gridImages };
}

/**
 * A recipe page's layout art: the facing full-page photo, and the photos this
 * recipe has worn before.
 *
 * `photoHistory` holds images REPLACED by a later pick, which for an imported
 * recipe is exactly the kind that was only ever browser-local. It is what the
 * photo picker offers as "put the old one back", so leaving it out meant the
 * offer was there and the photo behind it was gone.
 */
async function visitPlacements(
  placements: Record<string, RecipePagePlacement> | undefined,
  visit: VisitPhotoUrl,
): Promise<Record<string, RecipePagePlacement> | undefined> {
  if (!placements) return placements;
  const entries = await Promise.all(
    Object.entries(placements).map(async ([id, placement]) => {
      const [heroImageUrl, photoHistory] = await Promise.all([
        visitOne(placement.heroImageUrl, ART, visit),
        visitList(placement.photoHistory, visit),
      ]);
      return [id, { ...placement, heroImageUrl, photoHistory }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/** The recipe's own photo. Left strictly alone — same object back — when the
    visit does not change it, so a walk that moved nothing allocates nothing. */
async function visitItem(item: QueueItem, visit: VisitPhotoUrl): Promise<QueueItem> {
  const image = item.recipe?.image;
  if (!image) return item;
  const next = await visit(image, { kind: "recipeImage", itemId: item.id });
  if (next === image) return item;
  return { ...item, recipe: { ...item.recipe!, image: next } };
}

async function visitSection(section: Section, visit: VisitPhotoUrl): Promise<Section> {
  const [art, items] = await Promise.all([
    visitSectionArt(section, visit),
    Promise.all(section.items.map((item) => visitItem(item, visit))),
  ]);
  return { ...art, items };
}

/** The same walk over a book that has been set aside. Its sections hold item
    ids rather than recipes, so only the art is there to find. */
async function visitStash(
  stash: StashedCookbook | undefined,
  visit: VisitPhotoUrl,
): Promise<StashedCookbook | undefined> {
  if (!stash) return stash;
  const [cover, backCover, dedication, sections, itemPlacements] = await Promise.all([
    visitCover(stash.cover, visit),
    visitCover(stash.backCover, visit),
    visitCover(stash.dedication, visit),
    Promise.all(stash.sections.map((section) => visitSectionArt(section, visit))),
    visitPlacements(stash.itemPlacements, visit),
  ]);
  return { ...stash, cover, backCover, dedication, sections, itemPlacements };
}

/**
 * Every photo URL in a book, visited once, with the book handed back rewritten
 * by whatever the visit returned.
 *
 * THE one traversal of this shape. There were three: this sweep, plus
 * `projectAssetFields` (which URLs does adoption copy) and `rewriteAssets`
 * (point the copies at their new home) in lib/anonymousProjectAdoption. Each
 * was a hand-written walk of the same tree, kept in step by a comment asking
 * the next person to remember — and they had already drifted apart: adoption
 * knew nothing about `dedication` art or `photoHistory`, so a signed-out cook
 * who put a photo on their dedication page and then signed in got a book
 * adopted into their account still pointing at anonymous storage it no longer
 * owned. Which fields hold photos is one question, so it is answered once and
 * the three callers differ only in what they DO with each URL.
 *
 * Generic so a caller gets its own type back: the sweep passes the six photo
 * fields and receives them, adoption passes a whole `PrintProject` and receives
 * one with every other field carried through untouched.
 */
export async function mapProjectPhotoUrls<T extends ProjectPhotos>(
  project: T,
  visit: VisitPhotoUrl,
): Promise<T> {
  const [cover, backCover, dedication, stashedCookbook, itemPlacements, sections] =
    await Promise.all([
      visitCover(project.cover, visit),
      visitCover(project.backCover, visit),
      visitCover(project.dedication, visit),
      visitStash(project.stashedCookbook, visit),
      visitPlacements(project.itemPlacements, visit),
      Promise.all(project.sections.map((section) => visitSection(section, visit))),
    ]);
  return { ...project, cover, backCover, dedication, stashedCookbook, itemPlacements, sections };
}

/** Every photo URL in a book, with nothing rewritten. Unordered — both callers
    build a Set from it, and the walk fans out across the book's branches. */
export async function collectProjectPhotoUrls(project: ProjectPhotos): Promise<string[]> {
  const urls: string[] = [];
  await mapProjectPhotoUrls(project, (url) => {
    urls.push(url);
    return url;
  });
  return urls;
}

/**
 * How one image URL becomes a durable one.
 *
 * Injected through the sweep rather than called directly, for the reason
 * `copyProjectAssets` in lib/anonymousProjectAdoption gives for the same move:
 * the upload underneath reaches Firebase Storage through `await import`, and a
 * dynamically-imported module is not something a test can reliably stand in
 * front of. Welding the sweep to it would make the question these tests
 * actually ask — WHICH fields does a book get swept for — answerable only by
 * standing up the Storage SDK.
 *
 * Defaults to the real one; nothing in the app passes it.
 */
type MaterializeUrl = (value: string | undefined) => Promise<string | undefined>;

/**
 * What the sweep produced: the project with every browser-local image replaced,
 * and a record of which recipe photos actually moved.
 *
 * The second half exists because the sweep used to be write-only. It uploaded
 * from the working copy and handed the result to the save, and the working copy
 * went on holding the `blob:` URL — so the SAME photos were fetched, re-encoded
 * and re-uploaded on every single save, and every one of them left the previous
 * object orphaned in Storage. On a Paprika library that is hundreds of photos
 * per edit, on the device least able to afford it.
 *
 * Handing back the map lets the caller point the working copy at Storage once,
 * after which the sweep is the no-op it always claimed to be.
 */
export interface MaterializedPhotos {
  photos: ProjectPhotos;
  /** Queue item id → the Storage URL its photo now lives at. Only entries that
      genuinely stopped being browser-local; `materializeOrKeep` hands back the
      original when an upload fails, and that is not an upload. */
  uploadedRecipeImages: Map<string, string>;
}

/**
 * Drops `localPhotoId` from the items whose recipe photo actually reached
 * Storage.
 *
 * The photo's home is Storage now, so the local copy stops being the source:
 * leaving `localPhotoId` on the saved item would have a later hydration replace
 * a real URL with a browser-only one.
 *
 * Keyed on the upload having SUCCEEDED, not merely on the photo having been
 * local when the sweep began. It used to be the latter, which made a failed
 * upload the worst of both: the item kept its `blob:` URL, which resolves to
 * nothing outside the document that minted it, AND lost the one id that could
 * still find those bytes in IndexedDB. The photo was recoverable right up until
 * the sweep that failed to move it threw away the way back.
 *
 * Keeping the id costs nothing when the upload later succeeds — the next save
 * sweeps the same item, uploads it, and drops the id then.
 */
function dropLocalPhotoIds<T extends ProjectPhotos>(photos: T, itemIds: ReadonlySet<string>): T {
  if (itemIds.size === 0) return photos;
  return {
    ...photos,
    sections: photos.sections.map((section) =>
      section.items.some((item) => itemIds.has(item.id))
        ? {
            ...section,
            items: section.items.map((item) => {
              if (!itemIds.has(item.id)) return item;
              const { localPhotoId: _swept, ...rest } = item;
              return rest;
            }),
          }
        : section,
    ),
  };
}

/**
 * Belt-and-suspenders before a project is written to Firestore: evicts ANY
 * remaining base64 (`data:`) image anywhere in it to Firebase Storage and
 * returns URL-only copies, guaranteeing the saved document never carries image
 * bytes (which would exceed Firestore's 1MB per-doc limit). With the photo
 * entry points already uploading on add, this is normally a fast no-op — it
 * only does work for legacy/edge data URIs. Remote URLs pass through untouched.
 */
export async function materializeProjectPhotos(
  project: ProjectPhotos,
  /** Exposed for tests only — see `MaterializeUrl`. */
  materialize: MaterializeUrl = materializeOrKeep,
): Promise<MaterializedPhotos> {
  // Which recipe photos this sweep actually put in Storage, so the caller can
  // stop holding the local copy as the source. See `MaterializedPhotos`.
  const uploadedRecipeImages = new Map<string, string>();

  const photos = await mapProjectPhotoUrls(project, async (url, site) => {
    const next = await materialize(url);
    // `materializeOrKeep` hands back the original on failure, so only a value
    // that actually stopped being browser-local is an upload. That same test
    // decides which items may safely forget their local copy.
    if (site.kind === "recipeImage" && isLocalImage(url) && next && !isLocalImage(next)) {
      uploadedRecipeImages.set(site.itemId, next);
    }
    return next;
  });

  return {
    photos: dropLocalPhotoIds(photos, new Set(uploadedRecipeImages.keys())),
    uploadedRecipeImages,
  };
}
