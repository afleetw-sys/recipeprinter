// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushQueueWrites, useQueue } from "@/lib/queue";
import { IMPORT_METER_CALLABLE, IMPORT_METER_TIMEOUT_MS } from "@/lib/importMeter";

/**
 * The import meter's client rules (docs/import-meter-plan.md, 10.1): who is
 * metered, that the reservation lands before any parser request, that every
 * import settles exactly once, and that a missing or slow meter never stops an
 * import. The callable doesn't exist in production yet, which is the
 * "rejects" case below.
 *
 * Everything that talks to a server is a mock. Never a live import: those
 * bill ScraperAPI through CookPilot.
 */

const { parseUrlAll, parseImages, parseText, callCookPilotParser, track } = vi.hoisted(() => ({
  parseUrlAll: vi.fn(),
  parseImages: vi.fn(),
  parseText: vi.fn(),
  callCookPilotParser: vi.fn(),
  track: vi.fn(),
}));

vi.mock("@/lib/parser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/parser")>()),
  parseUrlAll,
  parseImages,
  parseText,
  callCookPilotParser,
}));
// The meter as it will be once CookPilot has it. Production ships with it off.
vi.mock("@/lib/importMeter", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/importMeter")>()),
  IMPORT_METER_DEPLOYED: true,
}));
vi.mock("@/lib/analytics", () => ({ track, truncateReason: (e: unknown) => String(e) }));
vi.mock("@/lib/failedImportCapture", () => ({
  captureFailedImportImages: vi.fn(async () => null),
  recordFailedImport: vi.fn(async () => undefined),
}));
vi.mock("@/lib/importCorrections", () => ({ noteImported: vi.fn(), noteRecipeEdited: vi.fn() }));
vi.mock("@/lib/importPreviews", () => ({ setImportPreview: vi.fn(), releaseImportPreview: vi.fn() }));

function recipe(title: string) {
  return { title, ingredients: [{ raw: "2 beets" }], instructions: [{ text: "Simmer." }] };
}

const RESERVED = { mode: "measure", allowed: true, used30d: 4, wouldBlock: { 5: false, 10: false }, subjectKind: "browser" };

/** The meter calls the queue made, as `op`s in order. */
function meterOps(): Array<{ op: string; outcome?: string }> {
  return callCookPilotParser.mock.calls
    .filter(([name]) => name === IMPORT_METER_CALLABLE)
    .map(([, data]) => data as { op: string; outcome?: string });
}

/** Each way a parser-backed import starts, and the parser mock it reaches. */
const METHODS = [
  { method: "url", parser: parseUrlAll, start: (q: ReturnType<typeof useQueue>, o?: { meterExempt?: boolean }) => q.addUrl("https://example.com/borscht", o) },
  { method: "image", parser: parseImages, start: (q: ReturnType<typeof useQueue>, o?: { meterExempt?: boolean }) => q.addImages(["data:image/png;base64,AAAA"], "Photo", o) },
  { method: "text", parser: parseText, start: (q: ReturnType<typeof useQueue>, o?: { meterExempt?: boolean }) => q.addText("Borscht\n2 beets\nSimmer.", o) },
] as const;

function setup(gates: { cookbookMode?: boolean; clientPro?: boolean } = {}) {
  const hook = renderHook(() => useQueue());
  act(() => hook.result.current.configureImportGates({ singleRecipeOnly: false, ...gates }));
  return hook;
}

beforeEach(() => {
  parseUrlAll.mockResolvedValue([recipe("Borscht")]);
  parseImages.mockResolvedValue(recipe("Borscht"));
  parseText.mockResolvedValue(recipe("Borscht"));
  callCookPilotParser.mockImplementation(async (_name: string, data: { op: string }) =>
    data.op === "reserve" ? RESERVED : { ok: true },
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  // The queue persists on a throttle; without this, the next test's queue
  // hydrates this one's recipes and dedupes the same link away.
  flushQueueWrites();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("who the meter sees", () => {
  test.each([
    { name: "cookbook mode", gates: { cookbookMode: true }, opts: undefined },
    { name: "the homepage replay into a new book", gates: {}, opts: { meterExempt: true } },
    { name: "a visitor this browser knows is Pro", gates: { clientPro: true }, opts: undefined },
  ])("never meters $name, for any import method", async ({ gates, opts }) => {
    for (const { start, parser } of METHODS) {
      const { result, unmount } = setup(gates);
      act(() => start(result.current, opts));
      await vi.waitFor(() => expect(parser).toHaveBeenCalled());
      unmount();
    }
    await vi.waitFor(() => expect(track.mock.calls.filter(([e]) => e === "recipe_imported")).toHaveLength(3));
    expect(meterOps()).toEqual([]);
  });

  test("meters a free card-mode import: one reserve, then one settle", async () => {
    for (const { start, method } of METHODS) {
      callCookPilotParser.mockClear();
      const { result, unmount } = setup();
      act(() => start(result.current));
      await vi.waitFor(() => expect(meterOps()).toHaveLength(2));
      expect(meterOps()).toMatchObject([{ op: "reserve", method }, { op: "settle", outcome: "success" }]);
      unmount();
    }
  });
});

describe("the reservation comes before the parse", () => {
  test.each(METHODS)("$method: the parser isn't asked until reserve resolves", async ({ start, parser }) => {
    let answer: (value: unknown) => void = () => {};
    callCookPilotParser.mockImplementation((_name: string, data: { op: string }) =>
      data.op === "reserve" ? new Promise((resolve) => (answer = resolve)) : Promise.resolve({ ok: true }),
    );
    const { result } = setup();
    act(() => start(result.current));
    await vi.waitFor(() => expect(meterOps()).toHaveLength(1));
    // Give anything that wasn't waiting on the meter every chance to run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(parser).not.toHaveBeenCalled();

    answer(RESERVED);
    await vi.waitFor(() => expect(parser).toHaveBeenCalledTimes(1));
  });
});

describe("every import settles once", () => {
  test.each(METHODS)("$method: a parser failure settles as a failure", async ({ start, parser }) => {
    parser.mockRejectedValue(new Error("no recipe"));
    const { result } = setup();
    act(() => start(result.current));
    await vi.waitFor(() => expect(meterOps()).toHaveLength(2));
    expect(meterOps()[1]).toMatchObject({ op: "settle", outcome: "failure" });
    expect(track).toHaveBeenCalledWith("recipe_import_failed", expect.anything());
  });

  test("a roundup that blooms into three recipes settles one success", async () => {
    parseUrlAll.mockResolvedValue([recipe("One"), recipe("Two"), recipe("Three")]);
    const { result } = setup();
    act(() => result.current.addUrl("https://example.com/roundup"));
    await vi.waitFor(() => expect(result.current.items.filter((it) => it.status === "ready")).toHaveLength(3));
    await vi.waitFor(() => expect(meterOps()).toHaveLength(2));
    expect(meterOps().filter((call) => call.op === "settle")).toEqual([
      expect.objectContaining({ outcome: "success" }),
    ]);
  });
});

describe("a missing or slow meter imports normally", () => {
  test.each(METHODS)("$method: reserve rejects (the callable doesn't exist)", async ({ start, parser }) => {
    callCookPilotParser.mockRejectedValue(Object.assign(new Error("not-found"), { code: "functions/not-found" }));
    const { result } = setup();
    act(() => start(result.current));
    await vi.waitFor(() => expect(result.current.items[0]?.status).toBe("ready"));
    expect(parser).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith("import_meter_unavailable", { op: "reserve", reason: "error" });
  });

  test.each(METHODS)("$method: reserve takes longer than 5 seconds", async ({ start, parser }) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    callCookPilotParser.mockImplementation((_name: string, data: { op: string }) =>
      data.op === "reserve" ? new Promise(() => {}) : Promise.resolve({ ok: true }),
    );
    const { result } = setup();
    act(() => start(result.current));
    await vi.advanceTimersByTimeAsync(IMPORT_METER_TIMEOUT_MS - 1);
    expect(parser).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(parser).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith("import_meter_unavailable", { op: "reserve", reason: "timeout" });
  });
});
