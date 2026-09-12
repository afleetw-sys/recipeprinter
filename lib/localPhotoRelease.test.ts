import { beforeEach, describe, expect, it, vi } from "vitest";
import { __releaseLocalPhotosForTest as releaseLocalPhotos } from "@/lib/queue";
import { saveLocalProject } from "@/lib/localProjects";
import type { PrintProject, QueueItem } from "@/types/recipe";

/* Who owns a locally-held photo.
 *
 * The bytes live in IndexedDB under a `localPhotoId`, and TWO things point at
 * them: the live queue, and any project filed on the device shelf. Leaving the
 * workspace files the project and then clears the queue, back to back — so a
 * clear that deleted on its own authority destroyed the photos of the book it
 * had just filed, and there is no second copy anywhere to recover them from.
 *
 * These assert the ownership rule rather than the call order, because the order
 * is what changes: the shelf write and the clear have already been separated by
 * a save once, and the next thing to move between them must not be able to
 * reintroduce this. */

/* `vi.hoisted` because the mock factory is hoisted above the imports and would
   otherwise reach `deleted` in its temporal dead zone. */
const { deleted } = vi.hoisted(() => ({ deleted: [] as string[] }));

vi.mock("@/lib/localPhotos", () => ({
  deleteLocalPhoto: async (id: string) => {
    deleted.push(id);
  },
  isBlobUrl: (value: unknown) => typeof value === "string" && value.startsWith("blob:"),
  localPhotoUrls: async () => new Map<string, string>(),
}));

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

/** A Paprika-style recipe: the photo is an object URL, the id is the real
    reference. */
function item(id: string, localPhotoId?: string): QueueItem {
  return {
    id,
    method: "paprika",
    source: "Paprika",
    status: "ready",
    title: id,
    recipe: { title: id, image: localPhotoId ? `blob:${localPhotoId}` : undefined },
    localPhotoId,
    addedAt: 1,
  } as unknown as QueueItem;
}

function shelve(projectId: string, items: QueueItem[]): void {
  saveLocalProject({
    id: projectId,
    kind: "cookbook",
    revision: 0,
    ownerUid: "",
    title: projectId,
    sections: [{ id: "s1", items }],
    settings: {} as PrintProject["settings"],
    createdAt: 1,
    updatedAt: 1,
  } as unknown as PrintProject);
}

beforeEach(() => {
  deleted.length = 0;
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory, sessionStorage: new MemoryStorage() },
  });
});

describe("releasing a departing recipe's local photo", () => {
  it("keeps a photo the device shelf is still holding", () => {
    const recipe = item("r1", "photo-1");
    shelve("book-a", [recipe]);
    // What leaving the workspace does: file, then clear.
    releaseLocalPhotos([recipe], []);
    expect(deleted).toEqual([]);
  });

  it("deletes a photo nothing points at any more", () => {
    releaseLocalPhotos([item("r1", "photo-1")], []);
    expect(deleted).toEqual(["photo-1"]);
  });

  it("keeps a photo a second queued recipe still shares", () => {
    const going = item("r1", "photo-1");
    const staying = item("r2", "photo-1");
    releaseLocalPhotos([going], [staying]);
    expect(deleted).toEqual([]);
  });

  it("releases only the photos that are actually leaving", () => {
    shelve("book-a", [item("r1", "shelved")]);
    releaseLocalPhotos(
      [item("r1", "shelved"), item("r2", "orphan"), item("r3")],
      [],
    );
    expect(deleted).toEqual(["orphan"]);
  });

  it("asks the shelf as it is now, not as it was at import time", () => {
    const recipe = item("r1", "photo-1");
    // Nothing filed yet: this photo would go.
    releaseLocalPhotos([recipe], []);
    expect(deleted).toEqual(["photo-1"]);
    deleted.length = 0;
    // Filed since — a second pass (a re-clear, a retried exit) must not repeat
    // the delete against a shelf that now depends on it.
    shelve("book-a", [recipe]);
    releaseLocalPhotos([recipe], []);
    expect(deleted).toEqual([]);
  });
});
