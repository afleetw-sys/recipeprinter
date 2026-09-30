import { beforeEach, describe, expect, it, vi } from "vitest";

// Only an account ever stores a photo. A signed-out cook, or an anonymous
// Firebase session, keeps picked photos in the browser; even where the browser
// cannot hold them, they live for the visit rather than being uploaded.

const uploadBytes = vi.fn(async () => undefined);
let currentUser: { uid: string; isAnonymous: boolean } | null = null;
let localStoreWorks = true;

vi.mock("firebase/storage", () => ({
  ref: () => ({}),
  uploadBytes,
  getDownloadURL: async () => "https://storage.example/photo.jpg",
}));
vi.mock("@/lib/firebase/storage", () => ({ getFirebaseStorage: () => ({}) }));
vi.mock("@/lib/firebase/client", () => ({
  firebaseConfigured: () => true,
  getFirebaseAuth: () => ({ currentUser }),
}));
vi.mock("@/lib/coverPhoto", () => ({
  fileToCoverBlob: async () => new Blob(["photo"], { type: "image/jpeg" }),
  normalizePhotoBlob: async (blob: Blob) => blob,
}));
vi.mock("@/lib/localPhotos", () => ({
  putPickedPhoto: async () => (localStoreWorks ? "blob:http://localhost/kept" : null),
}));

beforeEach(() => {
  uploadBytes.mockClear();
  currentUser = null;
  localStoreWorks = true;
  globalThis.URL.createObjectURL = vi.fn(() => "blob:http://localhost/this-visit");
});

const file = () => new File(["photo"], "photo.jpg", { type: "image/jpeg" });

describe("photos picked without an account", () => {
  it("stay in the browser when signed out", async () => {
    const { storePickedPhotoFile } = await import("@/lib/photoStorage");
    expect(await storePickedPhotoFile(file())).toBe("blob:http://localhost/kept");
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it("stay in the browser for an anonymous session too", async () => {
    currentUser = { uid: "anon-1", isAnonymous: true };
    const { storePickedPhotoFile } = await import("@/lib/photoStorage");
    await storePickedPhotoFile(file());
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it("live for this visit rather than uploading when the browser cannot hold them", async () => {
    localStoreWorks = false;
    const { storePickedPhotoFile } = await import("@/lib/photoStorage");
    expect(await storePickedPhotoFile(file())).toBe("blob:http://localhost/this-visit");
    expect(uploadBytes).not.toHaveBeenCalled();
  });

  it("upload once there is an account", async () => {
    currentUser = { uid: "u1", isAnonymous: false };
    const { storePickedPhotoFile } = await import("@/lib/photoStorage");
    expect(await storePickedPhotoFile(file())).toBe("https://storage.example/photo.jpg");
    expect(uploadBytes).toHaveBeenCalledTimes(1);
  });
});
