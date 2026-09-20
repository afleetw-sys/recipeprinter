import { describe, expect, it } from "vitest";
import {
  authFailureCode,
  friendlyAuthError,
  friendlyPhotoUploadError,
  friendlyPurchaseSetupError,
  friendlyRecipeLibraryError,
  isPlaceholderHost,
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
      "That email already has an account. Enter its password to sign in.",
    );
  });

  it("does not expose raw backend messages for unknown failures", () => {
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

  it("answers a loopback or reserved-TLD host too", () => {
    for (const host of ["localhost", "127.0.0.1", "recipes.test", "staging.localhost"]) {
      expect(placeholderHostMessage(host)).toContain(host);
    }
  });
});

// The gate on writing a failure into `debugInbox`. A host that is reserved by
// definition never reaches the inbox, so a probe cannot be filed as a bug.
describe("isPlaceholderHost", () => {
  it("catches the documentation domains and everything loopback", () => {
    for (const host of ["example.com", "example.org", "example.net", "example.edu"]) {
      expect(isPlaceholderHost(host)).toBe(true);
    }
    for (const host of ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]) {
      expect(isPlaceholderHost(host)).toBe(true);
    }
  });

  // RFC 6761 reserves these at the top level, so the whole tree under them goes.
  it("catches the whole tree under a reserved TLD", () => {
    for (const host of ["recipes.test", "anything.invalid", "app.localhost", "foo.example"]) {
      expect(isPlaceholderHost(host)).toBe(true);
    }
  });

  it("lets a real recipe site through", () => {
    for (const host of ["allrecipes.com", "myexample.com", "example.com.recipes.io", "test.co.uk"]) {
      expect(isPlaceholderHost(host)).toBe(false);
    }
  });

  it("ignores the www prefix, the casing and stray whitespace", () => {
    expect(isPlaceholderHost("  WWW.Example.COM ")).toBe(true);
    expect(isPlaceholderHost("")).toBe(false);
  });
});

describe("sign-in errors that used to fall through to the generic line", () => {
  const say = (code: string) => friendlyAuthError({ code }, "FALLBACK");

  it("explains an email that already signs in another way", () => {
    expect(say("auth/account-exists-with-different-credential")).toMatch(/signs in a different way/);
  });

  it("names a browser that is blocking sign-in and says what fixes it", () => {
    expect(say("auth/web-storage-unsupported")).toMatch(/Safari or Chrome/);
    expect(say("auth/operation-not-supported-in-this-environment")).toMatch(/Safari or Chrome/);
  });

  it("does not blame the person when the fault is ours", () => {
    for (const code of ["auth/operation-not-allowed", "auth/unauthorized-domain", "auth/internal-error"]) {
      expect(say(code)).toMatch(/isn't available right now/);
    }
  });

  it("handles a malformed address, a disabled account, and a stale session", () => {
    expect(say("auth/invalid-email")).toMatch(/Check the email address/);
    expect(say("auth/user-disabled")).toMatch(/turned off/);
    expect(say("auth/requires-recent-login")).toMatch(/sign in again/);
  });

  it("still falls back for a code it does not know", () => {
    expect(say("auth/something-new")).toBe("FALLBACK");
  });

  it("keeps the copy rules: no em dashes anywhere in these messages", () => {
    const codes = [
      "auth/account-exists-with-different-credential", "auth/web-storage-unsupported",
      "auth/operation-not-allowed", "auth/invalid-email", "auth/user-disabled", "auth/requires-recent-login",
    ];
    for (const code of codes) expect(say(code)).not.toContain("\u2014");
  });
});

describe("authFailureCode", () => {
  it("passes a Firebase code through", () => {
    expect(authFailureCode({ code: "auth/invalid-credential" })).toBe("auth/invalid-credential");
    expect(authFailureCode({ code: "functions/unavailable" })).toBe("functions/unavailable");
  });

  it("never passes a message or an address through", () => {
    expect(authFailureCode(new Error("nope for lacey@example.com"))).toBe("unknown");
    expect(authFailureCode({ code: "lacey@example.com" })).toBe("unknown");
    expect(authFailureCode(null)).toBe("unknown");
  });
});
