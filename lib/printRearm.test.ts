import { beforeEach, describe, expect, it, vi } from "vitest";

// Every fact this module holds is per-document by construction (module scope is
// what makes it mean "this document"), so each test loads its own copy — the
// import IS the page load being simulated.
async function freshModule(options: { coarsePointer?: boolean } = {}) {
  vi.resetModules();
  const values = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({
      matches: query.includes("coarse") ? Boolean(options.coarsePointer) : false,
    }),
  });
  return { printRearm: await import("./printRearm"), storage: values };
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("printAgainHref", () => {
  it("asks the same deck to print on arrival", async () => {
    const { printRearm } = await freshModule();
    expect(printRearm.printAgainHref({ pathname: "/print", search: "?ids=a,b&size=6x4" })).toBe(
      "/print?ids=a%2Cb&size=6x4&print=1",
    );
  });

  it("does not stack a second print flag onto a document that already had one", async () => {
    const { printRearm } = await freshModule();
    expect(printRearm.printAgainHref({ pathname: "/print", search: "?print=1&ids=a" })).toBe(
      "/print?print=1&ids=a",
    );
  });
});

describe("preferring a fresh document", () => {
  it("leaves a document that has not printed alone", async () => {
    const { printRearm } = await freshModule({ coarsePointer: true });
    expect(printRearm.preferFreshDocumentForPrint()).toBe(false);
  });

  it("reloads a spent document on a phone", async () => {
    const { printRearm } = await freshModule({ coarsePointer: true });
    printRearm.markPrintSpent();
    expect(printRearm.printIsSpent()).toBe(true);
    expect(printRearm.preferFreshDocumentForPrint()).toBe(true);
  });

  it("leaves desktop to print the same document as often as it likes", async () => {
    const { printRearm } = await freshModule({ coarsePointer: false });
    printRearm.markPrintSpent();
    // Still spent — the watchdog can still rearm reactively if this browser
    // turns out to refuse. It just doesn't pay for a reload up front.
    expect(printRearm.printIsSpent()).toBe(true);
    expect(printRearm.preferFreshDocumentForPrint()).toBe(false);
  });

  it("survives a browser with no matchMedia rather than reloading blindly", async () => {
    vi.resetModules();
    vi.stubGlobal("sessionStorage", {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal("window", {});
    const printRearm = await import("./printRearm");
    printRearm.markPrintSpent();
    expect(printRearm.preferFreshDocumentForPrint()).toBe(false);
  });
});

describe("claiming a rearm", () => {
  it("allows the reload, and refuses to do it again from the document it loaded", async () => {
    const first = await freshModule({ coarsePointer: true });
    expect(first.printRearm.claimPrintRearm()).toBe(true);

    // The reload. New document, same tab, so the marker is what carries over.
    vi.resetModules();
    const reloaded = await import("./printRearm");
    expect(reloaded.claimPrintRearm()).toBe(false);
  });

  it("forgets the marker once a print actually reaches the browser", async () => {
    const first = await freshModule({ coarsePointer: true });
    expect(first.printRearm.claimPrintRearm()).toBe(true);

    vi.resetModules();
    const reloaded = await import("./printRearm");
    reloaded.clearPrintRetryMarker();
    expect(reloaded.claimPrintRearm()).toBe(true);
  });

  it("stops speaking for a print attempt that is minutes old", async () => {
    const first = await freshModule({ coarsePointer: true });
    expect(first.printRearm.claimPrintRearm()).toBe(true);

    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 120_000);
    const reloaded = await import("./printRearm");
    expect(reloaded.claimPrintRearm()).toBe(true);
    vi.useRealTimers();
  });
});
