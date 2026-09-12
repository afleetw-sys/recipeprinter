import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintProject, QueueItem, Section } from "@/types/recipe";

/* The content document is the expensive half of a save — every recipe in the
   book — and `savePrintProject` now skips writing it when this tab already put
   that exact content there at the revision the document still carries.

   These tests are about which documents a save TOUCHES, so Firestore is an
   in-memory map and a transaction is a function call. What matters is the
   recorded write list, not what a real Firestore would do with it. The skip is
   the one piece of this module with no UI in front of it and a whole book to
   lose if it is wrong: a wrongly-skipped write leaves a parent claiming edits
   whose recipes were never stored. */

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const writes = vi.hoisted(() => [] as string[]);

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
  runTransaction: async (
    _db: unknown,
    body: (transaction: {
      get: (ref: string) => Promise<{ exists: () => boolean; data: () => unknown }>;
      set: (ref: string, data: Record<string, unknown>) => void;
    }) => Promise<unknown>,
  ) =>
    body({
      get: async (ref: string) => ({
        exists: () => store.has(ref),
        data: () => store.get(ref),
      }),
      set: (ref: string, data: Record<string, unknown>) => {
        writes.push(ref);
        store.set(ref, data);
      },
    }),
  deleteDoc: async (ref: string) => {
    store.delete(ref);
  },
}));

vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));

vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => path,
  listAll: async () => ({ items: [], prefixes: [] }),
  deleteObject: async () => undefined,
}));

vi.mock("@/lib/firebase/storage", () => ({ getFirebaseStorage: () => ({}) }));

import { deletePrintProject, savePrintProject } from "@/lib/printProjects";

const PARENT = "products/recipePrinter/users/user-1/printProjects/book-1";
const CONTENT = `${PARENT}/content/main`;

function item(id: string, instruction: string): QueueItem {
  return {
    id,
    method: "url",
    status: "ready",
    title: `Recipe ${id}`,
    recipe: {
      title: `Recipe ${id}`,
      ingredients: [{ raw: "2 cups flour" }],
      instructions: [{ text: instruction }],
    },
  } as unknown as QueueItem;
}

function book(overrides: Partial<PrintProject> = {}): PrintProject {
  const sections: Section[] = [{ id: "s1", title: "Mains", items: [item("r1", "Mix it.")] }];
  return {
    id: "book-1",
    kind: "cookbook",
    revision: 0,
    ownerUid: "user-1",
    title: "Family Favorites",
    sections,
    settings: { doubleSided: false } as unknown as PrintProject["settings"],
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  } as PrintProject;
}

/** The writes made by one save, with the bookkeeping reset around it. */
async function saveAndRecord(project: PrintProject): Promise<{ saved: PrintProject; touched: string[] }> {
  writes.length = 0;
  const saved = await savePrintProject(project);
  return { saved, touched: [...writes] };
}

describe("savePrintProject content writes", () => {
  beforeEach(() => {
    store.clear();
    writes.length = 0;
  });

  it("writes both documents the first time a project is saved", async () => {
    const { touched } = await saveAndRecord(book());
    expect(touched).toEqual([PARENT, CONTENT]);
  });

  it("skips the content document when only a setting changed", async () => {
    const first = await saveAndRecord(book());
    // A duplex toggle: a parent-only change, and the case this exists for.
    const { touched } = await saveAndRecord({
      ...book({ revision: first.saved.revision }),
      settings: { doubleSided: true } as unknown as PrintProject["settings"],
    });
    expect(touched).toEqual([PARENT]);
    // And the recipes are still there, from the first save.
    expect(JSON.stringify(store.get(CONTENT))).toContain("Mix it.");
  });

  it("writes the content document when a recipe changed", async () => {
    const first = await saveAndRecord(book());
    const edited = book({ revision: first.saved.revision });
    edited.sections = [{ id: "s1", title: "Mains", items: [item("r1", "Fold it gently.")] }];
    const { touched } = await saveAndRecord(edited);
    expect(touched).toEqual([PARENT, CONTENT]);
    expect(JSON.stringify(store.get(CONTENT))).toContain("Fold it gently.");
  });

  it("writes the content document when something else wrote the project in between", async () => {
    // The conflict-overwrite path: another tab saved, so the revision moved and
    // the stored content is now THEIRS. Our content may be byte-identical to
    // what we last wrote and still be the wrong thing to skip.
    await saveAndRecord(book());
    store.set(PARENT, { ...store.get(PARENT), revision: 9 });
    store.set(CONTENT, { sections: [{ id: "s1", title: "Mains", items: [] }] });

    // `resolveConflictByOverwriting` re-reads the remote revision and saves on
    // top of it, with the same content this tab had before.
    const { touched } = await saveAndRecord(book({ revision: 9 }));
    expect(touched).toEqual([PARENT, CONTENT]);
    expect(JSON.stringify(store.get(CONTENT))).toContain("Mix it.");
  });

  it("raises a conflict rather than skipping when the revision is unexpected", async () => {
    const first = await saveAndRecord(book());
    store.set(PARENT, { ...store.get(PARENT), revision: 9 });
    await expect(savePrintProject(book({ revision: first.saved.revision }))).rejects.toThrow(
      /updated somewhere else/i,
    );
  });

  it("writes the content document again after the project is deleted", async () => {
    const first = await saveAndRecord(book());
    await deletePrintProject("user-1", "book-1");
    // Re-saving at the same id — nothing is stored any more, so the skip must
    // not fire on what this tab remembers writing.
    const { touched } = await saveAndRecord(book({ revision: 0 }));
    expect(touched).toEqual([PARENT, CONTENT]);
    expect(first.saved.revision).toBe(1);
  });

  it("keeps bumping the revision across skipped content writes", async () => {
    const first = await saveAndRecord(book());
    const second = await saveAndRecord(book({ revision: first.saved.revision }));
    const third = await saveAndRecord(book({ revision: second.saved.revision }));
    expect([first.saved.revision, second.saved.revision, third.saved.revision]).toEqual([1, 2, 3]);
    // Only the first save stored recipes; the other two had nothing new to say.
    expect(second.touched).toEqual([PARENT]);
    expect(third.touched).toEqual([PARENT]);
  });
});
