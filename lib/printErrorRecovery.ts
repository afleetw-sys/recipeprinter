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
  let previous: RecoveryRecord | null = null;

  try {
    previous = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as RecoveryRecord | null;
  } catch {
    // Storage can be unavailable in privacy-restricted browsers. Recovery
    // should still get one immediate attempt rather than failing itself.
  }

  const attempts =
    previous && now - previous.lastFailureAt < FAILURE_WINDOW_MS ? previous.attempts + 1 : 1;

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ attempts, lastFailureAt: now }));
  } catch {
    // Best effort only; reset() remains safe without persisted bookkeeping.
  }

  const delayMs = RETRY_DELAYS_MS[attempts - 1];
  return {
    shouldRetry: delayMs !== undefined,
    delayMs: delayMs ?? 0,
    attempt: attempts,
  };
}

export function markPrintPreviewStable(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(CHUNK_RELOAD_STORAGE_KEY);
  } catch {
    // Nothing else depends on recovery bookkeeping being writable.
  }
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
  try {
    const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_STORAGE_KEY));
    if (Number.isFinite(lastReload) && lastReload > 0 && now - lastReload < FAILURE_WINDOW_MS) {
      return false;
    }
    sessionStorage.setItem(CHUNK_RELOAD_STORAGE_KEY, String(now));
    return true;
  } catch {
    // Reloading once is still the best recovery when storage is unavailable.
    return true;
  }
}

export const PRINT_PREVIEW_STABILITY_MS = 5_000;
