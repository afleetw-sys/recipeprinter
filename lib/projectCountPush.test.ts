// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintProject } from "@/types/recipe";

// The account menu's project count is kept on the device (lib/projectCount),
// so it has to hear when the library changes. Every project the app creates is
// first written by `savePrintProject`, and every one it removes goes through
// `deletePrintProject`, so those two tell it. A save of a project that already
// exists (every autosave) must not: it changes nothing about the count.

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const changed = vi.hoisted(() => vi.fn());

vi.mock("@/lib/projectCount", () => ({ projectLibraryChanged: changed }));
vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/firebase/storage", () => ({ getFirebaseStorage: () => ({}) }));
vi.mock("firebase/storage", () => ({
  ref: () => ({}),
  listAll: async () => ({ items: [], prefixes: [] }),
  deleteObject: async () => undefined,
}));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
  deleteDoc: async (ref: string) => void store.delete(ref),
  runTransaction: async (
    _db: unknown,
    body: (transaction: {
      get: (ref: string) => Promise<{ exists: () => boolean; data: () => unknown }>;
      set: (ref: string, data: Record<string, unknown>) => void;
    }) => Promise<unknown>,
  ) => {
    const pending: Array<[string, Record<string, unknown>]> = [];
    const result = await body({
      get: async (ref) => ({ exists: () => store.has(ref), data: () => store.get(ref) }),
      set: (ref, data) => void pending.push([ref, data]),
    });
    for (const [ref, data] of pending) store.set(ref, data);
    return result;
  },
}));

import { deletePrintProject, savePrintProject } from "@/lib/printProjects";

function book(revision = 0): PrintProject {
  return {
    id: "book-1",
    ownerUid: "cook-1",
    kind: "cookbook",
    sections: [{ id: "s1", title: "", items: [] }],
    settings: {} as PrintProject["settings"],
    revision,
    createdAt: 1,
    updatedAt: 1,
  } as PrintProject;
}

beforeEach(() => {
  store.clear();
  changed.mockClear();
});

describe("the project count hears about library changes", () => {
  it("when a project is created", async () => {
    await savePrintProject(book());
    expect(changed).toHaveBeenCalledWith("cook-1");
  });

  it("not when an existing project is saved again", async () => {
    const saved = await savePrintProject(book());
    changed.mockClear();
    await savePrintProject(saved);
    expect(changed).not.toHaveBeenCalled();
  });

  it("when a project is deleted", async () => {
    await savePrintProject(book());
    changed.mockClear();
    await deletePrintProject("cook-1", "book-1", { keepAssets: true });
    expect(changed).toHaveBeenCalledWith("cook-1");
  });
});
