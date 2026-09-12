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

export function claimChunkErrorReload(now = Date.now()): boolean {
  // An unreadable marker reads as absent (`Number(null)` is 0, which fails the
  // `> 0` test), so storage being unavailable lands on the same answer the old
  // catch gave: reload once, because reloading is still the best recovery when
  // there is nowhere to record that we did.
  const lastReload = Number(sessionStore.get(CHUNK_RELOAD_STORAGE_KEY));
  if (Number.isFinite(lastReload) && lastReload > 0 && now - lastReload < FAILURE_WINDOW_MS) {
    return false;
  }
  sessionStore.set(CHUNK_RELOAD_STORAGE_KEY, String(now));
  return true;
}

export const PRINT_PREVIEW_STABILITY_MS = 5_000;
