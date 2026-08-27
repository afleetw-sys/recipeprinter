import { describe, expect, it } from "vitest";
import {
  friendlyAuthError,
  friendlyPhotoUploadError,
  friendlyPurchaseSetupError,
  friendlyRecipeLibraryError,
  friendlyShareLinkError,
  placeholderHostMessage,
} from "./friendlyErrors";

describe("user-facing errors", () => {
  it("turns provider codes into an action the user can take", () => {
    expect(friendlyAuthError({ code: "auth/network-request-failed" })).toBe(
      "We couldn't connect. Check your internet connection and try again.",
    );
    expect(friendlyRecipeLibraryError({ code: "firestore/permission-denied" })).toBe(
      "Please sign in again to use your CookPilot recipes.",
    );
    expect(friendlyAuthError({ code: "auth/weak-password" })).toBe(
      "Choose a stronger password with at least 6 characters.",
    );
    expect(friendlyAuthError({ code: "auth/email-already-in-use" })).toBe(
      "An account already uses that email. Go back and sign in instead.",
    );
  });

  it("does not expose raw backend messages for unknown failures", () => {
    const technical = new Error("Firestore REST read failed: 503");
    expect(friendlyShareLinkError(technical)).toBe(
      "We couldn't create that link right now. Please try again.",
    );
    expect(friendlyPurchaseSetupError(new Error("internal stack trace"))).toBe(
      "We couldn't unlock that template. Please try again.",
    );
    expect(friendlyPhotoUploadError(new Error("internal stack trace"))).toBe(
      "We couldn't add that photo. Please try again.",
    );
  });
});

describe("placeholderHostMessage", () => {
  it("answers every reserved documentation domain by name", () => {
    for (const host of ["example.com", "example.org", "example.net", "example.edu"]) {
      expect(placeholderHostMessage(host)).toContain(host);
    }
  });

  it("ignores the www prefix and the casing", () => {
    expect(placeholderHostMessage("WWW.Example.com")).toBe(placeholderHostMessage("example.com"));
  });

  // A real site that merely contains the word must still get the real error.
  it("leaves a genuine host alone", () => {
    expect(placeholderHostMessage("allrecipes.com")).toBeNull();
    expect(placeholderHostMessage("example.com.recipes.io")).toBeNull();
    expect(placeholderHostMessage("myexample.com")).toBeNull();
  });
});
