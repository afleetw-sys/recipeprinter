import { beforeEach, describe, expect, it, vi } from "vitest";

// ── The batch read, and the part of it that is easy to get wrong ───────────
//
// `localPhotoUrls` exists to turn N database opens into one (see lib/idb's
// `getMany`). What these pin is the behaviour around that: an id already
// holding an object URL must not reach the store at all, and a stored value
// that is not a Blob must read as "gone" rather than reaching
// `URL.createObjectURL`.

const getMany = vi.fn();

vi.mock("@/lib/idb", () => ({
  idbStore: () => ({
    put: vi.fn(),
    get: vi.fn(),
    getMany,
    take: vi.fn(),
    remove: vi.fn(),
  }),
}));

let minted = 0;

beforeEach(() => {
  vi.resetModules();
  getMany.mockReset();
  minted = 0;
  globalThis.URL.createObjectURL = vi.fn(() => `blob:made-${(minted += 1)}`);
  globalThis.URL.revokeObjectURL = vi.fn();
});

/** Fresh module each time, so the object-URL memo starts empty. */
async function load() {
  return import("@/lib/localPhotos");
}

describe("localPhotoUrls", () => {
  it("reads every missing photo in one call to the store", async () => {
    const { localPhotoUrls } = await load();
    getMany.mockResolvedValue(
      new Map<string, unknown>([
        ["a", new Blob(["a"])],
        ["b", new Blob(["b"])],
      ]),
    );

    const urls = await localPhotoUrls(["a", "b"]);

    expect(getMany).toHaveBeenCalledTimes(1);
    expect(getMany).toHaveBeenCalledWith(["a", "b"]);
    expect(urls.size).toBe(2);
  });

  it("leaves out a photo the store does not have", async () => {
    const { localPhotoUrls } = await load();
    getMany.mockResolvedValue(new Map<string, unknown>([["here", new Blob(["x"])]]));

    const urls = await localPhotoUrls(["here", "gone"]);

    expect(urls.has("here")).toBe(true);
    expect(urls.has("gone")).toBe(false);
  });

  it("treats a stored value that is not a Blob as gone", async () => {
    const { localPhotoUrls } = await load();
    // A value left by an older shape. `URL.createObjectURL` would throw on it.
    getMany.mockResolvedValue(new Map<string, unknown>([["old", { base64: "…" }]]));

    const urls = await localPhotoUrls(["old"]);

    expect(urls.size).toBe(0);
    expect(globalThis.URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("never asks the store for an id it already has a URL for", async () => {
    const { localPhotoUrls, rememberLocalPhotoUrl } = await load();
    const known = rememberLocalPhotoUrl("cached", new Blob(["c"]));
    getMany.mockResolvedValue(new Map<string, unknown>([["fresh", new Blob(["f"])]]));

    const urls = await localPhotoUrls(["cached", "fresh"]);

    expect(getMany).toHaveBeenCalledWith(["fresh"]);
    expect(urls.get("cached")).toBe(known);
    expect(urls.get("fresh")).toBeDefined();
  });

  it("does not touch the store when every id is already known", async () => {
    const { localPhotoUrls, rememberLocalPhotoUrl } = await load();
    rememberLocalPhotoUrl("one", new Blob(["1"]));
    rememberLocalPhotoUrl("two", new Blob(["2"]));

    const urls = await localPhotoUrls(["one", "two"]);

    expect(getMany).not.toHaveBeenCalled();
    expect(urls.size).toBe(2);
  });

  it("mints one URL per photo, however often it is asked", async () => {
    const { localPhotoUrls } = await load();
    getMany.mockResolvedValue(new Map<string, unknown>([["a", new Blob(["a"])]]));

    const first = await localPhotoUrls(["a"]);
    const second = await localPhotoUrls(["a"]);

    expect(first.get("a")).toBe(second.get("a"));
    expect(globalThis.URL.createObjectURL).toHaveBeenCalledTimes(1);
  });

  it("is empty, and silent, for no ids at all", async () => {
    const { localPhotoUrls } = await load();
    const urls = await localPhotoUrls([]);
    expect(urls.size).toBe(0);
    expect(getMany).not.toHaveBeenCalled();
  });
});
