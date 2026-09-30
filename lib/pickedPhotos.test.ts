import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Photos picked while signed out ──────────────────────────────────────────
//
// They stay in IndexedDB as `blob:` URLs instead of uploading (see
// `putPickedPhoto`). A `blob:` URL dies with the document, so the one thing
// that must never go wrong is bringing a dead one back: a reload or a phone
// sign-in redirect would otherwise leave the cover pointing at nothing.

const store = new Map<string, unknown>();

vi.mock("@/lib/idb", () => ({
  idbStore: () => ({
    put: vi.fn(async (id: string, value: unknown) => {
      store.set(id, value);
      return true;
    }),
    get: vi.fn(async (id: string) => store.get(id)),
    getMany: vi.fn(async (ids: string[]) => {
      const found = new Map<string, unknown>();
      for (const id of ids) if (store.has(id)) found.set(id, store.get(id));
      return found;
    }),
    take: vi.fn(),
    remove: vi.fn(async (id: string) => store.delete(id)),
  }),
}));

const memory = new Map<string, string>();
let minted = 0;

beforeEach(() => {
  vi.resetModules();
  memory.clear();
  minted = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
        removeItem: (key: string) => memory.delete(key),
      },
    },
  });
  globalThis.URL.createObjectURL = vi.fn(() => `blob:http://localhost/made-${(minted += 1)}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

/** A fresh module is a fresh document: no object URL minted before it is alive. */
async function load() {
  return import("@/lib/localPhotos");
}

describe("picked photos", () => {
  it("brings a picked photo back after the document that minted it is gone", async () => {
    const first = await load();
    const url = await first.putPickedPhoto(new Blob(["cover"]));
    expect(url).toMatch(/^blob:/);

    vi.resetModules();
    const second = await load();
    const revived = await second.reviveLocalPhotoUrls([url as string]);

    const next = revived.get(url as string);
    expect(next).toMatch(/^blob:/);
    expect(next).not.toBe(url);
  });

  it("leaves a URL alone while it is still alive", async () => {
    const { putPickedPhoto, reviveLocalPhotoUrls } = await load();
    const url = (await putPickedPhoto(new Blob(["cover"]))) as string;

    expect((await reviveLocalPhotoUrls([url])).size).toBe(0);
  });

  it("does not touch a URL it never recorded", async () => {
    const { reviveLocalPhotoUrls } = await load();

    expect((await reviveLocalPhotoUrls(["blob:http://localhost/someone-else"])).size).toBe(0);
  });

  it("finds and swaps URLs anywhere in a project, and nothing else", async () => {
    const { blobUrlsIn, withRevivedUrls } = await load();
    const meta = {
      cover: { imageUrl: "blob:http://localhost/a", gridImages: ["blob:http://localhost/a", "https://x/y.jpg"] },
      sections: [{ photoUrl: "blob:http://localhost/b" }],
    };

    expect(blobUrlsIn(meta).sort()).toEqual(["blob:http://localhost/a", "blob:http://localhost/b"]);
    expect(
      withRevivedUrls(meta, new Map([["blob:http://localhost/a", "https://storage/a.jpg"]])),
    ).toEqual({
      cover: { imageUrl: "https://storage/a.jpg", gridImages: ["https://storage/a.jpg", "https://x/y.jpg"] },
      sections: [{ photoUrl: "blob:http://localhost/b" }],
    });
  });
});
