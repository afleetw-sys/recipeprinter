// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureFailedImportImages } from "@/lib/failedImportCapture";

const uploadBytes = vi.fn();
const track = vi.fn();
vi.mock("firebase/storage", () => ({ ref: (_s: unknown, path: string) => path, uploadBytes: (...a: unknown[]) => uploadBytes(...a) }));
vi.mock("@/lib/firebase/storage", () => ({ getFirebaseStorage: () => ({}) }));
vi.mock("@/lib/firebase/client", () => ({
  firebaseConfigured: () => true,
  getFirebaseAuth: () => ({ currentUser: null }),
}));
vi.mock("@/lib/analytics", () => ({ track: (...a: unknown[]) => track(...a) }));

beforeEach(() => {
  uploadBytes.mockReset();
  track.mockReset();
});

describe("a failed photo import keeps its photos", () => {
  // Reported 2026-10-15: an iPhone photo failed to import (decode_failed) and
  // its `debugInbox` row said there were no photos. Photos were dropped for
  // whole failure buckets, capped at 6 a day per browser, and the row gave up
  // on the path after 15 s while a phone upload was still going.
  it("uploads every one, with no category skipped, no daily cap and no cutoff", async () => {
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" });
    // An upload that never finishes: the path must not depend on it.
    uploadBytes.mockReturnValue(new Promise(() => {}));
    const categories = [
      "no_recipe", "decode_failed", "too_large", "unknown",
      "backend_unavailable", "network", "timeout", "rate_limited",
    ];
    // Twice round, so well past any per-day cap.
    for (const category of [...categories, ...categories]) {
      const path = captureFailedImportImages([photo], { source: "image", category, reason: "x" });
      expect(path, category).toMatch(new RegExp(`/${category}/`));
    }
    await vi.waitFor(() => expect(uploadBytes).toHaveBeenCalledTimes(categories.length * 2));

    // A refused upload (App Check, rules) is reported rather than silent.
    uploadBytes.mockReset().mockRejectedValue(Object.assign(new Error("denied"), { code: "storage/unauthorized" }));
    captureFailedImportImages([photo], { source: "image", category: "decode_failed", reason: "x" });
    await vi.waitFor(() =>
      expect(track).toHaveBeenCalledWith("failed_import_capture_failed", expect.objectContaining({ errorCode: "storage/unauthorized" })),
    );

    // Nothing uploadable (an empty placeholder file): no path to an empty folder.
    expect(captureFailedImportImages([new Blob([])], { source: "image", category: "decode_failed", reason: "x" })).toBeNull();
  });
});
