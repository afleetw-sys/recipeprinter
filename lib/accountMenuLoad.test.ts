import { describe, expect, it } from "vitest";
import { accountMenuLoadAtMount } from "./accountMenuLoad";

describe("accountMenuLoadAtMount", () => {
  // A phone signs in to Google/Apple by redirect, so the page that comes back is
  // a fresh load. On the homepage and the SEO pages nothing but the header's
  // menu loads Firebase, and a first-time visitor's header waited for a press:
  // the redirect result was never read and they came back still signed out.
  // Any load with auth work already waiting must fetch the menu by itself,
  // whatever else is true about the browser.
  it("loads the menu without a press whenever auth work is waiting on this load", () => {
    for (const wasSignedIn of [false, true]) {
      for (const [pendingEmailCode, redirectPending] of [
        [true, false],
        [false, true],
        [true, true],
      ]) {
        expect(
          accountMenuLoadAtMount({ pendingEmailCode, redirectPending, wasSignedIn }),
          JSON.stringify({ pendingEmailCode, redirectPending, wasSignedIn }),
        ).toBe("now");
      }
    }
  });
});
