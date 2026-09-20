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
  const saveProject = vi.fn(async (project: { id: string }) => ({ ...project, id: project.id, revision: 7 }));
  const adoptProject = vi.fn(async (_uid: string, project: { id: string }) => ({
    ...project,
    id: project.id,
    revision: 1,
  }));
  const ctx = {
    refs,
    materializePhotos: vi.fn(async () => ({ photos: {}, uploadedRecipeImages: new Map([["q1", "https://x/y.jpg"]]) })),
    saveProject,
    adoptProject,
    isConflictError: (error: unknown) => error instanceof Error && error.name === "Conflict",
    adoptionFailed: () => false,
    setSaveStatus: (status: string) => statuses.push(status),
    setSavedProjectId,
    setToastMessage: (message: string) => toasts.push(message),
    adoptUploadedPhotos,
    metaProjectId: () => "proj-1",
    setMetaProjectId,
    ...extra,
  } as unknown as SaveWriteContext;
  return { ctx, refs, statuses, toasts, setSavedProjectId, setMetaProjectId, adoptUploadedPhotos, saveProject, adoptProject };
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
  it("stops claiming after the deadline: reports an error, frees the latch, records nothing as saved", async () => {
    const never = new Promise<never>(() => undefined);
    const h = makeHarness(makeRefs({ lastSavedFingerprint: "before" }), { adoptProject: vi.fn(() => never) as never });
    void writeProject(makePending(), h.ctx);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS - 1);
    expect(h.statuses).toEqual(["saving"]);
    expect(h.refs.saveInFlight.current).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(h.statuses).toEqual(["saving", "error"]);
    expect(h.refs.saveInFlight.current).toBe(false);
    expect(h.refs.lastSavedFingerprint.current).toBe("before");
  });

  it("starts the save that was waiting behind a write it gave up on", async () => {
    const never = new Promise<never>(() => undefined);
    const h = makeHarness(makeRefs(), { adoptProject: vi.fn(() => never) as never });
    void writeProject(makePending(), h.ctx);
    h.refs.queuedSave.current = makePending();
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS);
    // 1ms, not 0: a zero-delay timer set DURING a fake-timer tick is scheduled
    // 1ms out, and the replay is set from inside the deadline's callback.
    await vi.advanceTimersByTimeAsync(1);
    expect(h.refs.queuedSave.current).toBeNull();
    expect(h.refs.saveGeneration.current).toBe(2);
  });

  it("still lets a write that was only given up on report itself if it does land", async () => {
    // "We gave up waiting" is not "it did not happen": the generation is not
    // bumped, so a late answer is still the current one, revision and all.
    const gate = deferred<{ id: string; revision: number }>();
    const h = makeHarness(makeRefs(), { adoptProject: vi.fn(() => gate.promise) as never });
    const write = writeProject(makePending(), h.ctx);
    await vi.advanceTimersByTimeAsync(SAVE_TIMEOUT_MS);
    expect(h.statuses).toEqual(["saving", "error"]);

    gate.resolve({ id: "proj-1", revision: 9 });
    await write;
    expect(h.statuses).toEqual(["saving", "error", "saved"]);
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
