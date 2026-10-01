import { afterEach, describe, expect, test, vi } from "vitest";
import { isWebKitPrinter, printNeedsLiveGesture } from "./printGesture";

/**
 * Safari only opens its print sheet straight away from inside the cook's own
 * click; anything later is "automatic printing" and gets its blocking alert.
 * The Print button that took three clicks and a reload came from treating
 * every browser the same. These pin which browsers count as WebKit printers —
 * every browser on iOS does, whatever its name — and that Chromium and Firefox
 * are left alone.
 */

const UA = {
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  firefoxMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:131.0) Gecko/20100101 Firefox/131.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

function browser(userAgent: string, extra: Partial<{ platform: string; maxTouchPoints: number; userActivation: { isActive: boolean } }> = {}) {
  vi.stubGlobal("navigator", { userAgent, platform: "MacIntel", maxTouchPoints: 0, ...extra });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isWebKitPrinter", () => {
  test.each([
    ["Safari on the Mac", UA.safariMac, {}],
    ["Safari on iPhone", UA.safariIphone, { platform: "iPhone" }],
    ["Chrome on iPhone (WebKit underneath)", UA.chromeIos, { platform: "iPhone" }],
    // iPadOS reports itself as a Mac by default; the touch points give it away.
    ["an iPad asking for the desktop site", UA.safariMac, { maxTouchPoints: 5 }],
  ])("%s is", (_, ua, extra) => {
    browser(ua, extra);
    expect(isWebKitPrinter()).toBe(true);
  });

  test.each([
    ["Chrome on the Mac", UA.chromeMac],
    ["Edge on Windows", UA.edgeWindows],
    ["Firefox on the Mac", UA.firefoxMac],
    ["Chrome on Android", UA.chromeAndroid],
  ])("%s is not", (_, ua) => {
    browser(ua, { platform: ua.includes("Android") ? "Linux armv8l" : "MacIntel" });
    expect(isWebKitPrinter()).toBe(false);
  });
});

describe("printNeedsLiveGesture", () => {
  test("Safari outside a click needs one", () => {
    browser(UA.safariMac, { userActivation: { isActive: false } });
    expect(printNeedsLiveGesture()).toBe(true);
  });

  test("Safari with no activation API at all is treated as outside a click", () => {
    browser(UA.safariMac);
    expect(printNeedsLiveGesture()).toBe(true);
  });

  test("Safari moments after a click can print", () => {
    browser(UA.safariMac, { userActivation: { isActive: true } });
    expect(printNeedsLiveGesture()).toBe(false);
  });

  test("Chrome prints from anywhere, click or not", () => {
    browser(UA.chromeMac, { userActivation: { isActive: false } });
    expect(printNeedsLiveGesture()).toBe(false);
  });
});
