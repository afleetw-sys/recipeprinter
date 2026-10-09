// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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

// ---- Firestore's connection around a print --------------------------------

/** Every pause, resume and print(), in the order they happened. */
const printNet = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/lib/firebase/db", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/firebase/db")>();
  return {
    ...original,
    pauseFirestoreForPrint: () => printNet.calls.push("pause"),
    resumeFirestoreAfterPrint: () => printNet.calls.push("resume"),
  };
});

// ---- what the print reports ------------------------------------------------

/** Every product event the page sent, in order. */
const analytics = vi.hoisted(() => ({ events: [] as Array<[string, Record<string, unknown>]> }));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/analytics")>();
  return {
    ...original,
    track: (name: string, props: Record<string, unknown>) => analytics.events.push([name, props]),
  };
});

// ---- leaving for Safari ----------------------------------------------------

/** Every link the page tried to open in Safari. */
const safari = vi.hoisted(() => ({ opened: [] as string[] }));
vi.mock("@/lib/printHandoff", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/printHandoff")>();
  return { ...original, openInSafari: (url: string) => safari.opened.push(url) };
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

/** Pages the mocked layout reports. Empty disables Print, which the save tests never press. */
const layout = vi.hoisted(() => ({ navItems: [] as unknown[] }));
vi.mock("@/lib/usePrintSheets", () => ({
  usePrintSheets: () => ({
    hasRecipeBackSide: false,
    continueOnBack: false,
    printLayoutReady: true,
    sheets: [],
    navItems: layout.navItems,
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
    customerInfoLastVerifiedAtMs: null,
    setCustomerInfo: vi.fn(),
    markCustomerInfoVerified: vi.fn(),
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

/* Safari will not open the print dialog while any request is loading, and a
   signed-in page has Firestore's stream open for up to a minute. These pin the
   wiring that closes it in time and reopens it after (see lib/firebase/db.ts
   and e2e/quiet-print.spec.ts). */
describe("Firestore's connection around a print", () => {
  afterEach(() => {
    layout.navItems = [];
  });
  beforeEach(() => {
    layout.navItems = [{ id: "fx-1", label: "Fixture 1" }];
    printNet.calls = [];
    analytics.events = [];
    // jsdom has no window.focus; afterprint calls it.
    vi.spyOn(window, "focus").mockImplementation(() => undefined);
    vi.spyOn(window, "print").mockImplementation(() => {
      printNet.calls.push("print");
    });
  });

  /** jsdom's `fireEvent.pointerDown` drops `button`, which `pressPrint` checks. */
  const press = (button: HTMLElement) =>
    act(() => {
      fireEvent(button, new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    });

  const printButton = () => {
    const button = Array.from(document.querySelectorAll("button")).find((b) =>
      /^(Buy & )?Print$/.test(b.textContent?.trim() ?? ""),
    );
    if (!button) throw new Error("no Print button");
    return button;
  };

  it("a press closes it before the click, so print() can stay inside the click", async () => {
    seedRecipes(1);
    await renderPrintPage();
    await settle(100);

    press(printButton());
    expect(printNet.calls).toEqual(["pause"]);
  });

  it("the click calls print() with it closed, in the same task: nothing awaited", async () => {
    seedRecipes(1);
    await renderPrintPage();
    await settle(100);

    press(printButton());
    act(() => {
      fireEvent.click(printButton());
    });
    // No settle: print() must already have run, synchronously, inside the click.
    expect(printNet.calls.at(-1)).toBe("print");
    // And the last word on the connection before it was "closed". A resume
    // queued by letting go of the press must not come after the last pause.
    const beforePrint = printNet.calls.slice(0, -1);
    expect(beforePrint.lastIndexOf("pause")).toBeGreaterThan(beforePrint.lastIndexOf("resume"));
  });

  it("a keyboard press, with no pointerdown, still closes it before print()", async () => {
    seedRecipes(1);
    await renderPrintPage();
    await settle(100);

    act(() => {
      fireEvent.click(printButton());
    });
    expect(printNet.calls.slice(-2)).toEqual(["pause", "print"]);
  });

  it("beforeprint and afterprint reopen it", async () => {
    seedRecipes(1);
    await renderPrintPage();
    await settle(100);

    act(() => {
      window.dispatchEvent(new Event("beforeprint"));
    });
    expect(printNet.calls).toEqual(["resume"]);
    act(() => {
      window.dispatchEvent(new Event("afterprint"));
    });
    expect(printNet.calls).toEqual(["resume", "resume"]);
  });

  /** The spinner on the Print button, or null once it has stopped. */
  const printSpinner = () => printButton().querySelector("svg.spin");
  const eventNames = () => analytics.events.map(([name]) => name);

  it("a print() that throws (an app's broken stand-in) stops the spinner and says why", async () => {
    // The Google app's in-app browser replaces window.print with a hand-off to
    // the app that throws: `window.webkit.messageHandlers.print` is missing.
    // The throw used to skip everything after print(), so the button spun for
    // good, Firestore stayed paused, and nothing was ever reported.
    for (const viaPointer of [true, false]) {
      seedRecipes(1);
      analytics.events = [];
      vi.spyOn(window, "print").mockImplementation(() => {
        throw new TypeError(
          "undefined is not an object (evaluating 'window.webkit.messageHandlers.print.postMessage')",
        );
      });
      await renderPrintPage();
      await settle(100);
      printNet.calls = [];

      if (viaPointer) press(printButton());
      act(() => {
        fireEvent.click(printButton());
      });
      await settle(50);

      expect(printSpinner(), `spinner, viaPointer=${viaPointer}`).toBeNull();
      expect(printNet.calls.at(-1), `connection, viaPointer=${viaPointer}`).toBe("resume");
      const attempt = analytics.events.find(([name]) => name === "print_attempt");
      expect(attempt?.[1].endedBy, `report, viaPointer=${viaPointer}`).toBe("threw");
      expect(attempt?.[1].error, `report, viaPointer=${viaPointer}`).toMatch(/messageHandlers\.print/);
      cleanup();
    }
  });

  it("the spinner lasts until the print sheet is on screen, in each Safari", async () => {
    // Measured in the iOS 17.5 and 26.5 simulators (2026-10-08): iPhone Safari
    // fires beforeprint ~0.3s after print() and puts the sheet up within 0.5s,
    // then fires nothing at all, not when the sheet opens and not when it
    // closes. Its "blocked from automatically printing" alert does fire blur
    // when it appears and focus when Allow or Ignore is tapped. Mac Safari
    // holds its sheet, with no event, until the page stops loading.
    const ua = vi.spyOn(navigator, "userAgent", "get");
    const userAgents = {
      iPhone:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1",
      Mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.2 Safari/605.1.15",
    };
    const fire = (type: string) =>
      act(() => {
        window.dispatchEvent(new Event(type));
      });
    const startPrint = async (device: keyof typeof userAgents) => {
      ua.mockReturnValue(userAgents[device]);
      seedRecipes(1);
      await renderPrintPage();
      await settle(100);
      act(() => {
        fireEvent.click(printButton());
      });
    };

    // iPhone, a normal print: gone just after the sheet slides up, so it is not
    // still spinning when they close the sheet (nothing says they did).
    await startPrint("iPhone");
    await settle(300);
    fire("beforeprint");
    fire("afterprint");
    await settle(1_000);
    expect(printSpinner(), "iPhone after the sheet is up").toBeNull();
    cleanup();

    // iPhone, a second print: Safari's alert takes focus. Keep spinning behind
    // it; Ignore (focus, no beforeprint) ends it.
    await startPrint("iPhone");
    await settle(50);
    fire("blur");
    await settle(3_000);
    expect(printSpinner(), "iPhone behind the blocked alert").not.toBeNull();
    fire("focus");
    await settle(1_000);
    expect(printSpinner(), "iPhone after Ignore").toBeNull();
    cleanup();

    // Mac Safari waiting on the network: no event for seconds, then the sheet.
    await startPrint("Mac");
    await settle(5_000);
    expect(printSpinner(), "Mac while Safari holds the sheet").not.toBeNull();
    fire("beforeprint");
    fire("afterprint");
    fire("blur");
    await settle(50);
    expect(printSpinner(), "Mac once the sheet has the window").toBeNull();
  });

  it("an iPhone app whose print() throws hands the same cards to Safari to print", async () => {
    // The Google app on iOS: print() throws and nothing inside the app reaches
    // a print sheet, but Safari, opened with x-safari-https://, prints (tested
    // on a real iPhone 2026-10-08). The deck has to go with it.
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 26_6_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/441.5.989047059 Mobile/15E148 Safari/604.1",
    );
    vi.spyOn(window, "print").mockImplementation(() => {
      throw new TypeError("undefined is not an object (evaluating 'window.webkit.messageHandlers.print.postMessage')");
    });
    safari.opened = [];
    seedRecipes(1);
    localStorage.setItem("recipeprinter:print-settings:v1", JSON.stringify({ showPhoto: false }));
    await renderPrintPage();
    await settle(100);

    act(() => {
      fireEvent.click(printButton());
    });
    expect(safari.opened).toHaveLength(1);
    const link = new URL(safari.opened[0].replace(/^x-safari-https:/, "https:"));
    expect(link.pathname).toBe("/print");
    expect(link.searchParams.get("print")).toBe("1");
    cleanup();

    // Safari: a new tab with nothing in it, opened on that link.
    sessionStorage.clear();
    localStorage.clear();
    window.history.replaceState(null, "", `${link.pathname}${link.search}${link.hash}`);
    const { seedPrintHandoff } = await import("@/lib/printHandoff");
    expect(seedPrintHandoff()).toBe(true);
    const queue = JSON.parse(sessionStorage.getItem("recipeprinter:queue:v1") ?? "[]");
    expect(queue.map((item: { title: string }) => item.title)).toEqual(["Fixture 1"]);
    expect(JSON.parse(sessionStorage.getItem("recipeprinter:print-job:current:v1") ?? "{}").ids).toEqual(["fx-1"]);
    expect(JSON.parse(localStorage.getItem("recipeprinter:print-settings:v1") ?? "{}").showPhoto).toBe(false);
    // And the recipes are out of the address bar once read.
    expect(window.location.hash).toBe("");
    window.history.replaceState(null, "", "/");
  });

  it("leaving the page reopens it", async () => {
    seedRecipes(1);
    const { unmount } = await renderPrintPage();
    await settle(100);
    printNet.calls = [];

    unmount();
    expect(printNet.calls).toContain("resume");
  });
});
