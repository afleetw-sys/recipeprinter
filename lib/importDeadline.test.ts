// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushQueueWrites, useQueue } from "@/lib/queue";
import { IMPORT_METER_CALLABLE } from "@/lib/importMeter";
import { URL_IMPORT_DEADLINE_MS } from "@/lib/parser";

/**
 * A link import has one time limit for everything after the meter: the
 * `/api/parse` fetch and the callable fallback together. Without it the two
 * waits stacked (the fetch had none of its own), the spinner stayed up for
 * minutes, and the cook's reload turned it into "This import was interrupted".
 *
 * The parser is the real one here, on purpose: the limit lives in it, and the
 * queue's part is that the expiry goes down its ordinary failure path. Only
 * the network is a mock. Never a live import: those bill ScraperAPI.
 */

const { callable, track, recordFailedImport } = vi.hoisted(() => ({
  callable: vi.fn(),
  track: vi.fn(),
  recordFailedImport: vi.fn(),
}));

vi.mock("firebase/functions", () => ({
  httpsCallable: (_fns: unknown, name: string) => (data: unknown) => callable(name, data),
}));
vi.mock("@/lib/firebase/functions", () => ({ getFns: () => ({}) }));
// Only the real site talks to the meter (`meterReachableHere`).
vi.mock("@/lib/appEnvironment", () => ({ isProductionRuntime: () => true }));
vi.mock("@/lib/analytics", () => ({ track, truncateReason: (e: unknown) => String(e) }));
vi.mock("@/lib/failedImportCapture", () => ({
  captureFailedImportImages: vi.fn(() => null),
  recordFailedImport,
}));
vi.mock("@/lib/importCorrections", () => ({ noteImported: vi.fn(), noteRecipeEdited: vi.fn() }));

const URL_PARSER = "parseRecipeFromURL";
const RESERVED = { mode: "measure", allowed: true, used: 1, limit: 10 };
const NEVER = new Promise<never>(() => {});

/** What the URL parser callable does; the meter always answers at once. */
function parserCallable(parse: () => Promise<unknown>) {
  callable.mockImplementation((name: string, data: { op?: string }) => {
    if (name === URL_PARSER) return parse();
    return Promise.resolve({ data: data.op === "reserve" ? RESERVED : { ok: true } });
  });
}

function callsTo(name: string) {
  return callable.mock.calls.filter(([called]) => called === name);
}

function settles() {
  return callsTo(IMPORT_METER_CALLABLE)
    .map(([, data]) => data as { op: string; outcome?: string })
    .filter((data) => data.op === "settle");
}

function failures() {
  return track.mock.calls
    .filter(([event]) => event === "recipe_import_failed")
    .map(([, props]) => props as { category: string });
}

/** `/api/parse` that never answers, and gives up only when it is aborted. */
function routeHangs() {
  const signals: AbortSignal[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          if (!init?.signal) return;
          signals.push(init.signal);
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    ),
  );
  return signals;
}

/** `/api/parse` that answers at once without having reached the parser. */
function routeReplies(status: number, body: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ status, json: async () => body })));
}

function startImport() {
  const hook = renderHook(() => useQueue());
  act(() => hook.result.current.configureImportGates({ singleRecipeOnly: false }));
  act(() => hook.result.current.addUrl("https://beetroot-kitchen.com/borscht"));
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  recordFailedImport.mockResolvedValue(undefined);
  parserCallable(() => NEVER);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  flushQueueWrites();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("a link import that outlives its deadline", () => {
  test("stops the route request, never starts the fallback, and fails as a timeout", async () => {
    const signals = routeHangs();
    const { result } = startImport();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

    await vi.advanceTimersByTimeAsync(URL_IMPORT_DEADLINE_MS - 5_000);
    expect(signals[0]?.aborted).toBe(false);
    expect(result.current.items[0]?.status).toBe("parsing");

    await vi.advanceTimersByTimeAsync(5_000);
    await vi.waitFor(() => expect(failures()).toHaveLength(1));
    expect(failures()[0]).toMatchObject({ source: "url", category: "timeout" });
    expect(signals[0]?.aborted).toBe(true);
    expect(callsTo(URL_PARSER)).toHaveLength(0);
    await vi.waitFor(() =>
      expect(result.current.items[0]).toMatchObject({ status: "error", errorCode: "timeout" }),
    );
    await vi.waitFor(() => expect(settles()).toEqual([expect.objectContaining({ outcome: "failure" })]));
  });

  test("stops waiting on a fallback that is still running", async () => {
    routeReplies(502, { success: false, error: "Upstream failed." });
    const { result } = startImport();
    await vi.waitFor(() => expect(callsTo(URL_PARSER)).toHaveLength(1));

    await vi.advanceTimersByTimeAsync(URL_IMPORT_DEADLINE_MS);
    await vi.waitFor(() => expect(failures()).toHaveLength(1));
    expect(failures()[0]).toMatchObject({ category: "timeout" });
    await vi.waitFor(() =>
      expect(result.current.items[0]).toMatchObject({ status: "error", errorCode: "timeout" }),
    );
    await vi.waitFor(() => expect(settles()).toEqual([expect.objectContaining({ outcome: "failure" })]));
  });

  test("does not retry a dropped fallback once the deadline has passed", async () => {
    routeReplies(502, { success: false, error: "Upstream failed." });
    let drop: (err: unknown) => void = () => {};
    parserCallable(() => new Promise((_resolve, reject) => (drop = reject)));
    startImport();
    await vi.waitFor(() => expect(callsTo(URL_PARSER)).toHaveLength(1));

    // The connection drops just inside the deadline, so the pause before the
    // one retry carries it past.
    await vi.advanceTimersByTimeAsync(URL_IMPORT_DEADLINE_MS - 500);
    drop(Object.assign(new Error("internal"), { code: "functions/internal" }));
    await vi.advanceTimersByTimeAsync(10_000);

    await vi.waitFor(() => expect(failures()).toHaveLength(1));
    expect(failures()[0]).toMatchObject({ category: "timeout" });
    expect(callsTo(URL_PARSER)).toHaveLength(1);
  });
});

describe("a slow debug capture", () => {
  test("does not hold back the failure event", async () => {
    routeReplies(422, { success: false, error: "No recipe.", parserExhausted: true, failure: "no_recipe" });
    recordFailedImport.mockReturnValue(NEVER);
    startImport();
    await vi.waitFor(() => expect(recordFailedImport).toHaveBeenCalledTimes(1));
    expect(failures()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(3_000);
    await vi.waitFor(() => expect(failures()).toHaveLength(1));
    expect(failures()[0]).toMatchObject({ category: "no_recipe" });
  });
});
