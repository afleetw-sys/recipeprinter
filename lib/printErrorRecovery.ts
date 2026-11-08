import { useEffect, useState } from "react";
import { sessionStore } from "@/lib/storage";

const STORAGE_KEY = "recipeprinter:print-error-recovery:v1";
const CHUNK_RELOAD_STORAGE_KEY = "recipeprinter:chunk-error-reload:v1";
const RETRY_DELAYS_MS = [250, 750, 1500] as const;
const FAILURE_WINDOW_MS = 30_000;

type RecoveryRecord = {
  attempts: number;
  lastFailureAt: number;
};

export type PrintErrorRecovery = {
  shouldRetry: boolean;
  delayMs: number;
  attempt: number;
};

export function recordPrintError(now = Date.now()): PrintErrorRecovery {
  // Null covers "nothing recorded yet", "unparseable", and "storage is
  // unavailable in a privacy-restricted browser" — and all three should mean
  // the same thing here: this is attempt one, so recovery still gets its
  // immediate try rather than failing itself.
  const previous = sessionStore.getJson<RecoveryRecord>(STORAGE_KEY);

  const attempts =
    previous && now - previous.lastFailureAt < FAILURE_WINDOW_MS ? previous.attempts + 1 : 1;

  // Best effort; reset() remains safe without persisted bookkeeping.
  sessionStore.setJson(STORAGE_KEY, { attempts, lastFailureAt: now });

  const delayMs = RETRY_DELAYS_MS[attempts - 1];
  return {
    shouldRetry: delayMs !== undefined,
    delayMs: delayMs ?? 0,
    attempt: attempts,
  };
}

export function markPrintPreviewStable(): void {
  // Nothing else depends on recovery bookkeeping being writable.
  sessionStore.remove(STORAGE_KEY);
  sessionStore.remove(CHUNK_RELOAD_STORAGE_KEY);
}

export function isChunkLoadError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    /ChunkLoadError|Loading chunk [^ ]+ failed|Failed to fetch dynamically imported module/i.test(
      error.message,
    )
  );
}

/** Whether a chunk-error reload may happen now (one hasn't just been tried). Reads only. */
export function chunkReloadAllowed(now = Date.now()): boolean {
  // An unreadable marker reads as absent (`Number(null)` is 0, which fails the
  // `> 0` test), so storage being unavailable lands on the same answer the old
  // catch gave: reload once, because reloading is still the best recovery when
  // there is nowhere to record that we did.
  const lastReload = Number(sessionStore.get(CHUNK_RELOAD_STORAGE_KEY));
  return !(Number.isFinite(lastReload) && lastReload > 0 && now - lastReload < FAILURE_WINDOW_MS);
}

export function claimChunkErrorReload(now = Date.now()): boolean {
  if (!chunkReloadAllowed(now)) return false;
  sessionStore.set(CHUNK_RELOAD_STORAGE_KEY, String(now));
  return true;
}

/**
 * For an error page: when the crash is a script file missing from an old build
 * (a tab left open across a deploy), reload once to fetch the current build.
 * Returns true while that reload is under way, so the page can say so instead
 * of showing an error. A remount would keep the stale runtime and ask for the
 * same missing file; only a real reload helps. Never twice within 30 seconds,
 * so a reload that didn't fix it falls through to the page's error screen.
 */
export function useReloadOnChunkError(error: Error): boolean {
  // Decided once, from a read: StrictMode runs this initializer twice.
  const [reloading] = useState(() => isChunkLoadError(error) && chunkReloadAllowed());
  useEffect(() => {
    if (reloading && claimChunkErrorReload()) window.location.reload();
  }, [reloading]);
  return reloading;
}

export const PRINT_PREVIEW_STABILITY_MS = 5_000;
