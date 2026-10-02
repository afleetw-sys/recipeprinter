import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintProject, QueueItem, Section } from "@/types/recipe";

/* A save that landed must never be reported as somebody else's.

   `savePrintProject` refuses to write over a revision it did not expect, so a
   second tab cannot silently overwrite the first. But the revision can also
   move because of THIS tab's own write, and that was being refused too:

   - A commit reaches the server and its reply is lost. Firestore retries the
     transaction, the retry reads the revision the first attempt just wrote,
     and the save reported "Newer version found" about itself. Reproduced in
     the browser by dropping one commit's reply (2026-10-02).
   - A write that is given up on (SAVE_TIMEOUT_MS) lands anyway, after the page
     stopped listening, so the page never learns the revision it made. The next
     save from this tab then conflicts with its own landed write.

   Firestore here is an in-memory map, and a transaction re-runs its body when a
   reply is "lost", which is what the real SDK does on a retryable error. */

const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const writes = vi.hoisted(() => [] as string[]);
const network = vi.hoisted(() => ({
  loseNextReply: false,
  /** The next commit is refused (contention), and this runs before the retry. */
  refuseNextCommit: null as null | (() => Promise<void>),
}));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join("/"),
  runTransaction: async (
    _db: unknown,
    body: (transaction: {
      get: (ref: string) => Promise<{ exists: () => boolean; data: () => unknown }>;
      set: (ref: string, data: Record<string, unknown>) => void;
    }) => Promise<unknown>,
  ) => {
    const attempt = async () => {
      const pending: Array<[string, Record<string, unknown>]> = [];
      const result = await body({
        get: async (ref: string) => ({ exists: () => store.has(ref), data: () => store.get(ref) }),
        set: (ref, data) => void pending.push([ref, data]),
      });
      if (network.refuseNextCommit) {
        const between = network.refuseNextCommit;
        network.refuseNextCommit = null;
        await between();
        return attempt();
      }
      for (const [ref, data] of pending) {
        writes.push(ref);
        store.set(ref, data);
      }
      return result;
    };
    const result = await attempt();
    if (!network.loseNextReply) return result;
    // The commit landed; the client never heard. The SDK runs the body again.
    network.loseNextReply = false;
    return attempt();
  },
}));

vi.mock("@/lib/firebase/db", () => ({ getDb: () => ({}) }));

import { PrintProjectConflictError, savePrintProject } from "@/lib/printProjects";

const PARENT = "products/recipePrinter/users/user-1/printProjects/cards-1";

function item(id: string, cookTime: string): QueueItem {
  return {
    id,
    method: "url",
    status: "ready",
    title: `Recipe ${id}`,
    recipe: { title: `Recipe ${id}`, cookTime, ingredients: [{ raw: "1 egg" }], instructions: [{ text: "Cook." }] },
  } as unknown as QueueItem;
}

function cards(revision: number, cookTime = "25 min"): PrintProject {
  const sections: Section[] = [{ id: "s1", title: "", items: [item("r1", cookTime), item("r2", cookTime)] }];
  return {
    id: "cards-1",
    kind: "printProject",
    revision,
    ownerUid: "user-1",
    title: "Weeknight",
    sections,
    settings: { doubleSided: false } as unknown as PrintProject["settings"],
    createdAt: 1,
    updatedAt: 1,
  } as PrintProject;
}

const storedRevision = () => Number(store.get(PARENT)?.revision);

beforeEach(() => {
  store.clear();
  writes.length = 0;
  network.loseNextReply = false;
  network.refuseNextCommit = null;
});

describe("a save recognises its own landed writes", () => {
  it("treats a commit whose reply was lost as saved, not as a conflict", async () => {
    await savePrintProject(cards(0));
    writes.length = 0;

    network.loseNextReply = true;
    const saved = await savePrintProject(cards(1, "30 min"));

    expect(saved.revision).toBe(2);
    expect(storedRevision()).toBe(2);
    // The retry found the write already there and did not make another.
    expect(writes.filter((ref) => ref === PARENT)).toHaveLength(1);
  });

  it("does the same for the first save of a project", async () => {
    network.loseNextReply = true;
    const saved = await savePrintProject(cards(0));
    expect(saved.revision).toBe(1);
    expect(storedRevision()).toBe(1);
  });

  it("writes over this tab's own earlier write that it never heard back from", async () => {
    await savePrintProject(cards(0));
    // A write the page gave up on lands at revision 2, but the page still
    // believes the document is at revision 1.
    network.loseNextReply = true;
    await savePrintProject(cards(1, "30 min"));

    const saved = await savePrintProject(cards(1, "35 min"));

    expect(saved.revision).toBe(3);
    expect(storedRevision()).toBe(3);
    expect(JSON.stringify(store.get(`${PARENT}/content/main`))).toContain("35 min");
  });

  it("never lets an older write of this tab overwrite a newer one", async () => {
    await savePrintProject(cards(0));
    // The older save is refused once; while it waits to retry, a newer save
    // from this same tab lands.
    network.refuseNextCommit = () => savePrintProject(cards(1, "35 min")).then(() => undefined);

    await expect(savePrintProject(cards(1, "30 min"))).rejects.toBeInstanceOf(PrintProjectConflictError);
    expect(JSON.stringify(store.get(`${PARENT}/content/main`))).toContain("35 min");
  });

  it("still refuses a revision another tab wrote", async () => {
    await savePrintProject(cards(0));
    // Another tab's save: a different writer, so not one of ours.
    store.set(PARENT, { ...store.get(PARENT), revision: 2, saveId: "another-tab" });

    await expect(savePrintProject(cards(1, "30 min"))).rejects.toBeInstanceOf(PrintProjectConflictError);
    expect(storedRevision()).toBe(2);
  });

  it("still refuses a document this tab never wrote", async () => {
    store.set(PARENT, { id: "cards-1", ownerUid: "user-1", revision: 4 });
    await expect(savePrintProject(cards(1))).rejects.toBeInstanceOf(PrintProjectConflictError);
  });
});
