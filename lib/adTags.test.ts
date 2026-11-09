import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  META_PIXEL_ID,
  adTagsInlineScript,
  metaCheckoutAttributes,
  purchaseValue,
  reportCookbookPurchase,
  reportMetaPageView,
  resetMetaPageViewForTest,
} from "./adTags";

/**
 * The ad tags' privacy gates and the Meta events: Meta must load once, behind
 * the same checks as Google and Reddit, send one PageView per route, and get a
 * Purchase only with the transaction id the server's copy uses, at the amount
 * actually charged.
 *
 * The inline loader runs here against a fake window (it reads only the globals
 * it is handed), so any host, country or opt-out can be set up in node.
 */

interface FakePage {
  host?: string;
  path?: string;
  search?: string;
  hash?: string;
  cookie?: string;
  storage?: Record<string, string>;
  gpc?: boolean;
}

type Win = Record<string, unknown> & {
  fbq?: ((...args: unknown[]) => void) & { queue?: unknown[][]; disablePushState?: boolean };
  rdt?: unknown;
  gtag?: unknown;
  rpMetaMeasuring?: boolean;
};

function boot(page: FakePage = {}, existing?: Win): { win: Win; scripts: string[] } {
  const scripts: string[] = [];
  const storage = page.storage ?? {};
  const win: Win = existing ?? {
    location: {
      hostname: page.host ?? "www.recipeprinter.com",
      pathname: page.path ?? "/",
      search: page.search ?? "",
      hash: page.hash ?? "",
    },
    localStorage: { getItem: (key: string) => storage[key] ?? null },
  };
  const doc = {
    cookie: page.cookie ?? "rp_country=US; rp_region=CA",
    createElement: () => ({}) as { src?: string },
    head: { appendChild: (el: { src?: string }) => scripts.push(el.src ?? "") },
  };
  const nav = { globalPrivacyControl: page.gpc };
  // eslint-disable-next-line no-new-func
  new Function("window", "document", "navigator", adTagsInlineScript())(win, doc, nav);
  return { win, scripts };
}

/** The Meta calls queued before fbevents.js arrives, as plain arrays. */
function metaCalls(win: Win): unknown[][] {
  return (win.fbq?.queue ?? []).map((args) => Array.from(args as ArrayLike<unknown>));
}

describe("the inline loader", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test"));
  afterEach(() => vi.unstubAllEnvs());

  test("loads the Meta Pixel once, with one PageView, LDU and no automatic events", () => {
    const { win, scripts } = boot();
    expect(scripts.filter((src) => src.includes("connect.facebook.net"))).toHaveLength(1);
    // Google and Reddit are still loaded alongside it.
    expect(scripts.some((src) => src.includes("googletagmanager.com"))).toBe(true);
    expect(scripts.some((src) => src.includes("redditstatic.com"))).toBe(true);
    expect(win.fbq?.disablePushState).toBe(true);
    expect(win.rpMetaMeasuring).toBe(true);

    const calls = metaCalls(win);
    expect(calls).toContainEqual(["dataProcessingOptions", ["LDU"], 0, 0]);
    expect(calls).toContainEqual(["set", "autoConfig", false, META_PIXEL_ID]);
    expect(calls.filter((c) => c[0] === "init")).toEqual([["init", META_PIXEL_ID]]);
    expect(calls.filter((c) => c[0] === "track")).toEqual([["track", "PageView"]]);
    expect(calls.some((c) => c[0] === "consent")).toBe(false);
    // Configuration comes before init, and PageView after it.
    const order = calls.map((c) => c[0]);
    expect(order.indexOf("set")).toBeLessThan(order.indexOf("init"));
    expect(order.indexOf("init")).toBeLessThan(order.indexOf("track"));

    // Running the loader again in the same document adds nothing.
    const again = boot({}, win);
    expect(again.scripts.filter((src) => src.includes("connect.facebook.net"))).toHaveLength(0);
    expect(metaCalls(win).filter((c) => c[0] === "track")).toHaveLength(1);
  });

  test.each<[string, FakePage]>([
    ["a dev host", { host: "localhost" }],
    ["a Vercel preview", { host: "recipeprinter-git-x.vercel.app" }],
    ["the PDF renderer", { path: "/export/abc" }],
    ["our print diagnostics", { path: "/print-check" }],
    ["a print hand-off link (the fragment holds the recipes)", { path: "/print", search: "?handoff=1", hash: "#rp=eJzLSM3JyQcABiwCFQ" }],
    ["?optout", { search: "?optout" }],
    ["PostHog's saved opt-out", { storage: { __ph_opt_in_out_phc_test: "0" } }],
    ["Global Privacy Control", { gpc: true }],
    ["the EEA", { cookie: "rp_country=DE" }],
    ["the UK", { cookie: "rp_country=GB" }],
    ["Switzerland", { cookie: "rp_country=CH" }],
    ["an unknown country", { cookie: "" }],
  ])("loads nothing at all for %s", (_label, page) => {
    const { win, scripts } = boot(page);
    expect(scripts).toEqual([]);
    expect(win.fbq).toBeUndefined();
    expect(win.rdt).toBeUndefined();
    expect(win.gtag).toBeUndefined();
  });

  test("an install check from a dev host loads Meta revoked, and not measuring", () => {
    const { win } = boot({ host: "localhost", search: "?adtags" });
    expect(metaCalls(win)[0]).toEqual(["consent", "revoke"]);
    expect(win.rpMetaMeasuring).toBe(false);
  });
});

describe("events from the app", () => {
  let fbq: ReturnType<typeof vi.fn>;
  let gtag: ReturnType<typeof vi.fn>;
  let rdt: ReturnType<typeof vi.fn>;
  let store: Map<string, string>;

  function stubWindow(extra: Record<string, unknown> = {}) {
    fbq = vi.fn();
    gtag = vi.fn();
    rdt = vi.fn();
    store = new Map();
    vi.stubGlobal("window", {
      fbq,
      gtag,
      rdt,
      rpMetaMeasuring: true,
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
      ...extra,
    });
  }

  beforeEach(() => {
    stubWindow();
    resetMetaPageViewForTest();
  });
  afterEach(() => vi.unstubAllGlobals());

  test("PageView: none for the page the loader already counted, then one per new route", () => {
    reportMetaPageView("/");
    reportMetaPageView("/"); // a re-render, or React running the effect twice
    expect(fbq).not.toHaveBeenCalled();
    reportMetaPageView("/print?project=abc");
    reportMetaPageView("/print?project=abc");
    reportMetaPageView("/projects");
    expect(fbq.mock.calls).toEqual([
      ["track", "PageView"],
      ["track", "PageView"],
    ]);
  });

  test("the amount is rounded to each currency's own minor units", () => {
    expect(purchaseValue(15_990_000, "USD")).toBe(15.99);
    expect(purchaseValue(19_990_000, "USD")).toBe(19.99);
    expect(purchaseValue(2_400_000_000, "JPY")).toBe(2400);
    expect(purchaseValue(2_400_400_000, "JPY")).toBe(2400);
    expect(purchaseValue(4_125_000, "KWD")).toBe(4.125);
    expect(purchaseValue(12_345_678, "EUR")).toBe(12.35);
  });

  test("Purchase goes to Meta with the transaction id as eventID, once per transaction", () => {
    const paid = { transactionId: "o1_abc", amountMicros: 15_990_000, currency: "USD" };
    reportCookbookPurchase(paid);
    reportCookbookPurchase(paid); // a second call for the same sale

    const purchases = fbq.mock.calls.filter((c) => c[1] === "Purchase");
    expect(purchases).toEqual([
      [
        "track",
        "Purchase",
        { value: 15.99, currency: "USD", content_type: "product", content_ids: ["cookbook"], num_items: 1 },
        { eventID: "o1_abc" },
      ],
    ]);
    // Google and Reddit still get theirs, once.
    expect(gtag).toHaveBeenCalledTimes(1);
    expect(gtag.mock.calls[0][2]).toMatchObject({ value: 15.99, currency: "USD", transaction_id: "o1_abc" });
    expect(rdt).toHaveBeenCalledTimes(1);
    expect(rdt.mock.calls[0][2]).toMatchObject({ value: 15.99, currency: "USD", conversionId: "o1_abc" });
  });

  test("no browser Meta Purchase it couldn't dedupe against the server's, or without a value", () => {
    reportCookbookPurchase({ transactionId: null, amountMicros: 15_990_000, currency: "USD" });
    reportCookbookPurchase({ transactionId: "o1_novalue", amountMicros: null, currency: null });
    expect(fbq.mock.calls.filter((c) => c[1] === "Purchase")).toEqual([]);
    // Google still counts both.
    expect(gtag).toHaveBeenCalledTimes(2);
  });

  test("the server is told to send Meta's copy only when the Pixel is measuring", () => {
    vi.stubGlobal("document", { cookie: "_fbp=fb.1.1.2; _fbc=fb.1.1.click; rp_country=US; rp_region=CA" });
    vi.stubGlobal("navigator", { userAgent: "TestAgent/1.0" });
    expect(metaCheckoutAttributes()).toEqual({
      meta_capi: "1",
      meta_fbp: "fb.1.1.2",
      meta_fbc: "fb.1.1.click",
      meta_ua: "TestAgent/1.0",
      meta_cc: "US",
      meta_rc: "CA",
    });

    // Every key is cleared, never left over from an earlier checkout, when the
    // Pixel didn't load (any opt-out) or is only an install check.
    const cleared = { meta_capi: null, meta_fbp: null, meta_fbc: null, meta_ua: null, meta_cc: null, meta_rc: null };
    stubWindow({ fbq: undefined });
    expect(metaCheckoutAttributes()).toEqual(cleared);
    stubWindow({ rpMetaMeasuring: false });
    expect(metaCheckoutAttributes()).toEqual(cleared);
  });
});
