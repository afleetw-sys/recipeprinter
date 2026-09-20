import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isPopupDismissal, POPUP_RETURN_GRACE_MS, watchForPopupReturn } from "@/lib/authPopup";

// A window and document that only do what the watcher asks of them.
function fakePage() {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), { visibilityState: "visible" as "visible" | "hidden" });
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", doc);
  return { win, doc };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("noticing the popup was closed", () => {
  it("fires after a short grace once focus comes back to a window the popup had taken it from", () => {
    const { win } = fakePage();
    const returned = vi.fn();
    watchForPopupReturn(returned);

    win.dispatchEvent(new Event("blur")); // the popup opens and takes focus
    win.dispatchEvent(new Event("focus")); // it closes and focus returns

    vi.advanceTimersByTime(POPUP_RETURN_GRACE_MS - 1);
    expect(returned).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(returned).toHaveBeenCalledOnce();
  });

  it("does nothing when the popup never took focus, so the SDK's own wait applies as before", () => {
    const { win } = fakePage();
    const returned = vi.fn();
    watchForPopupReturn(returned);

    win.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(60_000);

    expect(returned).not.toHaveBeenCalled();
  });

  it("fires once however many times focus moves", () => {
    const { win } = fakePage();
    const returned = vi.fn();
    watchForPopupReturn(returned);

    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(60_000);

    expect(returned).toHaveBeenCalledOnce();
  });

  it("also notices the return when the popup opened as a tab", () => {
    const { doc } = fakePage();
    const returned = vi.fn();
    watchForPopupReturn(returned);

    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    vi.advanceTimersByTime(POPUP_RETURN_GRACE_MS);

    expect(returned).toHaveBeenCalledOnce();
  });

  it("does not fire once stopped, for a sign-in that finished on its own", () => {
    const { win } = fakePage();
    const returned = vi.fn();
    const stop = watchForPopupReturn(returned);

    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    stop();
    vi.advanceTimersByTime(60_000);

    expect(returned).not.toHaveBeenCalled();
  });

  it("stops listening when stopped", () => {
    const { win } = fakePage();
    const returned = vi.fn();
    const stop = watchForPopupReturn(returned);
    stop();

    win.dispatchEvent(new Event("blur"));
    win.dispatchEvent(new Event("focus"));
    vi.advanceTimersByTime(60_000);

    expect(returned).not.toHaveBeenCalled();
  });
});

describe("a closed window is not a failure", () => {
  it("recognises the two dismissals and nothing else", () => {
    expect(isPopupDismissal({ code: "auth/popup-closed-by-user" })).toBe(true);
    expect(isPopupDismissal({ code: "auth/cancelled-popup-request" })).toBe(true);
    expect(isPopupDismissal({ code: "auth/popup-blocked" })).toBe(false);
    expect(isPopupDismissal({ code: "auth/network-request-failed" })).toBe(false);
    expect(isPopupDismissal(new Error("popup-closed-by-user"))).toBe(false);
    expect(isPopupDismissal(null)).toBe(false);
  });
});
