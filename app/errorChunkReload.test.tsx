// @vitest-environment jsdom
import type { ComponentType } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@/components/SiteHeader", () => ({ SiteHeader: () => null }));
vi.mock("@/lib/analytics", () => ({ captureException: () => {} }));

import AppError from "./error";
import GlobalError from "./global-error";
import PrintError from "./print/error";

/**
 * A tab left open across a deploy asks for a script file the new build no
 * longer has, and the page crashes with a ChunkLoadError. Only /print's error
 * page reloaded to fetch the current build; every other page (the home page,
 * where it was seen on 2026-11-08 after #287 deployed) showed "This page ran
 * into a problem", and its Try again asked for the same missing file.
 */
type Boundary = ComponentType<{ error: Error & { digest?: string }; reset: () => void }>;
const boundaries: [string, Boundary][] = [
  ["every page", AppError as Boundary],
  ["the root layout", GlobalError as Boundary],
  ["/print", PrintError as Boundary],
];

const chunkError = () => Object.assign(new Error("Loading chunk 2650 failed."), { name: "ChunkLoadError" });

let reload: ReturnType<typeof vi.fn>;
beforeEach(() => {
  sessionStorage.clear();
  reload = vi.fn();
  Object.defineProperty(window, "location", { value: { ...window.location, reload }, configurable: true });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("error pages", () => {
  test("a missing script from an old build reloads once to fetch the new one, never in a loop, and nothing else reloads", () => {
    for (const [name, Boundary] of boundaries) {
      sessionStorage.clear();
      reload.mockClear();

      render(<Boundary error={chunkError()} reset={() => {}} />);
      expect(reload, `${name}: reloads`).toHaveBeenCalledTimes(1);
      cleanup();

      // The reload didn't help (still the same error straight after): stop.
      render(<Boundary error={chunkError()} reset={() => {}} />);
      expect(reload, `${name}: no second reload`).toHaveBeenCalledTimes(1);
      cleanup();

      // An ordinary crash isn't fixed by a new build, so no reload.
      sessionStorage.clear();
      reload.mockClear();
      render(<Boundary error={new Error("boom")} reset={() => {}} />);
      expect(reload, `${name}: ordinary crash`).not.toHaveBeenCalled();
      cleanup();
    }
  });
});
