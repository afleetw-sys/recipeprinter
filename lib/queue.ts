"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { QueueItem, Recipe } from "@/types/recipe";
import { parseImages, parseText, parseUrl } from "@/lib/parser";

// The print queue is session-based for the MVP — no accounts, no saved library.
// It survives navigation to /print (same tab) via sessionStorage.
export const QUEUE_STORAGE_KEY = "recipeprinter:queue:v1";

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

function writeQueue(items: QueueItem[]) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* sessionStorage may be unavailable (private mode); queue stays in memory */
  }
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function useQueue() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const itemsRef = useRef<QueueItem[]>([]);
  // Pasted text payloads are kept in memory only (too large/private to persist)
  // so a failed text import can be retried within the same session.
  const textPayloads = useRef<Map<string, string>>(new Map());

  // Hydrate from sessionStorage on mount (client only).
  useEffect(() => {
    const initial = readQueue();
    itemsRef.current = initial;
    setItems(initial);
    setHydrated(true);
  }, []);

  const commit = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
    writeQueue(next);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<QueueItem>) => {
      commit(itemsRef.current.map((it) => (it.id === id ? { ...it, ...changes } : it)));
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
      const id = uid();
      const item: QueueItem = {
        id,
        method: "url",
        source: hostnameOf(url),
        originalUrl: url,
        status: "parsing",
        title: hostnameOf(url),
        selected: true,
        addedAt: Date.now(),
      };
      commit([...itemsRef.current, item]);
      void runParse(id, () => parseUrl(url));
    },
    [commit, runParse],
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
        selected: true,
        addedAt: Date.now(),
      };
      commit([...itemsRef.current, item]);
      void runParse(id, () => parseImages(images));
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
        selected: true,
        addedAt: Date.now(),
      };
      textPayloads.current.set(id, trimmed);
      commit([...itemsRef.current, item]);
      void runParse(id, () => parseText(trimmed));
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

  const clear = useCallback(() => commit([]), [commit]);

  return {
    items,
    hydrated,
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
  };
}
