// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createElement, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/* Characterizes the save EFFECTS in app/print/page.tsx by rendering the real page
   in jsdom. lib/printSaveWrite and lib/printAutosave cover the write and the
   decisions; what they cannot cover is the wiring: which effect fires when, and
   in what order, as auth, the queue and the edit stream change. The comments in
   the page say those orderings were each a shipped bug.

   Mocked: auth, RevenueCat, layout measurement, the save I/O, and components that
   only paint. Real: the queue, project metadata, toast, and every effect. */

// ---- auth -----------------------------------------------------------------

interface FakeUser {
  uid: string;
  email: string;
  displayName: string;
  isAnonymous: false;
}

const users: Record<"alice" | "bob", FakeUser> = {
  alice: { uid: "alice", email: "alice@example.com", displayName: "Alice", isAnonymous: false },
  bob: { uid: "bob", email: "bob@example.com", displayName: "Bob", isAnonymous: false },
};

const authStore = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  let state: { user: unknown; ready: boolean; redirectError: string | null } = {
    user: null,
    ready: true,
    redirectError: null,
  };
  return {
    get: () => state,
    set(next: Partial<typeof state>) {
      state = { ...state, ...next };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
});

vi.mock("@/components/CookPilotAuth", async () => {
  const react = await import("react");
  return {
    useCookPilotAuth: () =>
      react.useSyncExternalStore(authStore.subscribe, authStore.get, authStore.get),
    CookPilotLoginDialog: () => null,
  };
});

// ---- the save I/O ---------------------------------------------------------

const io = vi.hoisted(() => ({
  savePrintProject: vi.fn(),
  adoptAnonymousProject: vi.fn(),
  loadPrintProjectHead: vi.fn(),
  loadPrintProject: vi.fn(),
  materializeProjectPhotos: vi.fn(),
}));

vi.mock("@/lib/printProjects", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/printProjects")>();
  return {
    ...original,
    savePrintProject: io.savePrintProject,
    loadPrintProjectHead: io.loadPrintProjectHead,
    loadPrintProject: io.loadPrintProject,
  };
});
vi.mock("@/lib/anonymousProjectAdoption", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/anonymousProjectAdoption")>();
  return { ...original, adoptAnonymousProject: io.adoptAnonymousProject };
});
vi.mock("@/lib/photoStorage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/photoStorage")>();
  return { ...original, materializeProjectPhotos: io.materializeProjectPhotos };
});

// ---- Next -----------------------------------------------------------------

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "" }));
/** The latest props PrintConfigPanel was rendered with: its setters are how a test edits. */
const panel = vi.hoisted(() => ({ props: {} as Record<string, (...args: unknown[]) => void> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.push, back: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
  usePathname: () => "/print",
}));
vi.mock("next/link", async () => {
  const react = await import("react");
  return {
    default: ({ href, children, ...rest }: { href: string; children?: ReactNode }) =>
      react.createElement("a", { href, ...rest }, children),
  };
});

// ---- layout and purchases: too heavy or external for jsdom ----------------

vi.mock("@/lib/usePrintSheets", () => ({
  usePrintSheets: () => ({
    hasRecipeBackSide: false,
    continueOnBack: false,
    printLayoutReady: true,
    sheets: [],
    navItems: [],
    spreads: [],
    previewConfig: {
      cardSize: "letter",
      template: "classic",
      showPhoto: true,
      showSourceUrl: true,
      showDescription: true,
    },
    awaitingFirstLayout: false,
    measurers: null,
  }),
}));
vi.mock("@/lib/useDeckScroller", () => ({
  useDeckScroller: () => ({
    canvasSide: "front",
    setCanvasSide: vi.fn(),
    deckScale: 1,
    deckRef: { current: null },
    slideRefs: { current: [] },
    goToSlide: vi.fn(),
    goToDeckElement: vi.fn(),
  }),
}));
vi.mock("@/lib/usePremiumTemplatePurchase", () => ({
  usePremiumTemplatePurchase: () => ({
    revenueCatUserId: null,
    customerInfo: null,
    customerInfoStatus: "idle",
    acceptCustomerInfo: vi.fn(),
    selectedPremiumTemplate: null,
  }),
}));
vi.mock("@/lib/useCookbookPurchase", () => ({
  useCookbookPurchase: () => ({
    cookbookPrice: null,
    cookbookLocked: false,
    cookbookAccessStatus: "unlocked",
    cookbookPurchaseBusy: false,
    purchaseCookbookAndContinue: vi.fn(),
  }),
}));
vi.mock("@/lib/useProPurchase", () => ({
  useProPurchase: () => ({ proBusy: false, purchaseProAndContinue: vi.fn() }),
}));

// ---- components that only paint -------------------------------------------

/** Renders any element-valued props, so a save control passed to the header shows up. */
function passThrough(props: Record<string, unknown>) {
  return createElement(
    "div",
    null,
    ...Object.values(props).filter((value): value is ReactNode => isValidElement(value)),
  );
}
const nullComponent = () => null;

vi.mock("@/components/SiteHeader", () => ({ SiteHeader: passThrough }));
vi.mock("@/components/AccountControl", () => ({
  SAVE_FAILURES: new Set(["offline", "error", "conflict", "adoption"]),
  SAVE_STATUS_LABEL: {
    saving: "Saving…",
    saved: "Saved",
    offline: "Offline, changes pending",
    error: "Couldn’t save",
    conflict: "Newer version found",
    adoption: "Finish saving to your account",
  },
}));
vi.mock("@/components/FeedbackButton", () => ({ FeedbackDialog: nullComponent }));
vi.mock("@/components/PrintDialogs", () => ({ PrintDialogs: nullComponent }));
vi.mock("@/components/AddRecipeDialog", () => ({ AddRecipeDialog: nullComponent }));
vi.mock("@/components/CookbookWelcomeDialog", () => ({ CookbookWelcomeDialog: nullComponent }));
vi.mock("@/components/CookbookReadyDialog", () => ({ CookbookReadyDialog: nullComponent }));
vi.mock("@/components/ImagePicker", () => ({ ImagePicker: nullComponent }));
vi.mock("@/components/RecipeLoadingState", () => ({ RecipeLoadingState: nullComponent }));
vi.mock("@/components/ProUpgradeDialog", () => ({ ProUpgradeDialog: nullComponent }));
vi.mock("@/components/print/MobileStructureSheet", () => ({ MobileStructureSheet: nullComponent }));
vi.mock("@/components/print/MobileSheet", () => ({ MobileSheet: nullComponent }));
vi.mock("@/components/print/PrintConfigPanel", () => ({
  PrintConfigPanel: (props: Record<string, (...args: unknown[]) => void>) => {
    panel.props = props;
    return null;
  },
}));
vi.mock("@/components/print/PrintFormatToggle", () => ({ PrintFormatToggle: nullComponent }));
vi.mock("@/components/print/PageRail", () => ({ PageRail: nullComponent }));
vi.mock("@/components/print/PrintDeck", () => ({
  PrintDeck: nullComponent,
  pendingSlotIndexIn: () => -1,
}));

// ---- helpers ---------------------------------------------------------------

function recipeItem(id: string, title: string) {
  return {
    id,
    method: "manual",
    source: "fixture",
    status: "ready",
    title,
    recipe: {
      title,
      ingredients: [{ raw: "2 cups flour" }, { raw: "3 eggs" }],
      instructions: [
        { step: 1, text: "Mix." },
        { step: 2, text: "Cook." },
      ],
    },
  };
}

/** Puts `count` ready recipes in the session queue and print job, as an import would. */
function seedRecipes(count: number) {
  const items = Array.from({ length: count }, (_, i) => recipeItem(`fx-${i + 1}`, `Fixture ${i + 1}`));
  sessionStorage.setItem("recipeprinter:queue:v1", JSON.stringify(items));
  sessionStorage.setItem(
    "recipeprinter:print-job:current:v1",
    JSON.stringify({ ids: items.map((item) => item.id) }),
  );
}

async function renderPrintPage() {
  const { default: PrintPage } = await import("@/app/print/page");
  let utils!: ReturnType<typeof render>;
  await act(async () => {
    utils = render(createElement(PrintPage));
  });
  return utils;
}

/** Lets effects, promises and timers run for `ms` of fake time. */
async function settle(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** A change to the book, made the way the cook makes one: through a setting. */
async function editASetting(setting: "setShowSourceUrl" | "setShowPhoto" = "setShowSourceUrl") {
  await act(async () => {
    panel.props[setting]((current: unknown) => !current);
  });
}

/** What the header's save control says. The toast is a role=status too, so it is excluded. */
function saveControlText(): string {
  return Array.from(document.querySelectorAll(".rp-save-status, .rp-save-state, [role='status']"))
    .filter((node) => !node.closest(".recipe-toast"))
    .map((node) => node.textContent?.trim())
    .filter(Boolean)
    .join(" | ");
}

function toastText(): string | null {
  return document.querySelector(".recipe-toast span")?.textContent ?? null;
}

function signIn(user: FakeUser = users.alice) {
  act(() => authStore.set({ user, ready: true }));
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  nav.search = "";
  authStore.set({ user: null, ready: true, redirectError: null });
  io.savePrintProject.mockReset().mockImplementation(async (project: { revision?: number }) => ({
    ...project,
    revision: Number(project.revision ?? 0) + 1,
  }));
  io.adoptAnonymousProject
    .mockReset()
    .mockImplementation(async (_uid: string, project: { revision?: number }) => ({
      ...project,
      revision: 1,
    }));
  io.loadPrintProjectHead.mockReset().mockResolvedValue(null);
  io.loadPrintProject.mockReset().mockResolvedValue(null);
  io.materializeProjectPhotos
    .mockReset()
    .mockResolvedValue({ photos: {}, uploadedRecipeImages: new Map() });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(async () => {
  cleanup();
  // Unmounting flushes a pending edit, which is async; let it finish before the
  // mocks are torn down, or it logs a spurious failure.
  await vi.advanceTimersByTimeAsync(100);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("what gets kept, and when", () => {
  it("writes nothing for a single recipe, even signed in", async () => {
    seedRecipes(1);
    signIn();
    await renderPrintPage();
    await settle(5000);
    expect(io.adoptAnonymousProject).not.toHaveBeenCalled();
    expect(io.savePrintProject).not.toHaveBeenCalled();
  });

  it("writes nothing while signed out, and shows a Save button as the door to sign-in", async () => {
    seedRecipes(2);
    await renderPrintPage();
    await settle(5000);
    expect(io.adoptAnonymousProject).not.toHaveBeenCalled();
    expect(io.savePrintProject).not.toHaveBeenCalled();
    expect(document.querySelector("button[aria-label='Sign in to save project']")).not.toBeNull();
  });

  it("keeps a signed-in two-recipe job on its own, exactly once, and says so", async () => {
    seedRecipes(2);
    signIn();
    await renderPrintPage();
    await settle(5000);

    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
    expect(io.adoptAnonymousProject.mock.calls[0][0]).toBe("alice");
    expect(io.savePrintProject).not.toHaveBeenCalled();
    expect(toastText()).toBe("Saved to Projects. This project will keep saving automatically.");
    expect(saveControlText()).toContain("Saved");
  });

  it("keeps a two-recipe job the moment its cook signs in, level-triggered", async () => {
    seedRecipes(2);
    await renderPrintPage();
    await settle(1000);
    expect(io.adoptAnonymousProject).not.toHaveBeenCalled();

    signIn();
    await settle(5000);
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
  });

  it("does not write again when nothing changed after the first save", async () => {
    seedRecipes(2);
    signIn();
    await renderPrintPage();
    await settle(10000);
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
    expect(io.savePrintProject).not.toHaveBeenCalled();
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

/** Signed in with two recipes, first save landed: the state most editing happens in. */
async function renderKeptProject() {
  seedRecipes(2);
  signIn();
  const utils = await renderPrintPage();
  await settle(5000);
  expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
  return utils;
}

describe("autosaving edits", () => {
  it("writes an edit 1.5s after it settles, against the document it already has", async () => {
    await renderKeptProject();
    await editASetting();
    await settle(1400);
    expect(io.savePrintProject).not.toHaveBeenCalled();

    await settle(200);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
    // Revision 1 is what the first save (the adoption) came back with.
    expect(io.savePrintProject.mock.calls[0][0].revision).toBe(1);
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
  });

  it("turns a burst of edits into one write", async () => {
    await renderKeptProject();
    await editASetting();
    await settle(1000);
    await editASetting();
    await settle(1000);
    await editASetting();
    await settle(1600);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
  });

  it("does not write an edit that put things back the way they were", async () => {
    await renderKeptProject();
    await editASetting();
    await editASetting();
    await settle(5000);
    expect(io.savePrintProject).not.toHaveBeenCalled();
  });

  it("does not retry a failed autosave on its own, however long it waits", async () => {
    // The retry-storm guard: a failed save never advances the saved baseline, so
    // without it every status change would re-fire the same write forever.
    await renderKeptProject();
    io.savePrintProject.mockRejectedValue(new Error("permission-denied"));
    await editASetting();
    await settle(1600);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
    expect(saveControlText()).toContain("Couldn’t save");

    await settle(60000);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
  });

  it("retries when the cook presses the failed button", async () => {
    await renderKeptProject();
    io.savePrintProject.mockRejectedValueOnce(new Error("network"));
    await editASetting();
    await settle(1600);
    expect(saveControlText()).toContain("Couldn’t save");

    await act(async () => {
      (document.querySelector(".rp-save-state--failed") as HTMLButtonElement).click();
    });
    await settle(50);
    expect(io.savePrintProject).toHaveBeenCalledTimes(2);
    expect(saveControlText()).toContain("Saved");
  });

  it("stops autosaving once a conflict is raised, and says so", async () => {
    const { PrintProjectConflictError } = await import("@/lib/printProjects");
    await renderKeptProject();
    io.savePrintProject.mockRejectedValue(new PrintProjectConflictError());
    await editASetting();
    await settle(1600);
    expect(saveControlText()).toContain("Newer version found");

    await editASetting();
    await settle(5000);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
  });

  it("holds a save that arrives mid-write and writes the newest state after it", async () => {
    await renderKeptProject();
    const first = deferred<{ id: string; revision: number }>();
    io.savePrintProject.mockReset();
    io.savePrintProject
      .mockImplementationOnce(() => first.promise)
      .mockImplementation(async (project: { revision?: number }) => ({
        ...project,
        revision: Number(project.revision ?? 0) + 1,
      }));

    await editASetting();
    await settle(1600);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);

    // Two more edits while the first write is still out. Each is a different
    // setting: toggling the same one back would just restore the saved state.
    await editASetting("setShowPhoto");
    await settle(1600);
    await act(async () => {
      panel.props.setTemplate("bistro");
    });
    await settle(1600);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);

    // A real save answers with the document it wrote, id included; without an id
    // the page would rightly treat the next write as a first save.
    const writtenId = io.savePrintProject.mock.calls[0][0].id;
    await act(async () => first.resolve({ id: writtenId, revision: 2 }));
    await settle(50);
    // One more write, not two: newest wins, each snapshot contains the ones before.
    expect(io.savePrintProject).toHaveBeenCalledTimes(2);
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
    // ...and it holds the LATEST state (both later edits), not the first one's.
    const settings = io.savePrintProject.mock.calls[1][0].settings;
    expect(settings.showPhoto).toBe(false);
    expect(settings.template).toBe("bistro");
  });
});

describe("leaving and connectivity", () => {
  it("flushes an edit that was still inside the debounce when the page unmounts", async () => {
    const { unmount } = await renderKeptProject();
    await editASetting();
    await settle(500);
    expect(io.savePrintProject).not.toHaveBeenCalled();

    unmount();
    await settle(50);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
  });

  it("does not write on unmount when nothing changed", async () => {
    const { unmount } = await renderKeptProject();
    unmount();
    await settle(50);
    expect(io.savePrintProject).not.toHaveBeenCalled();
  });

  it("flushes on pagehide as well", async () => {
    await renderKeptProject();
    await editASetting();
    await settle(500);
    act(() => {
      window.dispatchEvent(new Event("pagehide"));
    });
    await settle(50);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
  });

  it("reports offline for a kept project, and writes again when the connection returns", async () => {
    await renderKeptProject();
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await settle(0);
    expect(saveControlText()).toContain("Offline, changes pending");

    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    await settle(50);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
  });

  it("says nothing about being offline for a project that was never kept", async () => {
    seedRecipes(1);
    signIn();
    await renderPrintPage();
    await settle(100);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    await settle(0);
    expect(saveControlText()).not.toContain("Offline");
  });
});

describe("attaching to a book the account already holds", () => {
  it("waits for the reattach check before its first write", async () => {
    // Saving into that gap sends the write down the adoption path, which replaces
    // the document rather than writing against its revision.
    const head = deferred<null>();
    io.loadPrintProjectHead.mockReturnValue(head.promise);
    seedRecipes(2);
    signIn();
    await renderPrintPage();
    await settle(5000);
    expect(io.adoptAnonymousProject).not.toHaveBeenCalled();

    await act(async () => head.resolve(null));
    await settle(50);
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
  });

  it("reattaches to a saved book instead of adopting over it, and writes edits against its revision", async () => {
    io.loadPrintProjectHead.mockResolvedValue({ id: "proj-existing", revision: 4 });
    seedRecipes(2);
    signIn();
    await renderPrintPage();
    await settle(5000);
    // Opening it is not an edit: nothing is written, and it is never adopted over.
    expect(io.adoptAnonymousProject).not.toHaveBeenCalled();
    expect(io.savePrintProject).not.toHaveBeenCalled();
    expect(saveControlText()).toContain("Saved");

    await editASetting();
    await settle(1600);
    expect(io.savePrintProject).toHaveBeenCalledTimes(1);
    expect(io.savePrintProject.mock.calls[0][0].id).toBe("proj-existing");
    expect(io.savePrintProject.mock.calls[0][0].revision).toBe(4);
  });
});

describe("signing in to keep something", () => {
  it("writes exactly once when a Save press and the automatic keep both apply", async () => {
    seedRecipes(2);
    await renderPrintPage();
    await settle(500);
    await act(async () => {
      (document.querySelector("button[aria-label='Sign in to save project']") as HTMLButtonElement).click();
    });
    await settle(50);
    expect(io.adoptAnonymousProject).not.toHaveBeenCalled();

    signIn();
    await settle(5000);
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
  });

  it("still writes once after the page is destroyed by a sign-in redirect", async () => {
    // On a phone signing in leaves the document; refs and state do not survive.
    seedRecipes(2);
    const first = await renderPrintPage();
    await settle(500);
    await act(async () => {
      (document.querySelector("button[aria-label='Sign in to save project']") as HTMLButtonElement).click();
    });
    first.unmount();

    signIn();
    await renderPrintPage();
    await settle(5000);
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(1);
  });
});

describe("a different account", () => {
  it("never writes the first account's project into the second", async () => {
    // Save identity lives in refs so a queued save can read it before React
    // commits, and nothing used to reset them when the account changed: the
    // next save wrote the first account's id and revision into the second
    // account's library. The way to reach a save from here is to promise one
    // while signed out, then sign in as somebody else.
    await renderKeptProject();
    act(() => authStore.set({ user: null }));
    await settle(50);
    await act(async () => {
      (document.querySelector("button[aria-label='Sign in to save project']") as HTMLButtonElement).click();
    });
    await settle(50);
    const adoptsBefore = io.adoptAnonymousProject.mock.calls.length;

    act(() => authStore.set({ user: users.bob }));
    await settle(5000);

    // It goes to bob as a FIRST save (adoption), not as a write against alice's document.
    expect(io.savePrintProject).not.toHaveBeenCalled();
    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(adoptsBefore + 1);
    const [uid, project] = io.adoptAnonymousProject.mock.calls[adoptsBefore];
    expect(uid).toBe("bob");
    expect(project.ownerUid).toBe("bob");
    expect(project.revision ?? 0).toBe(0);
  });

  it("writes nothing when one account switches straight to another, until the cook acts", async () => {
    // Pinned as it is today, and worth a decision: the automatic keep fires once
    // per project id, and the first account already spent it, so the second
    // account's job is not kept on its own and does not autosave either.
    await renderKeptProject();
    const before = io.adoptAnonymousProject.mock.calls.length;

    act(() => authStore.set({ user: users.bob }));
    await settle(5000);
    await editASetting();
    await settle(5000);

    expect(io.adoptAnonymousProject).toHaveBeenCalledTimes(before);
    expect(io.savePrintProject).not.toHaveBeenCalled();
  });

  it("clears the previous account's Saved status", async () => {
    await renderKeptProject();
    expect(saveControlText()).toContain("Saved");
    act(() => authStore.set({ user: null }));
    await settle(50);
    expect(saveControlText()).not.toContain("Saved");
  });
});
