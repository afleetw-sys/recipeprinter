import { describe, expect, it } from "vitest";
import { isPhotoOpenClick, photoDialogKey } from "./photoOpenGesture";

const photo = { id: "chapter-photo" };
const otherPhoto = { id: "another-chapter-photo" };
const at = (x: number, y: number, surface: unknown) => ({ x, y, surface });

describe("isPhotoOpenClick", () => {
  it("opens on a still click that pressed the same photo", () => {
    expect(
      isPhotoOpenClick({ press: { x: 100, y: 100, surface: photo }, click: at(101, 100, photo), slop: 4 }),
    ).toBe(true);
  });

  it("does NOT open when the page scrolled under the cursor with no press", () => {
    // The reported bug: scrolling brings a chapter photo under a stationary
    // pointer, so client coordinates match perfectly and nothing moved.
    expect(isPhotoOpenClick({ press: null, click: at(100, 100, photo), slop: 4 })).toBe(false);
  });

  it("does NOT open when the press landed on a different photo", () => {
    expect(
      isPhotoOpenClick({ press: { x: 100, y: 100, surface: otherPhoto }, click: at(100, 100, photo), slop: 4 }),
    ).toBe(false);
  });

  it("does NOT open when the press was not on a photo at all", () => {
    expect(
      isPhotoOpenClick({ press: { x: 100, y: 100, surface: null }, click: at(100, 100, photo), slop: 4 }),
    ).toBe(false);
  });

  it("still treats a drag as repositioning, not opening", () => {
    expect(
      isPhotoOpenClick({ press: { x: 100, y: 100, surface: photo }, click: at(140, 100, photo), slop: 4 }),
    ).toBe(false);
  });

  it("allows the slop exactly, so a steady hand is not punished", () => {
    expect(
      isPhotoOpenClick({ press: { x: 100, y: 100, surface: photo }, click: at(104, 100, photo), slop: 4 }),
    ).toBe(true);
  });

  it("ignores a click that is not on a photo surface", () => {
    expect(
      isPhotoOpenClick({ press: { x: 100, y: 100, surface: photo }, click: at(100, 100, null), slop: 4 }),
    ).toBe(false);
  });
});

describe("photoDialogKey", () => {
  it("opens the picker each page's own toolbar listens on", () => {
    const side = () => "front";
    // Each kind of page with a clickable photo, and the key its toolbar
    // picker opens on (see `photoDialogSignal` in app/print/page.tsx). A
    // chapter's opener photo and its facing image page each have their own
    // picker; keying them by the bare chapter id opened neither.
    expect(photoDialogKey({ kind: "recipe", recipeId: "r1" }, side)).toBe("r1");
    expect(photoDialogKey({ kind: "image", recipeId: "r1" }, side)).toBe("r1");
    expect(photoDialogKey({ kind: "cover", recipeId: "cover-front" }, side)).toBe("cover:front");
    expect(photoDialogKey({ kind: "divider", recipeId: "s1" }, side)).toBe("card:s1");
    expect(photoDialogKey({ kind: "section-photo", recipeId: "s1" }, side)).toBe("art:s1");
  });
});
