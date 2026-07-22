"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ImportMethod, QueueItem, Recipe } from "@/types/recipe";
import { track, truncateReason } from "@/lib/analytics";
import { parseImages, parseText, parseUrl } from "@/lib/parser";
import { normalizeImportURL } from "@/lib/cookpilot";
import { hostnameOf as rawHostnameOf } from "@/lib/url";
import { uid } from "@/lib/ids";
import { sessionStore } from "@/lib/storage";

// The print queue is session-based for the MVP, no accounts, no saved library.
// It survives navigation to /print (same tab) via sessionStorage.
export const QUEUE_STORAGE_KEY = "recipeprinter:queue:v1";
const CURRENT_PRINT_JOB_STORAGE_KEY = "recipeprinter:print-job:current:v1";

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
  const raw = sessionStore.get(QUEUE_STORAGE_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  // Re-persist only when sanitizing actually changed something, so a normal
  // read isn't a write. Compared against the raw string rather than the parsed
  // value because that's what's already in storage.
  const sanitized = printableQueue(parsed as QueueItem[]);
  const sanitizedRaw = JSON.stringify(sanitized);
  if (sanitizedRaw !== raw) writeSerializedQueue(sanitizedRaw);
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

export function updateQueuedRecipe(id: string, recipe: Recipe): QueueItem[] {
  const nextRecipe = printableRecipe(recipe);
  const next = readQueue().map((item) =>
    item.id === id
      ? {
          ...item,
          recipe: nextRecipe,
          title: nextRecipe.title || "Untitled recipe",
        }
      : item,
  );
  const serialized = serializeQueue(next);
  if (serialized) writeSerializedQueue(serialized);
  return next;
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
  const [hydrated, setHydrated] = useState(false);
  const [hydratedWithItems, setHydratedWithItems] = useState(false);
  const itemsRef = useRef<QueueItem[]>([]);
  const serializedItemsRef = useRef<string | null>(null);
  // Pasted text payloads are kept in memory only (too large/private to persist)
  // so a failed text import can be retried within the same session.
  const textPayloads = useRef<Map<string, string>>(new Map());

  // Hydrate from sessionStorage on mount (client only).
  useEffect(() => {
    const initial = readQueue();
    itemsRef.current = initial;
    serializedItemsRef.current = serializeQueue(initial);
    setItems(initial);
    setHydratedWithItems(initial.length > 0);
    setHydrated(true);
  }, []);

  const commit = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
    const serialized = serializeQueue(next);
    if (serialized && serialized !== serializedItemsRef.current) {
      serializedItemsRef.current = serialized;
      writeSerializedQueue(serialized);
    }
  }, []);

  const focusItem = useCallback(
    (id: string) => {
      const existing = itemsRef.current.find((it) => it.id === id);
      if (!existing) return;
      setFocusedItemId(id);
    },
    [],
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
      work: () => Promise<Recipe>,
    ) => {
      patch(id, { status: "parsing", error: undefined });
      track("recipe_import_started", origin);
      try {
        const recipe = await work();
        patch(id, { status: "ready", recipe, title: recipe.title || "Untitled recipe" });
        track("recipe_imported", origin);
      } catch (err) {
        patch(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong while parsing.",
        });
        track("recipe_import_failed", { ...origin, reason: truncateReason(err) });
      }
    },
    [patch],
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
      const id = uid();
      const item: QueueItem = {
        id,
        method: "url",
        source: hostnameOf(normalizedUrl),
        originalUrl: normalizedUrl,
        status: "parsing",
        title: hostnameOf(normalizedUrl),
        addedAt: Date.now(),
      };
      commit([...itemsRef.current, item]);
      void runParse(id, { source: "url", hostname: hostnameOf(normalizedUrl) }, () =>
        parseUrl(normalizedUrl),
      );
    },
    [commit, focusItem, runParse],
  );

  const addImages = useCallback(
    (images: string[], label: string) => {
      if (images.length === 0) return;
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
      void runParse(id, { source: "image" }, () => parseImages(images));
    },
    [commit, runParse],
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
      void runParse(id, { source: "text" }, () => parseText(trimmed));
    },
    [commit, runParse],
  );

  const addCookPilotRecipes = useCallback(
    (recipes: QueueItem[]) => {
      if (recipes.length === 0) return 0;
      const existingIds = new Set(itemsRef.current.map((item) => item.id));
      const nextRecipes = recipes.filter((recipe) => !existingIds.has(recipe.id));
      if (nextRecipes.length === 0) return 0;
      commit([...itemsRef.current, ...nextRecipes]);
      // These arrive already parsed, so they never touch runParse — count them
      // here or the CookPilot path silently misses from every import total.
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
        void runParse(id, { source: "url", hostname: hostnameOf(url) }, () => parseUrl(url));
      } else if (item.method === "text") {
        const text = textPayloads.current.get(id);
        if (text) void runParse(id, { source: "text" }, () => parseText(text));
      }
    },
    [runParse],
  );

  const remove = useCallback(
    (id: string) => {
      textPayloads.current.delete(id);
      commit(itemsRef.current.filter((it) => it.id !== id));
    },
    [commit],
  );

  const clear = useCallback(() => {
    textPayloads.current.clear();
    setFocusedItemId(null);
    commit([]);
  }, [commit]);

  return {
    items,
    focusedItemId,
    hydrated,
    hydratedWithItems,
    addUrl,
    addImages,
    addText,
    addCookPilotRecipes,
    retry,
    canRetry,
    remove,
    clear,
    focusItem,
  };
}
