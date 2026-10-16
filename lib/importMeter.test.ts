// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { flushQueueWrites, useQueue } from "@/lib/queue";
import {
  IMPORT_METER_CALLABLE,
  IMPORT_METER_TIMEOUT_MS,
  clearImportsUnlimited,
  importRefused,
  importsKnownUnlimited,
  importsSpent,
  markImportsUnlimited,
  meterDedupeInput,
  refreshImportUsage,
  refuseImportIfSpent,
  subscribeImportRefusal,
  rememberedImportUsage,
  resetImportUsageForTest,
  usageNow,
} from "@/lib/importMeter";

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
// The allowance as it is once it's live. The switch ships off until go-live.
vi.mock("@/lib/freeImports", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/freeImports")>()),
  IMPORT_ALLOWANCE_LIVE: true,
}));
// The meter is only ever asked from the real site; these tests stand there.
const onProductionHost = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/appEnvironment", () => ({ isProductionRuntime: () => onProductionHost.value }));
vi.mock("@/lib/analytics", () => ({ track, truncateReason: (e: unknown) => String(e) }));
vi.mock("@/lib/failedImportCapture", () => ({
  captureFailedImportImages: vi.fn(() => null),
  recordFailedImport: vi.fn(async () => undefined),
}));
vi.mock("@/lib/importCorrections", () => ({ noteImported: vi.fn(), noteRecipeEdited: vi.fn() }));
vi.mock("@/lib/importPreviews", () => ({ setImportPreview: vi.fn(), releaseImportPreview: vi.fn() }));

function recipe(title: string) {
  return { title, ingredients: [{ raw: "2 beets" }], instructions: [{ text: "Simmer." }] };
}

const NEXT_FREE = Date.UTC(2026, 9, 21);
const RESERVED = { mode: "enforce", allowed: true, used: 4, limit: 10, nextFreeAt: NEXT_FREE, subjectKind: "browser" };
const REFUSED = { ...RESERVED, allowed: false, reason: "limit", used: 10 };

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

const onImportLimitReached = vi.fn();

function setup(gates: { cookbookMode?: boolean; clientPro?: boolean } = {}) {
  const hook = renderHook(() => useQueue());
  act(() => hook.result.current.configureImportGates({ singleRecipeOnly: false, onImportLimitReached, ...gates }));
  return hook;
}

beforeEach(() => {
  parseUrlAll.mockResolvedValue([recipe("Borscht")]);
  parseImages.mockResolvedValue(recipe("Borscht"));
  parseText.mockResolvedValue(recipe("Borscht"));
  callCookPilotParser.mockImplementation(async (_name: string, data: { op: string }) =>
    data.op === "reserve" ? RESERVED : { ok: true, mode: "enforce", used: 5, limit: 10, nextFreeAt: NEXT_FREE },
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
  resetImportUsageForTest();
  onProductionHost.value = true;
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
    expect(track).toHaveBeenCalledWith(
      "import_meter_unavailable",
      expect.objectContaining({ op: "reserve", reason: "error" }),
    );
  });

  test.each(METHODS)("$method: reserve takes longer than 5 seconds", async ({ start, parser }) => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let asked: () => void = () => {};
    const reserveAsked = new Promise<void>((resolve) => (asked = resolve));
    callCookPilotParser.mockImplementation((_name: string, data: { op: string }) => {
      if (data.op !== "reserve") return Promise.resolve({ ok: true });
      asked();
      return new Promise(() => {});
    });
    const { result } = setup();
    act(() => start(result.current));
    // The request has to be out before the clock moves. Hashing the dedupe key
    // is real work off the fake clock, and a reserve that only goes out after
    // the 5 seconds are up lands in a later test's call list.
    await reserveAsked;
    await vi.advanceTimersByTimeAsync(IMPORT_METER_TIMEOUT_MS - 1);
    expect(parser).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(parser).toHaveBeenCalledTimes(1));
    expect(track).toHaveBeenCalledWith(
      "import_meter_unavailable",
      expect.objectContaining({ op: "reserve", reason: "timeout" }),
    );
  });
});

describe("out of free imports", () => {
  test.each(METHODS)("$method: a refused import never reaches the parser or settles", async ({ start, parser }) => {
    callCookPilotParser.mockImplementation(async (_name: string, data: { op: string }) =>
      data.op === "reserve" ? REFUSED : { ok: true },
    );
    const { result } = setup();
    act(() => start(result.current));
    await vi.waitFor(() => expect(onImportLimitReached).toHaveBeenCalledTimes(1));
    expect(onImportLimitReached.mock.calls[0][0]).toMatchObject({ usage: { used: 10, limit: 10 } });
    expect(parser).not.toHaveBeenCalled();
    // The placeholder is gone, not left as a failed card to retry.
    expect(result.current.items).toEqual([]);
    expect(meterOps()).toEqual([expect.objectContaining({ op: "reserve" })]);
    expect(track).toHaveBeenCalledWith("import_limit_reached", expect.objectContaining({ used: 10, limit: 10 }));
    expect(track).not.toHaveBeenCalledWith("recipe_import_failed", expect.anything());
  });

  test("a refusal leaves the recipes already there alone", async () => {
    const { result } = setup();
    act(() => result.current.addText("Borscht\n2 beets\nSimmer."));
    await vi.waitFor(() => expect(result.current.items[0]?.status).toBe("ready"));
    callCookPilotParser.mockResolvedValue(REFUSED);
    act(() => result.current.addUrl("https://example.com/second"));
    await vi.waitFor(() => expect(onImportLimitReached).toHaveBeenCalled());
    expect(result.current.items.map((it) => it.status)).toEqual(["ready"]);
  });

  test("the server's answers are what the import boxes show", async () => {
    const { result } = setup();
    act(() => result.current.addText("Borscht\n2 beets\nSimmer."));
    // The settle's answer is the count with this import in it.
    await vi.waitFor(() => expect(rememberedImportUsage()).toMatchObject({ used: 5, limit: 10, enforcing: true }));

    callCookPilotParser.mockResolvedValue({ mode: "enforce", allowed: true, used: 7, limit: 10, nextFreeAt: NEXT_FREE });
    await refreshImportUsage();
    expect(rememberedImportUsage()).toMatchObject({ used: 7 });

    // Pro, or the allowance switched off: nothing to show.
    callCookPilotParser.mockResolvedValue({ mode: "enforce", allowed: true, reason: "pro" });
    await refreshImportUsage();
    expect(rememberedImportUsage()).toBeNull();
  });

  // Rule E1: what a meter we can't reach means depends on its last answer.
  test.each([
    { name: "last answer was none left", last: { used: 10 }, refused: true },
    { name: "last answer had imports left", last: { used: 9 }, refused: false },
    { name: "the 30 days have since ended", last: { used: 10, nextFreeAt: Date.UTC(2020, 0, 1) }, refused: false },
    { name: "the last answer wasn't enforcing", last: { used: 10, mode: "measure" }, refused: false },
    { name: "there is no answer on record", last: null, refused: false },
  ])("meter unreachable, $name: refused is $refused", async ({ last, refused }) => {
    if (last) {
      callCookPilotParser.mockResolvedValue({ mode: "enforce", allowed: true, limit: 10, nextFreeAt: Date.UTC(2099, 0, 1), ...last });
      await refreshImportUsage();
    }
    callCookPilotParser.mockRejectedValue(new Error("offline"));
    const { result } = setup();
    act(() => result.current.addText("Borscht\n2 beets\nSimmer."));
    if (refused) {
      await vi.waitFor(() => expect(onImportLimitReached).toHaveBeenCalled());
      expect(parseText).not.toHaveBeenCalled();
    } else {
      await vi.waitFor(() => expect(parseText).toHaveBeenCalledTimes(1));
      expect(onImportLimitReached).not.toHaveBeenCalled();
    }
  });

  test("nothing is refused while the allowance isn't live, whatever the server says", () => {
    const refusal = { status: "reserved", meterMs: 1, result: { mode: "enforce", allowed: false } } as const;
    expect(importRefused(refusal, Date.now(), true)).toBe(true);
    expect(importRefused(refusal, Date.now(), false)).toBe(false);
    // A server that only counts never refuses either.
    expect(importRefused({ ...refusal, result: { mode: "measure", allowed: false } }, Date.now(), true)).toBe(false);
  });

  test("a remembered count is back to zero once its reset time has passed", () => {
    const usage = { used: 10, limit: 10, nextFreeAt: 1_000 };
    expect(usageNow(usage, 999)).toEqual(usage);
    expect(usageNow(usage, 1_000)).toEqual({ used: 0, limit: 10, nextFreeAt: null });
  });
});

describe("a link or text already counted in the 30 days", () => {
  // Importing it again uses nothing (decision D2), so being out of imports
  // must not stop it: not at the homepage's check before /print, and not when
  // the meter can't be reached. The meter's own answer is CookPilot's rule.
  test.each([
    {
      method: "url",
      parser: parseUrlAll,
      start: (q: ReturnType<typeof useQueue>) => q.addUrl("https://example.com/borscht"),
      again: { kind: "url", url: "example.com/borscht/?utm_source=pin" },
      other: { kind: "url", url: "https://example.com/stew" },
    },
    {
      method: "text",
      parser: parseText,
      start: (q: ReturnType<typeof useQueue>) => q.addText("Borscht\n2 beets\nSimmer."),
      again: { kind: "text", text: " borscht 2 beets\n\nsimmer. " },
      other: { kind: "text", text: "Stew\n1 onion" },
    },
  ] as const)("$method: still imports after the last free one is used", async ({ parser, start, again, other }) => {
    const atLimit = { mode: "enforce", allowed: true, used: 10, limit: 10, nextFreeAt: Date.UTC(2099, 0, 1) };
    callCookPilotParser.mockImplementation(async (_name: string, data: { op: string }) =>
      data.op === "reserve" ? { ...atLimit, used: 9 } : { ok: true, ...atLimit },
    );
    const { result } = setup();
    act(() => start(result.current));
    await vi.waitFor(() => expect(importsSpent()).toBe(true));

    const opened = vi.fn();
    const stop = subscribeImportRefusal(opened);
    expect(await refuseImportIfSpent(meterDedupeInput(other))).toBe(true);
    expect(await refuseImportIfSpent(meterDedupeInput(again))).toBe(false);
    expect(opened).toHaveBeenCalledTimes(1);
    stop();

    act(() => result.current.remove(result.current.items[0].id));
    callCookPilotParser.mockRejectedValue(new Error("offline"));
    act(() => start(result.current));
    await vi.waitFor(() => expect(parser).toHaveBeenCalledTimes(2));
    expect(onImportLimitReached).not.toHaveBeenCalled();
  });
});

describe("an unbought cookbook's free size", () => {
  const onBookCapReached = vi.fn();
  function book(bookCap: number | null) {
    const hook = renderHook(() => useQueue());
    act(() =>
      hook.result.current.configureImportGates({ singleRecipeOnly: false, cookbookMode: true, bookCap, onBookCapReached }),
    );
    return hook;
  }
  const ready = (id: string) =>
    ({ id, method: "paprika", source: "Paprika", status: "ready", title: id, recipe: recipe(id), addedAt: 1 }) as never;

  test("a roundup past the cap keeps the first recipe and what fits, and says so", async () => {
    parseUrlAll.mockResolvedValue([recipe("One"), recipe("Two"), recipe("Three"), recipe("Four")]);
    const { result } = book(2);
    act(() => result.current.addUrl("https://example.com/roundup"));
    await vi.waitFor(() => expect(onBookCapReached).toHaveBeenCalledWith({ found: 4, kept: 2 }));
    expect(result.current.items.map((it) => it.title)).toEqual(["One", "Two"]);
  });

  test("recipes from a recipe app take the room that's left", () => {
    const { result } = book(2);
    let added = 0;
    act(() => {
      added = result.current.addReadyRecipes([ready("a"), ready("b"), ready("c")]);
    });
    expect(added).toBe(2);
    expect(onBookCapReached).toHaveBeenCalledWith({ found: 3, kept: 2 });
    act(() => {
      added = result.current.addReadyRecipes([ready("d")]);
    });
    expect(added).toBe(0);
  });

  test("a bought book takes everything", async () => {
    parseUrlAll.mockResolvedValue([recipe("One"), recipe("Two"), recipe("Three")]);
    const { result } = book(null);
    act(() => result.current.addUrl("https://example.com/roundup"));
    await vi.waitFor(() => expect(result.current.items).toHaveLength(3));
    expect(onBookCapReached).not.toHaveBeenCalled();
  });
});

describe("a page that hands imports off to /print", () => {
  // The homepage and the SEO pages ask before navigating, so a cook who is out
  // of imports sees the upgrade dialog where they are.
  test.each([
    { name: "out of imports", answer: { used: 10 }, refuses: true },
    { name: "imports left", answer: { used: 9 }, refuses: false },
    { name: "Pro", answer: { reason: "pro" }, refuses: false },
    { name: "a first-time visitor (no answer on record)", answer: null, refuses: false },
  ])("$name: stays put is $refuses", async ({ answer, refuses }) => {
    if (answer) {
      callCookPilotParser.mockResolvedValue({ mode: "enforce", allowed: true, limit: 10, nextFreeAt: Date.UTC(2099, 0, 1), ...answer });
      await refreshImportUsage();
    }
    const opened = vi.fn();
    const stop = subscribeImportRefusal(opened);
    expect(await refuseImportIfSpent()).toBe(refuses);
    expect(opened).toHaveBeenCalledTimes(refuses ? 1 : 0);
    stop();
    // With no banner on the page to open the dialog, the handoff goes ahead.
    expect(await refuseImportIfSpent()).toBe(false);
  });
});

describe("anywhere but the real site", () => {
  // localhost, a LAN address, a Vercel preview: all reach the production
  // backend, so testing there must never use or record a real allowance.
  test.each(METHODS)("$method: imports without asking the meter", async ({ start, parser }) => {
    onProductionHost.value = false;
    const { result } = setup();
    act(() => start(result.current));
    await vi.waitFor(() => expect(parser).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(result.current.items[0]?.status).toBe("ready"));
    await refreshImportUsage();
    expect(meterOps()).toEqual([]);
  });
});

describe("after buying Pro", () => {
  test("a count from the server never makes a Pro member limited again", async () => {
    // The homepage can ask before sign-in has loaded, and is then answered as
    // the bare browser, with that browser's old count.
    markImportsUnlimited();
    callCookPilotParser.mockResolvedValue({ mode: "enforce", allowed: true, used: 10, limit: 10, nextFreeAt: Date.UTC(2099, 0, 1) });
    await refreshImportUsage();
    expect(importsKnownUnlimited()).toBe(true);
    expect(importsSpent()).toBe(false);

    // Only something that knows they aren't Pro switches it off.
    clearImportsUnlimited();
    expect(importsSpent()).toBe(true);
  });

  test("the free count is forgotten at once, so nothing treats them as out of imports", async () => {
    callCookPilotParser.mockResolvedValue({ mode: "enforce", allowed: true, used: 10, limit: 10, nextFreeAt: Date.UTC(2099, 0, 1) });
    await refreshImportUsage();
    expect(importsSpent()).toBe(true);

    markImportsUnlimited();
    expect(importsSpent()).toBe(false);
    expect(rememberedImportUsage()).toBeNull();
    const opened = vi.fn();
    const stop = subscribeImportRefusal(opened);
    expect(await refuseImportIfSpent()).toBe(false);
    expect(opened).not.toHaveBeenCalled();
    stop();
  });
});
