import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { printProjectFingerprint, SAVE_TIMEOUT_MS, type PendingSave } from "@/lib/printSave";
import {
  FIRST_SAVE_TOAST,
  writeProject,
  type SaveWriteContext,
  type SaveWriteRefs,
} from "@/lib/printSaveWrite";

/* The write half of the save path. These pin the contracts the code's own
   comments make: one write at a time (the latch), a write that has been given up
   on or overtaken reports nothing, a save that waits its turn writes the book it
   was asked to write, and every outcome says the right thing. */

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeRefs(overrides: Partial<{ [K in keyof SaveWriteRefs]: SaveWriteRefs[K]["current"] }> = {}): SaveWriteRefs {
  return {
    saveInFlight: { current: overrides.saveInFlight ?? false },
    saveGeneration: { current: overrides.saveGeneration ?? 0 },
    queuedSave: { current: overrides.queuedSave ?? null },
    projectRevision: { current: overrides.projectRevision ?? 0 },
    savedProjectId: { current: overrides.savedProjectId ?? null },
    lastSavedCookbookMode: { current: overrides.lastSavedCookbookMode ?? false },
    lastSavedFingerprint: { current: overrides.lastSavedFingerprint ?? null },
    quietFirstSave: { current: overrides.quietFirstSave ?? false },
  };
}

const layout = {
  cardSize: "letter",
  template: "classic",
  doubleSided: false,
  showPhoto: true,
  showSourceUrl: true,
  showDescription: true,
  showCutLines: false,
} as const;

function makePending(overrides: Partial<PendingSave> = {}, ownerUid: string | null = "user-1"): PendingSave {
  return {
    project: {
      id: "proj-1",
      ownerUid: ownerUid ?? undefined,
      sections: [],
      settings: { cookbookMode: false },
    } as unknown as PendingSave["project"],
    items: null,
    meta: { projectId: "proj-1" } as unknown as PendingSave["meta"],
    layout: { ...layout },
    overwriteApproved: false,
    ...overrides,
  };
}

interface Harness {
  ctx: SaveWriteContext;
  refs: SaveWriteRefs;
  statuses: string[];
  toasts: string[];
  setSavedProjectId: ReturnType<typeof vi.fn>;
  setMetaProjectId: ReturnType<typeof vi.fn>;
  adoptUploadedPhotos: ReturnType<typeof vi.fn>;
  adoptUploadedMetaPhotos: ReturnType<typeof vi.fn>;
  saveProject: ReturnType<typeof vi.fn>;
  adoptProject: ReturnType<typeof vi.fn>;
}

function makeHarness(
  refs: SaveWriteRefs = makeRefs(),
  extra: Partial<SaveWriteContext> = {},
): Harness {
  const statuses: string[] = [];
  const toasts: string[] = [];
  const setSavedProjectId = vi.fn();
  const setMetaProjectId = vi.fn();
  const adoptUploadedPhotos = vi.fn();
  const adoptUploadedMetaPhotos = vi.fn();
  const saveProject = vi.fn(async (project: { id: string }) => ({ ...project, id: project.id, revision: 7 }));
  const adoptProject = vi.fn(async (_uid: string, project: { id: string }) => ({
    ...project,
    id: project.id,
    revision: 1,
  }));
  const ctx = {
    refs,
    materializePhotos: vi.fn(async () => ({
      photos: {},
      uploadedRecipeImages: new Map([["q1", "https://x/y.jpg"]]),
      uploadedUrls: new Map([["blob:cover", "https://x/cover.jpg"]]),
    })),
    adoptUploadedMetaPhotos,
    saveProject,
    adoptProject,
    isConflictError: (error: unknown) => error instanceof Error && error.name === "Conflict",
    adoptionFailed: () => false,
    setSaveStatus: (status: string) => statuses.push(status),
    setSavedProjectId,
    showToast: (message: string) => toasts.push(message),
    adoptUploadedPhotos,
    metaProjectId: () => "proj-1",
    setMetaProjectId,
    ...extra,
  } as unknown as SaveWriteContext;
  return { ctx, refs, statuses, toasts, setSavedProjectId, setMetaProjectId, adoptUploadedPhotos, adoptUploadedMetaPhotos, saveProject, adoptProject };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("a write that lands", () => {
  it("adopts on the first save, then reports saved and says so once", async () => {
    const h = makeHarness();
    await writeProject(makePending(), h.ctx);

    expect(h.adoptProject).toHaveBeenCalledTimes(1);
    expect(h.saveProject).not.toHaveBeenCalled();
    expect(h.statuses).toEqual(["saving", "saved"]);
    expect(h.toasts).toEqual([FIRST_SAVE_TOAST]);
    expect(h.refs.savedProjectId.current).toBe("proj-1");
    expect(h.setSavedProjectId).toHaveBeenCalledWith("proj-1");
    expect(h.refs.projectRevision.current).toBe(1);
  });

  it("writes against the known document once it has an identity, without the toast", async () => {
    const h = makeHarness(makeRefs({ savedProjectId: "proj-1", projectRevision: 6 }));
    await writeProject(makePending(), h.ctx);

    expect(h.saveProject).toHaveBeenCalledTimes(1);
    expect(h.adoptProject).not.toHaveBeenCalled();
    expect(h.toasts).toEqual([]);
    expect(h.refs.projectRevision.current).toBe(7);
  });

  it("hands adoption the cook's overwrite answer, and the owner it was built for", async () => {
    const h = makeHarness();
    await writeProject(makePending({ overwriteApproved: true }), h.ctx);
    expect(h.adoptProject).toHaveBeenCalledWith("user-1", expect.anything(), { overwriteExisting: true });
  });

  it("stays quiet on the first save of a cookbook, and clears the flag either way", async () => {
    const h = makeHarness(makeRefs({ quietFirstSave: true }));
    await writeProject(makePending(), h.ctx);
    expect(h.toasts).toEqual([]);
    expect(h.refs.quietFirstSave.current).toBe(false);
  });

  it("records which mode was saved, so autosave knows what was agreed to", async () => {
    const h = makeHarness();
    const pending = makePending();
    (pending.project.settings as { cookbookMode?: boolean }).cookbookMode = true;
    await writeProject(pending, h.ctx);
    expect(h.refs.lastSavedCookbookMode.current).toBe(true);
  });

  it("takes the baseline from the snapshot that was written, not from live state", async () => {
    const h = makeHarness();
    const pending = makePending({ items: [] });
    await writeProject(pending, h.ctx);
    expect(h.refs.lastSavedFingerprint.current).toBe(
      printProjectFingerprint(pending.items, { ...pending.meta, projectId: "proj-1" }, pending.layout),
    );
  });

  it("lets the queue forget photos that are now in Storage", async () => {
    const h = makeHarness();
    await writeProject(makePending(), h.ctx);
    expect(h.adoptUploadedPhotos).toHaveBeenCalledWith(new Map([["q1", "https://x/y.jpg"]]));
  });

  it("points the cover and chapters at Storage too, so the next save uploads nothing", async () => {
    const h = makeHarness();
    await writeProject(makePending(), h.ctx);
    expect(h.adoptUploadedMetaPhotos).toHaveBeenCalledWith(new Map([["blob:cover", "https://x/cover.jpg"]]));
  });

  it("re-points the working copy only when the saved id differs from its own", async () => {
    const same = makeHarness();
    await writeProject(makePending(), same.ctx);
    expect(same.setMetaProjectId).not.toHaveBeenCalled();

    const differs = makeHarness(makeRefs(), { metaProjectId: () => "some-other-id" });
    await writeProject(makePending(), differs.ctx);
    expect(differs.setMetaProjectId).toHaveBeenCalledWith("proj-1");
  });

  it("leaves no timer behind", async () => {
    const h = makeHarness();
    await writeProject(makePending(), h.ctx);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("the latch", () => {
  it("does nothing at all for a document with no owner", async () => {
    const h = makeHarness();
    await writeProject(makePending({}, null), h.ctx);
    expect(h.statuses).toEqual([]);
    expect(h.refs.saveInFlight.current).toBe(false);
    expect(h.refs.saveGeneration.current).toBe(0);
  });

  it("is held for the duration of the write and released after", async () => {
    const gate = deferred<{ id: string; revision: number }>();
    const h = makeHarness(makeRefs(), { adoptProject: vi.fn(() => gate.promise) as never });
    const write = writeProject(makePending(), h.ctx);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.refs.saveInFlight.current).toBe(true);
    expect(h.statuses).toEqual(["saving"]);

    gate.resolve({ id: "proj-1", revision: 1 });
    await write;
    expect(h.refs.saveInFlight.current).toBe(false);
  });

  it("replays a queued save after release, with the same context, and empties the queue", async () => {
    const h = makeHarness();
    const queued = makePending({ overwriteApproved: true });
    h.refs.queuedSave.current = queued;

    await writeProject(makePending(), h.ctx);
    expect(h.refs.queuedSave.current).toBeNull();
    // Deferred to a timer, not run inline behind the write that released it.
    expect(h.adoptProject).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(0);
    expect(h.saveProject.mock.calls.length + h.adoptProject.mock.calls.length).toBe(2);
    expect(h.refs.saveGeneration.current).toBe(2);
  });
});

describe("giving up and being overtaken", () => {
  it("tries once more before saying a save failed", async () => {
    // A write that misses the deadline has often landed, its reply lost
    // (a backgrounded Safari tab). Reporting "Couldn't save" there told the
    // cook their saved book had not saved. The second try either lands or
    // finds the first one's write already there (`savePrintProject`).
    const never = new Promise<never>(() => undefined);
    const adoptProject = vi.fn(() => never);
    const h = makeHarness(makeRefs({ lastSavedFingerprint: "before" }), { adoptProject: adoptProject as never });
    void writeProject(makePending(), h.ctx);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.statuses).not.toContain("error");
    expect(adoptProject).toHaveBeenCalledTimes(2);
    expect(h.refs.saveGeneration.current).toBe(2);
  });

  it("reports the second try's success", async () => {
    const never = new Promise<never>(() => undefined);
    const adoptProject = vi
      .fn()
      .mockImplementationOnce(() => never)
      .mockImplementationOnce(async (_uid: string, project: { id: string }) => ({ ...project, revision: 2 }));
    const h = makeHarness(makeRefs(), { adoptProject: adoptProject as never });
    void writeProject(makePending(), h.ctx);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS + 1);
    expect(h.statuses).not.toContain("error");
    expect(h.statuses.at(-1)).toBe("saved");
    expect(h.refs.projectRevision.current).toBe(2);
  });

  it("stops claiming once the second try misses the deadline too: reports an error, frees the latch, records nothing as saved", async () => {
    const never = new Promise<never>(() => undefined);
    const adoptProject = vi.fn(() => never);
    const h = makeHarness(makeRefs({ lastSavedFingerprint: "before" }), { adoptProject: adoptProject as never });
    void writeProject(makePending(), h.ctx);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS + 1);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS - 1);
    expect(h.statuses).not.toContain("error");
    expect(h.refs.saveInFlight.current).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(h.statuses.at(-1)).toBe("error");
    expect(h.refs.saveInFlight.current).toBe(false);
    expect(h.refs.lastSavedFingerprint.current).toBe("before");
    expect(adoptProject).toHaveBeenCalledTimes(2);
  });

  it("starts the save that was waiting behind a write it gave up on, in place of a second try", async () => {
    const never = new Promise<never>(() => undefined);
    const adoptProject = vi.fn(() => never);
    const h = makeHarness(makeRefs(), { adoptProject: adoptProject as never });
    void writeProject(makePending(), h.ctx);
    const newer = makePending({ overwriteApproved: true });
    h.refs.queuedSave.current = newer;
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS);
    // 1ms, not 0: a zero-delay timer set DURING a fake-timer tick is scheduled
    // 1ms out, and the replay is set from inside the deadline's callback.
    await vi.advanceTimersByTimeAsync(1);
    expect(h.refs.queuedSave.current).toBeNull();
    expect(h.refs.saveGeneration.current).toBe(2);
    expect(adoptProject).toHaveBeenLastCalledWith("user-1", newer.project, { overwriteExisting: true });
    expect(h.statuses).not.toContain("error");
  });

  it("still lets a write that was only given up on report itself if it does land", async () => {
    // "We gave up waiting" is not "it did not happen": a late answer that is
    // still the current write reports itself, revision and all.
    const gate = deferred<{ id: string; revision: number }>();
    const never = new Promise<never>(() => undefined);
    const adoptProject = vi
      .fn()
      .mockImplementationOnce(() => never)
      .mockImplementationOnce(() => gate.promise);
    const h = makeHarness(makeRefs(), { adoptProject: adoptProject as never });
    void writeProject(makePending(), h.ctx);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS + 1);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS);
    expect(h.statuses.at(-1)).toBe("error");

    gate.resolve({ id: "proj-1", revision: 9 });
    await vi.advanceTimersByTimeAsync(0);
    expect(h.statuses.at(-1)).toBe("saved");
    expect(h.refs.projectRevision.current).toBe(9);
  });

  it("says nothing for a write that was overtaken by a newer one", async () => {
    const slow = deferred<{ id: string; revision: number }>();
    const refs = makeRefs();
    const first = makeHarness(refs, { adoptProject: vi.fn(() => slow.promise) as never });
    const second = makeHarness(refs);

    const firstWrite = writeProject(makePending(), first.ctx);
    await vi.advanceTimersByTimeAsync(0);
    // A newer write starts (as it does once the first was given up on).
    await writeProject(makePending(), second.ctx);
    expect(second.statuses).toEqual(["saving", "saved"]);
    const revisionAfterSecond = refs.projectRevision.current;

    slow.resolve({ id: "proj-1", revision: 99 });
    await firstWrite;
    expect(first.statuses).toEqual(["saving"]);
    expect(refs.projectRevision.current).toBe(revisionAfterSecond);
    expect(first.setSavedProjectId).not.toHaveBeenCalled();
    expect(first.toasts).toEqual([]);
  });
});

describe("a write that fails", () => {
  function conflict() {
    const error = new Error("newer version");
    error.name = "Conflict";
    return error;
  }

  it("reports a conflict as a conflict", async () => {
    const h = makeHarness(makeRefs(), { adoptProject: vi.fn(async () => { throw conflict(); }) as never });
    await writeProject(makePending(), h.ctx);
    expect(h.statuses).toEqual(["saving", "conflict"]);
    expect(h.refs.saveInFlight.current).toBe(false);
  });

  it("reports anything else as an error", async () => {
    const h = makeHarness(makeRefs(), { adoptProject: vi.fn(async () => { throw new Error("network"); }) as never });
    await writeProject(makePending(), h.ctx);
    expect(h.statuses).toEqual(["saving", "error"]);
  });

  it("reports an adoption failure as its own state when the manifest says so", async () => {
    const h = makeHarness(makeRefs(), {
      adoptProject: vi.fn(async () => { throw new Error("adoption blew up"); }) as never,
      adoptionFailed: () => true,
    });
    await writeProject(makePending(), h.ctx);
    expect(h.statuses).toEqual(["saving", "adoption"]);
  });

  it("does not record the failed book as saved", async () => {
    const h = makeHarness(makeRefs({ lastSavedFingerprint: "before" }), {
      adoptProject: vi.fn(async () => { throw new Error("network"); }) as never,
    });
    await writeProject(makePending(), h.ctx);
    expect(h.refs.lastSavedFingerprint.current).toBe("before");
    expect(h.refs.savedProjectId.current).toBeNull();
  });

  it("says nothing about a failure that arrives after being overtaken", async () => {
    const slow = deferred<never>();
    const refs = makeRefs();
    const first = makeHarness(refs, { adoptProject: vi.fn(() => slow.promise) as never });
    const second = makeHarness(refs);

    const firstWrite = writeProject(makePending(), first.ctx);
    await vi.advanceTimersByTimeAsync(0);
    await writeProject(makePending(), second.ctx);

    slow.reject(new Error("late failure"));
    await firstWrite;
    expect(first.statuses).toEqual(["saving"]);
  });
});

/* Every part of a book reaches the account. The save runs the book through the
   photo sweep first, and the sweep hands back each photo-holding part; a part
   the save didn't give it came back blank and was written over the book's own.
   The opening page (`frontMatter`) was the one left out, so every account save
   dropped the dedication and a reload lost it (Amelia, 2026-11-04). Run with
   the real sweep (uploading nothing) over a book with every part filled in. */
describe("a save keeps every part of the book", () => {
  it("writes each part it was given, unchanged, through the real photo sweep", async () => {
    const { materializeProjectPhotos } = await import("@/lib/photoStorage");
    const book = {
      id: "proj-1",
      ownerUid: "user-1",
      kind: "cookbook",
      title: "Our Favorite Recipes",
      projectTitle: "Ruth's book",
      sourceProjectId: "older-1",
      sections: [
        {
          id: "s1",
          title: "Dinners",
          subtitle: "Weeknights",
          intro: "What we make most",
          cardPhotoMode: "photo",
          cardPhotoUrl: "https://x/opener.jpg",
          artCaption: "Sunday",
          items: [
            {
              id: "r1",
              method: "manual",
              source: "test",
              status: "ready",
              title: "Bread",
              addedAt: 0,
              recipe: { title: "Bread", ingredients: [{ raw: "flour" }], instructions: [{ step: 1, text: "Bake." }] },
            },
            { id: "page-1", method: "manual", source: "", status: "ready", title: "Notes", addedAt: 0, pageKind: "blank", pageContent: { title: "Notes", blurb: "Ours" } },
          ],
        },
      ],
      cover: { title: "Our Favorite Recipes", subtitle: "Again", author: "The Wingers", edition: "2026", template: "bistro", imageUrl: "https://x/cover.jpg" },
      backCover: { title: "", blurb: "Thanks for cooking", author: "From us", template: "bistro" },
      dedication: { title: "Old dedication", blurb: "Legacy", template: "bistro" },
      frontMatter: { kind: "dedication", heading: "Dedication", body: "For Grandma Ruth", signature: "With love", imageUrl: "https://x/ded.jpg" },
      settings: {
        cookbookMode: true,
        tableOfContents: true,
        tocTitle: "Inside",
        pageLooks: { cover: { elements: { "cover-title": { textSize: 1.2 } } } },
        sampleLines: true,
      },
      itemPlacements: { r1: { pageLayout: "image-spread", heroImageUrl: "https://x/hero.jpg", photoUrl: "https://x/p.jpg" } },
      stashedCookbook: { sections: [], cover: { title: "Stashed", template: "classic" } },
      createdAt: 1,
    } as unknown as PendingSave["project"];

    const h = makeHarness(makeRefs({ savedProjectId: "proj-1" }), {
      materializePhotos: (photos) => materializeProjectPhotos(photos, async (url) => url),
    } as Partial<SaveWriteContext>);
    await writeProject(makePending({ project: book }), h.ctx);

    expect(h.saveProject).toHaveBeenCalledTimes(1);
    const written = h.saveProject.mock.calls[0][0] as Record<string, unknown>;
    for (const [part, value] of Object.entries(book as unknown as Record<string, unknown>)) {
      expect(written[part], part).toEqual(value);
    }
  });
});
