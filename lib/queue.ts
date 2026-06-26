"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueItem, Recipe } from "@/types/recipe";
import { parseImages, parseText, parseUrl } from "@/lib/parser";
import { normalizeImportURL } from "@/lib/cookpilot";

// The print queue is session-based for the MVP, no accounts, no saved library.
// It survives navigation to /print (same tab) via sessionStorage.
export const QUEUE_STORAGE_KEY = "recipeprinter:queue:v1";
const CURRENT_PRINT_JOB_STORAGE_KEY = "recipeprinter:print-job:current:v1";
const PRINT_JOB_STORAGE_PREFIX = "recipeprinter:print-job:v1:";
const PRINT_JOB_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PrintJob {
  ids: string[];
  createdAt: number;
}

function uid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readQueue(): QueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueueItem[]) : [];
  } catch {
    return [];
  }
}

function printJobStorageKey(id: string): string {
  return `${PRINT_JOB_STORAGE_PREFIX}${id}`;
}

function pruneOldPrintJobs(now = Date.now()) {
  if (typeof window === "undefined") return;
  try {
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(PRINT_JOB_STORAGE_PREFIX)) continue;
      const raw = window.sessionStorage.getItem(key);
      const parsed = raw ? (JSON.parse(raw) as Partial<PrintJob>) : null;
      if (!parsed?.createdAt || now - parsed.createdAt > PRINT_JOB_MAX_AGE_MS) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    /* Ignore storage cleanup failures; print jobs are short-lived conveniences. */
  }
}

export function createPrintJob(ids: string[]): string | null {
  if (typeof window === "undefined" || ids.length === 0) return null;
  const id = uid();
  const job: PrintJob = { ids, createdAt: Date.now() };
  try {
    pruneOldPrintJobs(job.createdAt);
    window.sessionStorage.setItem(printJobStorageKey(id), JSON.stringify(job));
    window.sessionStorage.setItem(CURRENT_PRINT_JOB_STORAGE_KEY, JSON.stringify(job));
    return id;
  } catch {
    return null;
  }
}

export function createCurrentPrintJob(ids: string[]): boolean {
  if (typeof window === "undefined" || ids.length === 0) return false;
  const job: PrintJob = { ids, createdAt: Date.now() };
  try {
    pruneOldPrintJobs(job.createdAt);
    window.sessionStorage.setItem(CURRENT_PRINT_JOB_STORAGE_KEY, JSON.stringify(job));
    return true;
  } catch {
    return false;
  }
}

function idsFromPrintJob(raw: string | null): string[] | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Partial<PrintJob>;
  return Array.isArray(parsed.ids) ? parsed.ids.filter((value) => typeof value === "string") : null;
}

export function readCurrentPrintJobIds(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    return idsFromPrintJob(window.sessionStorage.getItem(CURRENT_PRINT_JOB_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function readPrintJobIds(id: string): string[] | null {
  if (typeof window === "undefined" || !id) return null;
  try {
    return idsFromPrintJob(window.sessionStorage.getItem(printJobStorageKey(id)));
  } catch {
    return null;
  }
}

function serializeQueue(items: QueueItem[]): string | null {
  try {
    return JSON.stringify(items);
  } catch {
    return null;
  }
}

function writeSerializedQueue(serialized: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(QUEUE_STORAGE_KEY, serialized);
  } catch {
    /* sessionStorage may be unavailable (private mode); queue stays in memory */
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(normalizeImportURL(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

function textKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function imageKey(images: string[]): string {
  return images.join("\n");
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
  const imagePayloadKeys = useRef<Map<string, string>>(new Map());

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
      if (existing.status === "ready" && !existing.selected) {
        commit(itemsRef.current.map((it) => (it.id === id ? { ...it, selected: true } : it)));
      }
      setFocusedItemId(id);
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

  const runParse = useCallback(
    async (id: string, work: () => Promise<Recipe>) => {
      patch(id, { status: "parsing", error: undefined });
      try {
        const recipe = await work();
        patch(id, { status: "ready", recipe, title: recipe.title || "Untitled recipe" });
      } catch (err) {
        patch(id, {
          status: "error",
          error: err instanceof Error ? err.message : "Something went wrong while parsing.",
        });
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
        selected: true,
        addedAt: Date.now(),
      };
      commit([...itemsRef.current, item]);
      void runParse(id, () => parseUrl(normalizedUrl));
    },
    [commit, focusItem, runParse],
  );

  const addImages = useCallback(
    (images: string[], label: string) => {
      if (images.length === 0) return;
      const key = imageKey(images);
      const duplicateId = Array.from(imagePayloadKeys.current.entries()).find(
        ([, existingKey]) => existingKey === key,
      )?.[0];
      if (duplicateId && itemsRef.current.some((item) => item.id === duplicateId)) {
        focusItem(duplicateId);
        return;
      }

      const id = uid();
      const item: QueueItem = {
        id,
        method: "image",
        source: label,
        status: "parsing",
        title: label,
        selected: true,
        addedAt: Date.now(),
      };
      imagePayloadKeys.current.set(id, key);
      commit([...itemsRef.current, item]);
      void runParse(id, () => parseImages(images));
    },
    [commit, focusItem, runParse],
  );

  const addText = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      const key = textKey(trimmed);
      const duplicateId = Array.from(textPayloads.current.entries()).find(
        ([, existingText]) => textKey(existingText) === key,
      )?.[0];
      if (duplicateId && itemsRef.current.some((item) => item.id === duplicateId)) {
        focusItem(duplicateId);
        return;
      }

      const id = uid();
      // Use the first non-empty line as a provisional title.
      const firstLine = trimmed.split("\n").map((l) => l.trim()).find(Boolean) ?? "Pasted recipe";
      const item: QueueItem = {
        id,
        method: "text",
        source: "Pasted text",
        status: "parsing",
        title: firstLine.slice(0, 60),
        selected: true,
        addedAt: Date.now(),
      };
      textPayloads.current.set(id, trimmed);
      commit([...itemsRef.current, item]);
      void runParse(id, () => parseText(trimmed));
    },
    [commit, focusItem, runParse],
  );

  const addCookPilotRecipes = useCallback(
    (recipes: QueueItem[]) => {
      if (recipes.length === 0) return 0;
      const existingIds = new Set(itemsRef.current.map((item) => item.id));
      const nextRecipes = recipes.filter((recipe) => !existingIds.has(recipe.id));
      if (nextRecipes.length === 0) {
        focusItem(recipes[0].id);
        return 0;
      }
      commit([...itemsRef.current, ...nextRecipes]);
      return nextRecipes.length;
    },
    [commit, focusItem],
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
        void runParse(id, () => parseUrl(url));
      } else if (item.method === "text") {
        const text = textPayloads.current.get(id);
        if (text) void runParse(id, () => parseText(text));
      }
    },
    [runParse],
  );

  const remove = useCallback(
    (id: string) => {
      textPayloads.current.delete(id);
      imagePayloadKeys.current.delete(id);
      commit(itemsRef.current.filter((it) => it.id !== id));
    },
    [commit],
  );

  const toggleSelected = useCallback(
    (id: string) =>
      commit(
        itemsRef.current.map((it) =>
          it.id === id ? { ...it, selected: !it.selected } : it,
        ),
      ),
    [commit],
  );

  const setAllSelected = useCallback(
    (selected: boolean) =>
      commit(
        itemsRef.current.map((it) =>
          it.status === "ready" ? { ...it, selected } : it,
        ),
      ),
    [commit],
  );

  const clear = useCallback(() => {
    textPayloads.current.clear();
    imagePayloadKeys.current.clear();
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
    toggleSelected,
    setAllSelected,
    clear,
    focusItem,
  };
}
