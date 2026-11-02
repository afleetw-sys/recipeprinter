// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportPanel } from "@/components/ImportPanel";
import { markImportsUnlimited, resetImportUsageForTest } from "@/lib/importMeter";

const onProductionHost = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/appEnvironment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/appEnvironment")>()),
  isProductionRuntime: () => onProductionHost.value,
}));

afterEach(cleanup);

/** What the link field starts when this is pasted into it and submitted. */
function submit(pasted: string) {
  const onAddUrl = vi.fn();
  const onAddText = vi.fn();
  render(
    <ImportPanel
      items={[]}
      initialMode="url"
      onAddUrl={onAddUrl}
      onAddText={onAddText}
      onAddImageFiles={vi.fn()}
      onAddReadyRecipes={vi.fn(() => 0)}
    />,
  );
  const field = screen.getByRole("textbox");
  fireEvent.change(field, { target: { value: pasted } });
  fireEvent.submit(field.closest("form")!);
  const started = onAddUrl.mock.calls.length
    ? { url: onAddUrl.mock.calls[0][0] as string }
    : onAddText.mock.calls.length
      ? { text: true }
      : {};
  cleanup();
  return started;
}

describe("the link field", () => {
  // "RECIPE HERE: https://bit.ly/4idG4GX", copied whole out of a post, went to
  // the recipe-text reader instead of the link. A link with a few words round
  // it is a link: those words are the post's, not the recipe.
  it("imports the link out of a short caption around it", () => {
    const link = "https://bit.ly/4idG4GX";
    for (const pasted of [
      `RECIPE HERE: ${link}`,
      `Check this out!\n${link}`,
      `Made this last night, so good ${link} 😋`,
      `The recipe is here (${link}).`,
      `link in bio → ${link}`,
    ]) {
      expect(submit(pasted), pasted).toEqual({ url: link });
    }
  });

  it("still reads a pasted recipe as text, a link in it or not", () => {
    for (const pasted of [
      "Recipe from https://www.plainchicken.com/casserole/\nIngredients\n2 cups chicken\n1 can soup",
      "Mexican Picadillo Ingredients 1 lb ground beef (or ground turkey) 1 onion, diced, from https://example.com/picadillo",
      "Mexican Picadillo\nIngredients\n1 lb ground beef",
    ]) {
      expect(submit(pasted), pasted).toEqual({ text: true });
    }
  });

  it("still takes a plain link, and one that wrapped across lines", () => {
    expect(submit("https://bit.ly/4idG4GX")).toEqual({ url: "https://bit.ly/4idG4GX" });
    expect(submit("https://www.plainchicken.com/million-\ndollar-chicken-casserole/").url).toBeTruthy();
  });
});

describe("waking the import backend", () => {
  // A cook's first import of a visit waited a median 3.9s on the meter, and a
  // quarter hit its 5s limit, because nothing had called the function since it
  // was shut down for being idle; the link and photo parsers start cold the
  // same way, 2.7s and 4.3s (PostHog and timings, 2026-11-02). Showing an
  // import box wakes them, and so does coming back to the box after they may
  // have gone idle.
  it("wakes the meter and parsers when an import box shows, and again on a later touch", () => {
    onProductionHost.value = true;
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "cookpilot-bbecb");
    vi.useFakeTimers({ toFake: ["Date"] });
    const fetch = vi.fn((_url: string, _init?: RequestInit) => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", fetch);
    const woken = () => {
      const count = (name: string) => fetch.mock.calls.filter(([url]) => String(url).endsWith(`/${name}`)).length;
      return {
        meter: count("recipePrinterImportMeter"),
        link: count("recipePrinterParseRecipeFromURL"),
        photo: count("parseRecipeFromImages"),
      };
    };
    const panel = () =>
      render(
        <ImportPanel
          items={[]}
          onAddUrl={vi.fn()}
          onAddText={vi.fn()}
          onAddImageFiles={vi.fn()}
          onAddReadyRecipes={vi.fn(() => 0)}
        />,
      );
    try {
      resetImportUsageForTest();
      panel();
      expect(woken()).toEqual({ meter: 1, link: 1, photo: 1 });

      // Typing straight away: they're awake, nothing more is sent.
      fireEvent.focus(screen.getByRole("textbox"));
      expect(woken()).toEqual({ meter: 1, link: 1, photo: 1 });

      // Back to the box after long enough for them to have gone idle.
      vi.setSystemTime(Date.now() + 20 * 60 * 1000);
      fireEvent.pointerDown(screen.getByRole("textbox"));
      expect(woken()).toEqual({ meter: 2, link: 2, photo: 2 });
      cleanup();

      // A cook this browser knows is Pro never waits on the meter, but their
      // imports are parsed like anyone's.
      resetImportUsageForTest();
      markImportsUnlimited();
      panel();
      expect(woken()).toEqual({ meter: 2, link: 3, photo: 3 });
    } finally {
      cleanup();
      resetImportUsageForTest();
      onProductionHost.value = false;
      vi.useRealTimers();
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("loading the recipe-apps code in the background", () => {
  // Leaving the home page while this was still downloading failed the load,
  // and nothing caught it: WebKit raised an uncaught ChunkLoadError on every
  // such exit (e2e work-survives, PR #261 and an Oct 30 run). The tab loads
  // its code again when it's opened, so a failed head start is nothing.
  it("lets a failed head start go quietly, whichever step fails", async () => {
    const uncaught: unknown[] = [];
    const onUncaught = (reason: unknown) => uncaught.push(reason);
    process.on("unhandledRejection", onUncaught);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      // Each case gets its own copy of the panel, so neither sees the other's
      // already-loaded code.
      const failures = {
        download: () => {
          throw new Error("ChunkLoadError: Loading chunk 4488 failed.");
        },
        "warm-up": () => ({
          RecipeAppsPanel: () => null,
          prewarmCookPilotImport: () => Promise.reject(new Error("network error")),
        }),
      };
      for (const [fail, recipeAppsModule] of Object.entries(failures)) {
        vi.resetModules();
        vi.doMock("@/components/import/RecipeAppsPanel", recipeAppsModule);
        const { ImportPanel: FreshImportPanel } = await import("@/components/ImportPanel");
        render(
          <FreshImportPanel
            items={[]}
            onAddUrl={vi.fn()}
            onAddText={vi.fn()}
            onAddImageFiles={vi.fn()}
            onAddReadyRecipes={vi.fn(() => 0)}
          />,
        );
        await vi.advanceTimersByTimeAsync(1_000);
        vi.useRealTimers();
        // Unhandled rejections are reported a turn after the promise settles.
        await new Promise((resolve) => setTimeout(resolve, 50));
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
        cleanup();
        expect(uncaught, fail).toEqual([]);
      }
    } finally {
      vi.doUnmock("@/components/import/RecipeAppsPanel");
      vi.useRealTimers();
      process.off("unhandledRejection", onUncaught);
    }
  });
});
