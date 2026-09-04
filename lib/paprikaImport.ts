// ─────────────────────────────────────────────────────────────────────────────
// Reading a Paprika export.
//
// A `.paprikarecipes` file is a ZIP archive holding one entry per recipe, each
// entry gzip-compressed JSON, with the recipe's photo embedded as base64. That
// makes this the one import source that needs no parser at all: no AI call, no
// server round trip, no guessing at a page's markup. The whole job is
// decompress, JSON.parse, and map field names.
//
// Everything here is deliberately tolerant, because the format has variants in
// the wild and we cannot hold every version of Paprika to check against:
// some exports store plain (uncompressed) JSON entries, a single-recipe export
// is sometimes a bare gzip with no ZIP wrapper, and an archive can carry
// entries that aren't recipes at all. None of those should cost a cook their
// import. A file we genuinely can't read says so, once, and asks for another.
//
// Photos come out as Blobs and stay in the browser — see lib/localPhotos.ts for
// why nothing is uploaded at import time.
// ─────────────────────────────────────────────────────────────────────────────

import type { ImportFailureCode } from "@/lib/analytics";
import { normalizeFractions } from "@/lib/parser";
import { hostnameOf } from "@/lib/url";
import type { QueueItem, Recipe, RecipeIngredient, RecipeInstruction } from "@/types/recipe";

/** An export we couldn't read, carrying the bucket the failure belongs in so
    the caller reports it without re-guessing from the message. Mirrors
    `ImportError` in lib/parser.ts, which serves the parsing sources. */
export class PaprikaImportError extends Error {
  constructor(
    message: string,
    readonly code: ImportFailureCode = "unreadable_file",
  ) {
    super(message);
    this.name = "PaprikaImportError";
  }
}

/* ── Limits ───────────────────────────────────────────────────────────────
   A recipe archive is a file someone hands us, so it gets the same suspicion
   as any other input: a small archive can claim to decompress into gigabytes,
   and the browser tab is what pays for believing it. These caps are far above
   any real library — a thousand recipes with photos lands well under them. */

const MAX_FILE_BYTES = 250 * 1024 * 1024;
const MAX_ENTRIES = 5_000;
/** One recipe's JSON, photo included. A 4MB photo is ~5.5MB of base64. */
const MAX_ENTRY_BYTES = 32 * 1024 * 1024;
const MAX_TOTAL_BYTES = 400 * 1024 * 1024;

const UNREADABLE =
  "That file isn't a Paprika export we can read. In Paprika, choose Export Recipes and " +
  "the Paprika Recipe Format, then pick the file it saves.";
const NO_RECIPES =
  "We opened that file but didn't find any recipes in it. If it came from Paprika's " +
  "Export Recipes, try exporting again with the Paprika Recipe Format selected.";
const TOO_BIG = "That file is larger than we can open in the browser.";

/* ── The shape a Paprika export uses ─────────────────────────────────────── */

type AnyRecord = Record<string, unknown>;

/** One recipe from an export, mapped and ready to add. */
export interface PaprikaEntry {
  /** Paprika's own `uid` when it has one, else a stable synthesized id. */
  id: string;
  /** The queue id this becomes, namespaced so it can never collide with a
      CookPilot recipe that happens to share an id. */
  queueId: string;
  recipe: Recipe;
  /** The embedded photo, decoded but neither stored nor uploaded. */
  photo?: Blob;
}

export interface PaprikaLibrary {
  fileName: string;
  entries: PaprikaEntry[];
  /** Entries in the archive that held no recipe (Paprika writes a few of
      these). Counted rather than reported: a cook doesn't need to hear about
      the bookkeeping files in their own export. */
  skipped: number;
}

export function paprikaQueueId(id: string): string {
  return `paprika:${id}`;
}

/* ── Bytes in ─────────────────────────────────────────────────────────────── */

function isZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function isGzip(bytes: Uint8Array): boolean {
  return bytes.length > 18 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

/**
 * What a gzip member claims it decompresses to, from its ISIZE trailer.
 *
 * A claim, not a fact — it's mod 2^32 and written by whoever made the file —
 * but checking it costs four bytes and stops the obvious bomb before we hand
 * the data to the inflater. The honest files this protects are unaffected.
 */
function gzipClaimedSize(bytes: Uint8Array): number {
  const n = bytes.length;
  return (
    ((bytes[n - 4] | (bytes[n - 3] << 8) | (bytes[n - 2] << 16) | (bytes[n - 1] << 24)) >>> 0)
  );
}

const decoder = new TextDecoder();

function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
}

/** One archive entry → its JSON, whether it was gzipped or stored plain. */
async function entryJson(bytes: Uint8Array): Promise<unknown> {
  if (isGzip(bytes)) {
    if (gzipClaimedSize(bytes) > MAX_ENTRY_BYTES) {
      throw new PaprikaImportError(TOO_BIG, "too_large");
    }
    const { gunzipSync } = await import("fflate");
    try {
      return parseJsonBytes(gunzipSync(bytes));
    } catch (error) {
      if (error instanceof PaprikaImportError) throw error;
      return null;
    }
  }
  return parseJsonBytes(bytes);
}

/**
 * Reads an export's bytes into a library.
 *
 * Takes bytes rather than a `File` so the whole reader is testable without a
 * browser — the tests build real ZIP archives and hand them straight in.
 */
export async function readPaprikaArchive(
  bytes: Uint8Array,
  fileName: string,
): Promise<PaprikaLibrary> {
  if (bytes.length === 0) throw new PaprikaImportError(UNREADABLE);
  if (bytes.length > MAX_FILE_BYTES) throw new PaprikaImportError(TOO_BIG, "too_large");

  const documents: unknown[] = [];

  if (isZip(bytes)) {
    const { unzipSync } = await import("fflate");
    let total = 0;
    let count = 0;
    let unzipped: Record<string, Uint8Array>;
    try {
      unzipped = unzipSync(bytes, {
        filter: (file) => {
          // The central directory's own claim about each entry, available
          // before anything is inflated — so an oversized entry is refused
          // rather than decompressed and then measured.
          if (file.originalSize && file.originalSize > MAX_ENTRY_BYTES) {
            throw new PaprikaImportError(TOO_BIG, "too_large");
          }
          total += file.originalSize || file.size;
          if (total > MAX_TOTAL_BYTES) {
            throw new PaprikaImportError(TOO_BIG, "too_large");
          }
          count += 1;
          if (count > MAX_ENTRIES) {
            throw new PaprikaImportError(TOO_BIG, "too_large");
          }
          // Mac archivers slip their own metadata into a zip; it isn't a recipe
          // and it isn't a problem.
          return !file.name.startsWith("__MACOSX/") && !file.name.endsWith("/");
        },
      });
    } catch (error) {
      if (error instanceof PaprikaImportError) throw error;
      throw new PaprikaImportError(UNREADABLE);
    }
    for (const entry of Object.values(unzipped)) {
      documents.push(await entryJson(entry));
    }
  } else {
    documents.push(await entryJson(bytes));
  }

  const entries: PaprikaEntry[] = [];
  let skipped = 0;

  for (const document of documents) {
    // A few exports hold an array of recipes in one document rather than one
    // recipe per archive entry.
    const candidates = Array.isArray(document) ? document : [document];
    for (const candidate of candidates) {
      const entry = toEntry(candidate);
      if (entry) entries.push(entry);
      else skipped += 1;
    }
  }

  if (entries.length === 0) throw new PaprikaImportError(NO_RECIPES);
  return { fileName, entries, skipped };
}

/** Browser entry point: a chosen file → its library. */
export async function readPaprikaFile(file: File): Promise<PaprikaLibrary> {
  if (file.size > MAX_FILE_BYTES) throw new PaprikaImportError(TOO_BIG, "too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  return readPaprikaArchive(bytes, file.name);
}

/* ── Field mapping ────────────────────────────────────────────────────────── */

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

/**
 * A heading inside Paprika's free-text ingredient/direction blocks.
 *
 * Paprika stores both as one text field, and the convention its users write in
 * is a short line ending in a colon ("For the sauce:"). Those become the same
 * `section` labels CookPilot recipes already carry, so a grouped Paprika recipe
 * prints grouped instead of as one flat run. The length bound keeps a genuine
 * instruction that happens to end in a colon from swallowing the steps under it.
 */
function headingOf(line: string): string | undefined {
  if (!line.endsWith(":") || line.length > 60) return undefined;
  const label = line.slice(0, -1).trim();
  return label.length > 0 ? label : undefined;
}

/** Strips a hand-written step number so the card doesn't print "1. 1. Heat…". */
function stripEnumerator(line: string): string {
  return line.replace(/^\s*(?:step\s*)?\d{1,2}\s*[.)\]:-]\s+/i, "").trim();
}

function textLines(value: unknown): string[] {
  const text = typeof value === "string" ? value : "";
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function toIngredients(value: unknown): RecipeIngredient[] {
  const out: RecipeIngredient[] = [];
  let section: string | undefined;
  for (const line of textLines(value)) {
    const heading = headingOf(line);
    if (heading) {
      section = heading;
      continue;
    }
    const raw = normalizeFractions(line);
    out.push({ name: raw, raw, section });
  }
  return out;
}

function toInstructions(value: unknown): RecipeInstruction[] {
  const out: RecipeInstruction[] = [];
  let section: string | undefined;
  let step = 1;
  for (const line of textLines(value)) {
    const heading = headingOf(line);
    if (heading) {
      section = heading;
      continue;
    }
    const text = normalizeFractions(stripEnumerator(line));
    if (!text) continue;
    out.push({ step: step++, text, section });
  }
  return out;
}

/**
 * Category *names*, not ids.
 *
 * Which of the two an export holds depends on where it came from — the sync
 * API deals in category uids, and some export files carry them through. A uid
 * printed on a recipe card as a tag is noise, so anything shaped like one is
 * dropped rather than shown.
 */
function toTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags = value
    .map((entry) => asString(entry))
    .filter(
      (tag): tag is string =>
        typeof tag === "string" && !/^[0-9a-f]{8}-[0-9a-f-]{20,}$/i.test(tag),
    );
  return tags.length > 0 ? tags : undefined;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
    const binary = atob(clean.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * One export record → a print-ready `Recipe`, or null if there's no recipe in
 * it. The Paprika sibling of `adaptCookPilotRecipe` in lib/cookpilot.ts.
 *
 * Two fields have nowhere to land and are dropped rather than faked:
 * `nutritional_info` is free text where `Recipe.nutrition` is a keyed record,
 * and `rating`/`difficulty` aren't part of a printed card.
 */
export function adaptPaprikaRecipe(value: unknown): Recipe | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as AnyRecord;

  const title = asString(data.name) ?? asString(data.title);
  const ingredients = toIngredients(data.ingredients);
  const instructions = toInstructions(data.directions);

  // Either half is a recipe. A list of ingredients with no method is still
  // worth printing, and so is a method with the ingredients written into it.
  if (ingredients.length === 0 && instructions.length === 0) return null;

  const sourceUrl = asString(data.source_url);
  const servings = asString(data.servings);

  return {
    title: title ?? "Untitled recipe",
    description: asString(data.description) ?? asString(data.notes),
    sourceUrl,
    sourceName: asString(data.source) ?? (sourceUrl ? hostnameOf(sourceUrl) : undefined),
    prepTime: asString(data.prep_time),
    cookTime: asString(data.cook_time),
    totalTime: asString(data.total_time),
    servings,
    ingredients,
    instructions,
    tags: toTags(data.categories),
  };
}

/**
 * A stand-in id for an export whose recipes have no `uid`.
 *
 * Derived from the recipe's own content rather than a counter, so opening the
 * same file twice produces the same ids — which is what lets the queue's
 * dedupe recognise a recipe already added and not stack up a second copy.
 */
function synthesizeId(recipe: Recipe): string {
  const seed = `${recipe.title}\x00${recipe.ingredients.length}\x00${recipe.instructions
    .map((instruction) => instruction.text)
    .join("\x00")}`;
  let hash = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash * 33) ^ seed.charCodeAt(i)) >>> 0;
  }
  return `local-${hash.toString(36)}`;
}

function toEntry(value: unknown): PaprikaEntry | null {
  const recipe = adaptPaprikaRecipe(value);
  if (!recipe) return null;
  const data = value as AnyRecord;

  const id = asString(data.uid) ?? synthesizeId(recipe);
  const photoBytes =
    typeof data.photo_data === "string" ? decodeBase64(data.photo_data) : null;

  return {
    id,
    queueId: paprikaQueueId(id),
    recipe,
    // The type is a guess in the same way every Paprika photo is a JPEG: the
    // browser sniffs the real one when it renders, and Storage re-reads it on
    // upload, so a wrong guess here costs nothing.
    photo: photoBytes ? new Blob([photoBytes], { type: "image/jpeg" }) : undefined,
  };
}

/** A ready-to-add queue item. `image` is filled in by the caller, which owns
    the object URL for the photo (see lib/localPhotos.ts). */
export function paprikaQueueItem(entry: PaprikaEntry, photo?: { id: string; url: string }): QueueItem {
  return {
    id: entry.queueId,
    method: "paprika",
    source: "Paprika",
    status: "ready",
    title: entry.recipe.title || "Untitled recipe",
    recipe: photo ? { ...entry.recipe, image: photo.url } : entry.recipe,
    localPhotoId: photo?.id,
    addedAt: Date.now(),
  };
}
