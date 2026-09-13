import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  onCookPilotSignedInChange,
  readCookPilotWasSignedIn,
  rememberCookPilotSignedIn,
} from "@/lib/cookPilotSession";

// Node env, no jsdom (see vitest.config.ts), so the one global `lib/storage`
// looks for is installed by hand — the same approach lib/nextPaint.test.ts
// takes to `document`.
function installLocalStorage() {
  const values = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    },
  };
}

beforeEach(installLocalStorage);
afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

/* The header decides whether to load the account menu — the only thing that
   can draw your initials — once, at mount, from `readCookPilotWasSignedIn`.
   Every sign-in dialog in the app lives somewhere else, so this signal is the
   only way a header already on screen hears that a first sign-in happened. */
describe("onCookPilotSignedInChange", () => {
  it("announces a first sign-in", () => {
    const heard = vi.fn();
    onCookPilotSignedInChange(heard);

    rememberCookPilotSignedIn(true);

    expect(heard).toHaveBeenCalledWith(true);
    expect(readCookPilotWasSignedIn()).toBe(true);
  });

  it("stays quiet while the same session refreshes its token", () => {
    rememberCookPilotSignedIn(true);
    const heard = vi.fn();
    const stop = onCookPilotSignedInChange(heard);

    // `onAuthStateChanged` fires on every token refresh, and each one calls
    // through here with the same answer.
    rememberCookPilotSignedIn(true);
    rememberCookPilotSignedIn(true);

    expect(heard).not.toHaveBeenCalled();
    stop();
  });

  it("announces a sign-out, and stops once unsubscribed", () => {
    rememberCookPilotSignedIn(true);
    const heard = vi.fn();
    const stop = onCookPilotSignedInChange(heard);

    rememberCookPilotSignedIn(false);
    expect(heard).toHaveBeenCalledWith(false);

    stop();
    rememberCookPilotSignedIn(true);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
