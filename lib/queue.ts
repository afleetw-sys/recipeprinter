"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportMethod, QueueItem, Recipe } from "@/types/recipe";
import { track, truncateReason } from "@/lib/analytics";
import { ImportError, parseImages, parseText, parseUrlAll } from "@/lib/parser";
import { captureFailedImportImages, recordFailedImport } from "@/lib/failedImportCapture";
import { placeholderHostMessage } from "@/lib/friendlyErrors";
import { prepareImageDataUrls } from "@/lib/imageImport";
import { normalizeImportURL } from "@/lib/cookpilot";
import { hostnameOf as rawHostnameOf } from "@/lib/url";
import { uid } from "@/lib/ids";
import { deleteLocalPhoto, isBlobUrl, localPhotoUrl } from "@/lib/localPhotos";
import { localStore, sessionStore } from "@/lib/storage";

// The print queue is session-based for the MVP, no accounts, no saved library.
// It survives navigation to /print (same tab) via sessionStorage.
export const QUEUE_STORAGE_KEY = "recipeprinter:queue:v1";
const CURRENT_PRINT_JOB_STORAGE_KEY = "recipeprinter:print-job:current:v1";
// Durable backup of the session queue. sessionStorage is wiped when the tab
// closes; this localStorage mirror lets a reopened tab restore the in-progress
// working set so a cook never loses an unsaved book/cards by closing the tab.
// The session copy stays authoritative per-tab (two open tabs keep independent
// live queues) — this mirror is only read to reseed a fresh tab that has none.
const QUEUE_RECOVERY_STORAGE_KEY = "recipeprinter:queue:recovery:v1";

interface PrintJob {
  ids: string[];
}

export function printableRecipe(recipe: Recipe): Recipe {
  return {
    title: recipe.title || "Untitled recipe",
    description: recipe.description,
    image: recipe.image,
    sourceUrl: recipe.sourceUrl,
    sourceName: recipe.sourceName,
    prepTime: recipe.prepTime,
    cookTime: recipe.cookTime,
    totalTime: recipe.totalTime,
    servings: recipe.servings,
    yield: recipe.yield,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
  };
}

function printableQueueItem(item: QueueItem): QueueItem {
  if (!item.recipe) return item;
  const recipe = printableRecipe(item.recipe);
  return {
    ...item,
    title: recipe.title || "Untitled recipe",
    recipe,
  };
}

function printableQueue(items: QueueItem[]): QueueItem[] {
  return items.map(printableQueueItem);
}

export function readQueue(): QueueItem[] {
  // The per-tab session copy is authoritative. Only when it's absent (a fresh
  // tab, e.g. reopened after close) do we fall back to the durable localStorage
  // mirror and reseed this tab's session from it.
  let raw = sessionStore.get(QUEUE_STORAGE_KEY);
  let recovered = false;
  if (raw === null) {
    raw = localStore.get(QUEUE_RECOVERY_STORAGE_KEY);
    recovered = raw !== null;
  }
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const sanitized = printableQueue(parsed as QueueItem[]);
  // A read stays pure: it never rewrites storage, even when sanitizing
  // normalized a field — the next `commit` persists that. The one exception is
  // recovery: a fresh tab reseeding from the durable mirror writes the set into
  // this tab's own session (hydration itself doesn't persist).
  if (recovered) writeSerializedQueue(JSON.stringify(sanitized));
  return sanitized;
}

export function createCurrentPrintJob(ids: string[]): boolean {
  if (ids.length === 0) return false;
  return sessionStore.setJson(CURRENT_PRINT_JOB_STORAGE_KEY, { ids } satisfies PrintJob);
}

export function readCurrentPrintJobIds(): string[] | null {
  const job = sessionStore.getJson<Partial<PrintJob>>(CURRENT_PRINT_JOB_STORAGE_KEY);
  if (!job || !Array.isArray(job.ids)) return null;
  return job.ids.filter((value): value is string => typeof value === "string");
}

function serializeQueue(items: QueueItem[]): string | null {
  try {
    return JSON.stringify(printableQueue(items));
  } catch {
    return null;
  }
}

function writeSerializedQueue(serialized: string) {
  // A failed write is survivable: the queue stays correct in memory for this
  // page, it just won't survive a navigation.
  sessionStore.set(QUEUE_STORAGE_KEY, serialized);
  // Mirror to the durable backup so the working set survives a tab close.
  // Best-effort like the session write — if localStorage is unavailable
  // (private mode/quota) there's simply no cross-close recovery.
  localStore.set(QUEUE_RECOVERY_STORAGE_KEY, serialized);
}

/**
 * Seeds a fully-parsed recipe straight into this browser's session queue,
 * status "ready" — no parsing step, used by the /print/[slug] loader to hand
 * a shared recipe off to the real /print page. This is a local copy in the
 * visitor's own session storage: editing it (via the normal print-page
 * inline editor) only ever touches this copy, never the shared source doc.
 */
export function seedSharedQueueItem(recipe: Recipe, source: string): string {
  const id = uid();
  const item: QueueItem = {
    id,
    method: "shared",
    source,
    status: "ready",
    title: recipe.title || "Untitled recipe",
    recipe,
    addedAt: Date.now(),
  };
  const next = [...readQueue(), item];
  const serialized = serializeQueue(next);
  if (serialized) writeSerializedQueue(serialized);
  return id;
}

function hostnameOf(url: string): string {
  return rawHostnameOf(normalizeImportURL(url)) ?? url;
}

function canonicalUrl(rawUrl: string): string | null {
  try {
    const url = new URL(normalizeImportURL(rawUrl));
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return null;
  }
}

export function useQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  // Bumped on every `focusItem` call — even when the same id is focused twice in
  // a row (re-importing the same URL). Consumers key their "already added"
  // scroll-and-shake cue off this so a repeat duplicate re-triggers the motion,
  // which a plain `focusedItemId` (unchanged value) could not.
  const [focusNonce, setFocusNonce] = useState(0);
  const focusNonceRef = useRef(0);
  const [hydrated, setHydrated] = useState(false);
  const [hydratedWithItems, setHydratedWithItems] = useState(false);
  const itemsRef = useRef<QueueItem[]>([]);
  const serializedItemsRef = useRef<string | null>(null);
  // Pasted text payloads are kept in memory only (too large/private to persist)
  // so a failed text import can be retried within the same session.
  const textPayloads = useRef<Map<string, string>>(new Map());

  const commit = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
    const serialized = serializeQueue(next);
    if (serialized && serialized !== serializedItemsRef.current) {
      serializedItemsRef.current = serialized;
      writeSerializedQueue(serialized);
    }
  }, []);

  /**
   * Re-point locally-held photos at this document.
   *
   * A Paprika photo lives in IndexedDB and is shown through an object URL, and
   * an object URL dies with the document that made it — so the one the queue
   * was serialized with is a dead string in a fresh tab, and so is the one
   * inside a project filed to the on-device shelf last week. The bytes are
   * still there; this mints a new URL for them and patches the items.
   *
   * Only items carrying a `localPhotoId` are touched, and only when their
   * image is missing or is one of those dead URLs — a photo already uploaded
   * to Storage on save is a real URL and must be left exactly as it is.
   *
   * Runs on every path that brings items in from storage: the mount hydrate
   * and `replaceAll` (opening a saved project). A photo that resolves to
   * nothing is left alone; the recipe simply shows without it.
   */
  const rehydrateLocalPhotos = useCallback(
    async (candidates: QueueItem[]) => {
      const stale = candidates.filter(
        (item) => item.localPhotoId && (!item.recipe?.image || isBlobUrl(item.recipe.image)),
      );
      if (stale.length === 0) return;
      const resolved = new Map<string, string>();
      for (const item of stale) {
        const url = await localPhotoUrl(item.localPhotoId as string);
        if (url) resolved.set(item.id, url);
      }
      if (resolved.size === 0) return;
      // Applied against the live list, not the one passed in — the cook may
      // well have added something while IndexedDB was being read.
      commit(
        itemsRef.current.map((item) => {
          const url = resolved.get(item.id);
          return url && item.recipe ? { ...item, recipe: { ...item.recipe, image: url } } : item;
        }),
      );
    },
    [commit],
  );

  // Hydrate from sessionStorage on mount (client only).
  useEffect(() => {
    const initial = readQueue();
    itemsRef.current = initial;
    serializedItemsRef.current = serializeQueue(initial);
    setItems(initial);
    setHydratedWithItems(initial.length > 0);
    setHydrated(true);
    void rehydrateLocalPhotos(initial);
    // Mount only: `rehydrateLocalPhotos` is stable, and re-running this would
    // overwrite the live queue with whatever storage held at the time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const focusItem = useCallback(
    (id: string) => {
      const existing = itemsRef.current.find((it) => it.id === id);
      if (!existing) return;
      setFocusedItemId(id);
      focusNonceRef.current += 1;
      setFocusNonce(focusNonceRef.current);
    },
    [],
  );

  // Live-edit a queued recipe's content. Drives `commit`, so the hook's React
  // `items` — the single content owner the print deck derives from — updates in
  // step with storage. No separate page copy to keep in sync.
  const updateRecipe = useCallback(
    (id: string, recipe: Recipe) => {
      const nextRecipe = printableRecipe(recipe);
      const next = itemsRef.current.map((it) =>
        it.id === id
          ? { ...it, recipe: nextRecipe, title: nextRecipe.title || "Untitled recipe" }
          : it,
      );
      commit(next);
    },
    [commit],
  );

  const patch = useCallback(
    (id: string, changes: Partial<QueueItem>) => {
      let changed = false;
      const next = itemsRef.current.map((it) => {
        if (it.id !== id) return it;
        for (const [key, value] of Object.entries(changes) as Array<
          [keyof QueueItem, QueueItem[keyof QueueItem]]
        >) {
          if (!Object.is(it[key], value)) {
            changed = true;
            break;
          }
        }
        return changed ? { ...it, ...changes } : it;
      });
      if (changed) commit(next);
    },
    [commit],
  );

  // `origin` rides along purely for analytics: every import path funnels
  // through here, so this is the one place that can report success and
  // failure as a matched pair. Only the hostname is ever recorded, never the
  // full URL — which site broke is useful, what someone is cooking is not
  // ours to keep.
  const runParse = useCallback(
    async (
      id: string,
      origin: { source: ImportMethod; hostname?: string },
      // A URL parse can yield several recipes (a "roundup" page); image/text parses
      // yield one. A multi result lands the first recipe on this item and blooms the
      // rest into their own ready items — see below.
      work: () => Promise<Recipe | Recipe[]>,
      // The exact input handed to the parser, stashed for debugging if the parse
      // fails (see lib/failedImportCapture.ts): the photos for an image import,
      // or the pasted text / URL for the others. An image import passes a live
      // array it rewrites once the photos compress, so a decode failure keeps
      // the originals and a parse failure keeps what the parser actually saw.
      opts?: { failedImages?: Array<Blob | string>; failedText?: string },
    ) => {
      patch(id, { status: "parsing", error: undefined });
      track("recipe_import_started", origin);
      try {
        const result = await work();
        const recipes = Array.isArray(result) ? result : [result];
        // parseUrlAll/parseImages/parseText throw rather than resolve empty, so this
        // is a defensive guard, not an expected branch.
        if (recipes.length === 0) {
          throw new ImportError(
            "We couldn't find a complete recipe on that page. Try another link or paste the recipe text instead.",
            "no_recipe",
          );
        }
        const [first, ...rest] = recipes;
        patch(id, { status: "ready", recipe: first, title: first.title || "Untitled recipe" });
        track("recipe_imported", origin);
        if (rest.length > 0) {
          // A roundup URL: keep the first recipe on this item and add the rest as
          // their own ready items, mirroring this item's URL context so retry/dedupe
          // still key off the same source. Count each as its own import.
          const base = itemsRef.current.find((it) => it.id === id);
          const extras: QueueItem[] = rest.map((recipe) => ({
            id: uid(),
            method: base?.method ?? "url",
            source: base?.source ?? origin.hostname ?? "",
            originalUrl: base?.originalUrl,
            status: "ready",
            title: recipe.title || "Untitled recipe",
            recipe,
            addedAt: Date.now(),
          }));
          commit([...itemsRef.current, ...extras]);
          rest.forEach(() => track("recipe_imported", origin));
          track("multi_recipe_found", {
            source: origin.source,
            hostname: origin.hostname,
            count: recipes.length,
          });
        }
      } catch (err) {
        // A reserved documentation domain gets its own answer. The generic
        // "check the link and try again" treats a deliberate placeholder as a
        // typo in a real address, and it is the one failure where we know
        // exactly what happened.
        const placeholder = origin.hostname ? placeholderHostMessage(origin.hostname) : null;
        const reason = truncateReason(err);
        const category = err instanceof ImportError ? err.code : "unknown";
        patch(id, {
          status: "error",
          error:
            placeholder ??
            (err instanceof ImportError
              ? err.message
              : "We couldn't import that recipe. Check the source and try again."),
          // Carried on the item so the toast can be short without inventing a
          // reason: a placeholder host is its own bucket, not a parse failure.
          errorCode: placeholder ? "placeholder" : category,
        });
        // A reserved address is someone trying the box out, not a site that
        // failed to parse, so nothing about it is worth reproducing later. It
        // stays out of `debugInbox` entirely: the inbox is the list you read to
        // find real bugs, and every placeholder in it is a row you have to
        // recognise and dismiss before you reach one that matters.
        let debugPath: string | null = null;
        if (!placeholder) {
          // Best-effort: stash the failed input and link the event to it. `await`
          // only to attach the path — capture never throws (see module).
          const captureMeta = { source: origin.source, category, reason };
          // Bytes to Storage (only an image has any), then one row in
          // `debugInbox` either way, carrying the URL or the pasted text itself
          // and a pointer to those bytes.
          debugPath = opts?.failedImages?.length
            ? await captureFailedImportImages(opts.failedImages, captureMeta)
            : null;
          await recordFailedImport(captureMeta, {
            payload: opts?.failedText,
            imagePath: debugPath,
            imageCount: opts?.failedImages?.length ?? 0,
          });
        }
        track("recipe_import_failed", {
          ...origin,
          reason,
          // Its own bucket, so a placeholder is never counted among the
          // not_found and unknown failures that describe the real parser.
          category: placeholder ? "placeholder" : category,
          ...(debugPath ? { debugPath } : {}),
        });
      }
    },
    [patch, commit],
  );

  const addUrl = useCallback(
    (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) return;
      const key = canonicalUrl(url);
      const duplicate = key
        ? itemsRef.current.find(
            (item) => item.method === "url" && item.originalUrl && canonicalUrl(item.originalUrl) === key,
          )
        : null;
      if (duplicate) {
        focusItem(duplicate.id);
        return;
      }

      const normalizedUrl = normalizeImportURL(url);
      // Compute the hostname once — hostnameOf re-normalizes and re-parses its
      // input, so the source/title/analytics all reuse this instead of 3 calls.
      const host = hostnameOf(normalizedUrl);
      const id = uid();
      const item: QueueItem = {
        id,
        method: "url",
        source: host,
        originalUrl: normalizedUrl,
        status: "parsing",
        title: host,
        addedAt: Date.now(),
      };
      commit([...itemsRef.current, item]);
      void runParse(
        id,
        { source: "url", hostname: host },
        () => parseUrlAll(normalizedUrl),
        { failedText: normalizedUrl },
      );
    },
    [commit, focusItem, runParse],
  );

  /** The queue item every photo import starts as, before anything is read. */
  const queueImageItem = useCallback(
    (label: string): string => {
      const id = uid();
      const item: QueueItem = {
        id,
        method: "image",
        source: label,
        status: "parsing",
        title: label,
        addedAt: Date.now(),
      };
      commit([...itemsRef.current, item]);
      return id;
    },
    [commit],
  );

  /**
   * Adds photos straight from the picker — the path every importer takes.
   *
   * Decoding and downscaling them (HEIC transcode included) is part of the
   * import, not a step before it. It used to run in the import form, which
   * meant the queue item only appeared once the photos were ready: the deck sat
   * empty through the slowest part of a photo import, and a photo the browser
   * could not read failed in a form that had already closed behind it, so the
   * import simply evaporated. Now the placeholder goes up first and `runParse`
   * owns the whole job, so a photo import waits, succeeds and fails exactly the
   * way a link does.
   */
  const addImageFiles = useCallback(
    (files: File[], label: string) => {
      if (files.length === 0) return;
      const id = queueImageItem(label);
      // Live array: the originals until they compress, then what the parser was
      // actually handed. Whichever it holds when something throws is what gets
      // stashed for debugging.
      const failedImages: Array<Blob | string> = [...files];
      void runParse(
        id,
        { source: "image" },
        async () => {
          const images = await prepareImageDataUrls(files);
          failedImages.splice(0, failedImages.length, ...images);
          return parseImages(images);
        },
        { failedImages },
      );
    },
    [queueImageItem, runParse],
  );

  /** Photos that were already decoded elsewhere — the SEO capture block reads
      them on its own page and hands the results over (see lib/pendingImport). */
  const addImages = useCallback(
    (images: string[], label: string) => {
      if (images.length === 0) return;
      const id = queueImageItem(label);
      void runParse(id, { source: "image" }, () => parseImages(images), { failedImages: images });
    },
    [queueImageItem, runParse],
  );

  const addText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const id = uid();
      // Use the first non-empty line as a provisional title.
      const firstLine = trimmed.split("\n").map((l) => l.trim()).find(Boolean) ?? "Pasted recipe";
      const item: QueueItem = {
        id,
        method: "text",
        source: "Pasted text",
        status: "parsing",
        title: firstLine.slice(0, 60),
        addedAt: Date.now(),
      };
      textPayloads.current.set(id, trimmed);
      commit([...itemsRef.current, item]);
      void runParse(id, { source: "text" }, () => parseText(trimmed), { failedText: trimmed });
    },
    [commit, runParse],
  );

  /**
   * Adds recipes that arrive already parsed — a CookPilot library, a Paprika
   * export. Source-agnostic on purpose: these skip `runParse` entirely, so the
   * only thing this needs to know is that they are finished.
   */
  const addReadyRecipes = useCallback(
    (recipes: QueueItem[]) => {
      if (recipes.length === 0) return 0;
      const existingIds = new Set(itemsRef.current.map((item) => item.id));
      const nextRecipes = recipes.filter((recipe) => !existingIds.has(recipe.id));
      if (nextRecipes.length === 0) return 0;
      commit([...itemsRef.current, ...nextRecipes]);
      // These arrive already parsed, so they never touch runParse — count them
      // here or the library sources silently miss from every import total.
      // No started/failed pair: there's no parse step that could fail.
      nextRecipes.forEach((recipe) => {
        track("recipe_imported", { source: recipe.method });
      });
      return nextRecipes.length;
    },
    [commit],
  );

  /** Whether a failed item can be retried in place (URL + text only). */
  const canRetry = useCallback((item: QueueItem) => {
    if (item.method === "url") return Boolean(item.originalUrl);
    if (item.method === "text") return textPayloads.current.has(item.id);
    return false; // images must be re-added
  }, []);

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((it) => it.id === id);
      if (!item) return;
      if (item.method === "url" && item.originalUrl) {
        const url = item.originalUrl;
        void runParse(id, { source: "url", hostname: hostnameOf(url) }, () => parseUrlAll(url), {
          failedText: url,
        });
      } else if (item.method === "text") {
        const text = textPayloads.current.get(id);
        if (text) void runParse(id, { source: "text" }, () => parseText(text), { failedText: text });
      }
    },
    [runParse],
  );

  const remove = useCallback(
    (id: string) => {
      textPayloads.current.delete(id);
      const going = itemsRef.current.find((it) => it.id === id);
      if (going?.localPhotoId) void deleteLocalPhoto(going.localPhotoId);
      commit(itemsRef.current.filter((it) => it.id !== id));
    },
    [commit],
  );

  const clear = useCallback(() => {
    textPayloads.current.clear();
    for (const item of itemsRef.current) {
      if (item.localPhotoId) void deleteLocalPhoto(item.localPhotoId);
    }
    setFocusedItemId(null);
    commit([]);
  }, [commit]);

  /** Replaces the browser queue when opening a saved project. */
  const replaceAll = useCallback(
    (next: QueueItem[]) => {
      textPayloads.current.clear();
      setFocusedItemId(next[0]?.id ?? null);
      commit(next);
      // The project may be older than this document — any photo it is still
      // holding locally needs a URL that works here.
      void rehydrateLocalPhotos(next);
    },
    [commit, rehydrateLocalPhotos],
  );

  return {
    items,
    focusedItemId,
    focusNonce,
    hydrated,
    hydratedWithItems,
    addUrl,
    addImages,
    addImageFiles,
    addText,
    addReadyRecipes,
    retry,
    canRetry,
    remove,
    clear,
    replaceAll,
    focusItem,
    updateRecipe,
  };
}
