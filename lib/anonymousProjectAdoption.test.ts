import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintProject } from "@/types/recipe";

// The adoption module talks to Storage and Firestore. Neither is what these
// tests are about: the question here is purely which *document id* a repeated
// adoption lands on, so the project store is an in-memory map.
const store = vi.hoisted(() => new Map<string, PrintProject>());

vi.mock("firebase/storage", () => ({
  getBlob: vi.fn(),
  getDownloadURL: vi.fn(),
  getMetadata: vi.fn(),
  ref: vi.fn(),
  uploadBytes: vi.fn(),
}));

vi.mock("@/lib/firebase/storage", () => ({ getFirebaseStorage: () => ({}) }));

vi.mock("@/lib/cookbookUnlocks", () => ({
  isCookbookProjectUnlocked: () => false,
  persistCookbookProjectUnlock: async () => undefined,
  transferCookbookProjectUnlockLocal: () => undefined,
}));

vi.mock("@/lib/printProjects", () => ({
  // Defined here rather than reached through `importOriginal` so the class the
  // adoption module throws and the one these tests assert against are the same
  // one — an `instanceof` across two copies is always false.
  PrintProjectConflictError: class PrintProjectConflictError extends Error {
    constructor() {
      super("This project was updated somewhere else.");
      this.name = "PrintProjectConflictError";
    }
  },
  createPrintProjectId: () => "minted-id",
  loadPrintProject: async (uid: string, id: string) => store.get(`${uid}/${id}`) ?? null,
  // Mirrors the real one: the scalars off the parent document, no recipes.
  loadPrintProjectHead: async (uid: string, id: string) => {
    const project = store.get(`${uid}/${id}`);
    return project
      ? { id: project.id, revision: Number(project.revision ?? 0), createdAt: project.createdAt }
      : null;
  },
  savePrintProject: async (project: PrintProject) => {
    const saved = { ...project, revision: Number(project.revision ?? 0) + 1 };
    store.set(`${project.ownerUid}/${project.id}`, saved);
    return saved;
  },
}));

import { adoptAnonymousProject } from "@/lib/anonymousProjectAdoption";
import { PrintProjectConflictError } from "@/lib/printProjects";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  get length() { return this.values.size; }
}

const memory = new MemoryStorage();

function book(id: string, title: string): PrintProject {
  return {
    id,
    kind: "cookbook",
    revision: 0,
    ownerUid: "",
    title,
    sections: [{ id: "s1", title: "Mains", items: [] }],
    settings: {
      cardSize: "4x6",
      template: "classic",
      doubleSided: false,
      showPhoto: true,
      showSourceUrl: false,
      showCutLines: false,
      cookbookMode: true,
    },
    createdAt: 1,
    updatedAt: 1,
  } as unknown as PrintProject;
}

beforeEach(() => {
  store.clear();
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

describe("adopting an anonymous project", () => {
  it("keeps writing to one document when the same book is adopted again", async () => {
    await adoptAnonymousProject("user-1", book("book-a", "Family Favorites"));
    await adoptAnonymousProject("user-1", book("book-a", "Family Favorites"));

    expect(Array.from(store.keys())).toEqual(["user-1/book-a"]);
  });

  it("refuses to replace a saved document it has never written", async () => {
    // Adoption runs when the caller believes the account has no copy of this
    // book. A document sitting here says that belief is wrong — a read reported
    // as a miss, an attach check that could not answer — and adoption replaces
    // the destination wholesale, so acting on it costs someone the saved book.
    store.set("user-1/book-a", { ...book("book-a", "Family Favorites"), ownerUid: "user-1", revision: 4 });

    await expect(
      adoptAnonymousProject("user-1", book("book-a", "Family Favorites — edited")),
    ).rejects.toBeInstanceOf(PrintProjectConflictError);

    expect(store.get("user-1/book-a")?.title).toBe("Family Favorites");
    expect(store.get("user-1/book-a")?.revision).toBe(4);
  });

  it("replaces it once the cook has answered the conflict", async () => {
    store.set("user-1/book-a", { ...book("book-a", "Family Favorites"), ownerUid: "user-1", revision: 4 });

    const saved = await adoptAnonymousProject(
      "user-1",
      book("book-a", "Family Favorites — edited"),
      { overwriteExisting: true },
    );

    expect(saved.id).toBe("book-a");
    expect(saved.revision).toBe(5);
    expect(store.size).toBe(1);
    expect(store.get("user-1/book-a")?.title).toBe("Family Favorites — edited");
  });

  it("does not let a refusal become the claim that permits the next attempt", async () => {
    store.set("user-1/book-a", { ...book("book-a", "Family Favorites"), ownerUid: "user-1", revision: 4 });
    // The refused attempt writes a manifest of its own. If that counted as
    // "we have written here before", one retry would launder itself past the
    // guard and the refusal would be worth nothing.
    await expect(
      adoptAnonymousProject("user-1", book("book-a", "One")),
    ).rejects.toBeInstanceOf(PrintProjectConflictError);
    await expect(
      adoptAnonymousProject("user-1", book("book-a", "Two")),
    ).rejects.toBeInstanceOf(PrintProjectConflictError);

    expect(store.get("user-1/book-a")?.title).toBe("Family Favorites");
  });

  it("resumes into the document a previous adoption redirected to", async () => {
    window.localStorage.setItem(
      "recipeprinter:anonymous-adoption:v1",
      JSON.stringify({
        sourceProjectId: "book-a",
        destinationProjectId: "book-a-copy",
        uid: "user-1",
        assets: {},
        status: "saving",
      }),
    );

    const saved = await adoptAnonymousProject("user-1", book("book-a", "Family Favorites"));

    expect(saved.id).toBe("book-a-copy");
    expect(Array.from(store.keys())).toEqual(["user-1/book-a-copy"]);
  });
});
