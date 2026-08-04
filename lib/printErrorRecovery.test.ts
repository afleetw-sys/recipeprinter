import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimChunkErrorReload,
  isChunkLoadError,
  markPrintPreviewStable,
  recordPrintError,
} from "./printErrorRecovery";

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
});

describe("print preview recovery", () => {
  it("recognizes stale dynamic chunk failures", () => {
    const error = new Error("Loading chunk 123 failed.");
    error.name = "ChunkLoadError";
    expect(isChunkLoadError(error)).toBe(true);
    expect(isChunkLoadError(new Error("Recipe data is invalid"))).toBe(false);
  });

  it("allows only one full reload inside the failure window", () => {
    expect(claimChunkErrorReload(1_000)).toBe(true);
    expect(claimChunkErrorReload(2_000)).toBe(false);
    expect(claimChunkErrorReload(32_000)).toBe(true);
  });

  it("escalates repeated crashes and clears after a stable mount", () => {
    expect(recordPrintError(1_000)).toMatchObject({ shouldRetry: true, attempt: 1 });
    expect(recordPrintError(2_000)).toMatchObject({ shouldRetry: true, attempt: 2 });
    expect(recordPrintError(3_000)).toMatchObject({ shouldRetry: true, attempt: 3 });
    expect(recordPrintError(4_000)).toMatchObject({ shouldRetry: false, attempt: 4 });

    markPrintPreviewStable();
    expect(recordPrintError(5_000)).toMatchObject({ shouldRetry: true, attempt: 1 });
  });
});
