import { beforeEach, describe, expect, it } from "vitest";
import { copyProjectAssets, readAdoptionManifest, type AdoptionManifest } from "@/lib/anonymousProjectAdoption";

/* The photo-copying half of adoption.
   lib/anonymousProjectAdoption.test.ts covers which DOCUMENT a repeated
   adoption lands on; this covers what happens to the photos on the way there,
   which is where the time goes.

   Every copy is a round trip in each direction — the bytes come down out of the
   anonymous folder and go back up under the account — so what is worth
   asserting is that they overlap, that they overlap by a bounded amount, and
   that a failure part-way through still leaves the copies that did land
   recorded in the manifest. That last one is what makes a retry a resume
   instead of an identical repeat.

   The copier is injected (see `copyProjectAssets`), so none of this needs
   Firebase — which is just as well, since the real one is reached through a
   dynamic `import` that a module mock cannot intercept. */

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

beforeEach(() => {
  memory.clear();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage: memory },
  });
});

function photo(n: number): string {
  return `https://storage.example/recipeprinter/photos/anonymous/owner-1/p${n}.jpg`;
}

function photos(count: number): string[] {
  return Array.from({ length: count }, (_, i) => photo(i));
}

function manifest(assets: Record<string, string> = {}): AdoptionManifest {
  return {
    sourceProjectId: "book-a",
    destinationProjectId: "book-a",
    uid: "user-1",
    assets,
    status: "copying",
  };
}

/** Yields to the macrotask queue, so copies in one batch genuinely overlap
    rather than merely interleaving microtasks. */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 1));
}

interface Copier {
  copy: (sourceUrl: string, existingDestination?: string) => Promise<string>;
  /** Source urls whose bytes were actually sent, in completion order. */
  sent: string[];
  /** Source urls the copier was asked about at all, resumes included. */
  asked: string[];
  /** What each call was told about a previous run's destination. */
  toldExisting: Array<string | undefined>;
  maxInFlight: number;
}

/** A copier that takes real time, counts overlap, and fails whatever it is told to. */
function copier(options: { failing?: string[] } = {}): Copier {
  const failing = new Set(options.failing ?? []);
  const state = { sent: [] as string[], asked: [] as string[], toldExisting: [] as Array<string | undefined>, maxInFlight: 0 };
  let inFlight = 0;

  return {
    ...state,
    get sent() { return state.sent; },
    get asked() { return state.asked; },
    get toldExisting() { return state.toldExisting; },
    get maxInFlight() { return state.maxInFlight; },
    copy: async (sourceUrl: string, existingDestination?: string) => {
      state.asked.push(sourceUrl);
      state.toldExisting.push(existingDestination);
      inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, inFlight);
      try {
        await tick();
        if (failing.has(sourceUrl)) throw new Error(`could not read ${sourceUrl}`);
        state.sent.push(sourceUrl);
        return `https://storage.example/adopted/book-a/${sourceUrl.slice(-6)}`;
      } finally {
        inFlight -= 1;
      }
    },
  } as Copier;
}

describe("copying a project's photos into the account", () => {
  it("copies photos concurrently rather than one at a time", async () => {
    const run = copier();
    await copyProjectAssets(photos(12), manifest(), run.copy);

    expect(run.sent).toHaveLength(12);
    // The regression this guards: a strictly serial loop never exceeds one.
    expect(run.maxInFlight).toBeGreaterThan(1);
  });

  it("keeps the number of photos in flight bounded", async () => {
    const run = copier();
    await copyProjectAssets(photos(40), manifest(), run.copy);

    expect(run.sent).toHaveLength(40);
    // Each copy in flight holds a whole photo and they all share one
    // connection, so this is capped rather than unleashed.
    expect(run.maxInFlight).toBeLessThanOrEqual(5);
  });

  it("returns a manifest naming every photo's copy", async () => {
    const run = copier();
    const result = await copyProjectAssets(photos(7), manifest(), run.copy);

    expect(Object.keys(result.assets)).toHaveLength(7);
    // Each photo gets its own destination — two sharing one would silently put
    // the same picture on two recipes.
    expect(new Set(Object.values(result.assets)).size).toBe(7);
  });

  it("copies nothing, and writes nothing, for a book with no photos", async () => {
    const run = copier();
    const result = await copyProjectAssets([], manifest(), run.copy);

    expect(run.asked).toEqual([]);
    expect(result.assets).toEqual({});
    expect(readAdoptionManifest()).toBeNull();
  });

  it("records the copies that landed when one in the same batch fails", async () => {
    const run = copier({ failing: [photo(2)] });

    await expect(copyProjectAssets(photos(4), manifest(), run.copy)).rejects.toThrow(/could not read/);

    const persisted = readAdoptionManifest();
    expect(persisted?.assets && Object.keys(persisted.assets)).toHaveLength(3);
    expect(persisted?.assets[photo(2)]).toBeUndefined();
  });

  it("stops at the batch that failed rather than working through the rest", async () => {
    const run = copier({ failing: [photo(1)] });

    await expect(copyProjectAssets(photos(20), manifest(), run.copy)).rejects.toThrow();

    // The first batch is attempted in full — those copies are already in
    // flight — but nothing after it is started.
    expect(run.asked).toHaveLength(5);
  });

  it("hands a previous run's destination back so a resume can skip the bytes", async () => {
    const alreadyCopied = { [photo(0)]: "https://storage.example/adopted/book-a/p0.jpg" };
    const run = copier();

    const result = await copyProjectAssets(photos(3), manifest(alreadyCopied), run.copy);

    expect(run.toldExisting[0]).toBe(alreadyCopied[photo(0)]);
    expect(run.toldExisting.slice(1)).toEqual([undefined, undefined]);
    // And the earlier entry survives into the result rather than being dropped.
    expect(Object.keys(result.assets)).toHaveLength(3);
  });

  it("persists progress as it goes, not only at the end", async () => {
    const run = copier({ failing: [photo(12)] });

    // Photo 12 is in the third batch of five, so the first two are long
    // finished by the time it throws — and were the manifest only written at
    // the end, none of that work would have survived to be resumed.
    await expect(copyProjectAssets(photos(20), manifest(), run.copy)).rejects.toThrow();

    const stored = Object.keys(readAdoptionManifest()?.assets ?? {});
    // Two completed batches, plus the four survivors of the third.
    expect(stored).toHaveLength(14);
    expect(stored).toContain(photo(0));
    expect(stored).toContain(photo(9));
    expect(stored).not.toContain(photo(12));
    // And nothing from the fourth batch, which was never started.
    expect(stored).not.toContain(photo(15));
  });
});
