// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import type { PostHog } from "posthog-js";
import { carriedAnalyticsBootstrap, setAnalyticsClientForTest } from "./analytics";
import { packPrintHandoff, printHandoffUrl, seedPrintHandoff } from "./printHandoff";
import type { ProjectMeta } from "./project";
import type { QueueItem } from "@/types/recipe";

/**
 * A cook in the Google app who presses Print is sent to a new Safari tab
 * (lib/printHandoff). Safari has none of the app's storage, so PostHog used to
 * start a brand-new anonymous person there: one cook showed up as one person
 * per Print press, and every print landed on someone who never imported
 * anything. The hand-off has to carry who they are.
 */
function stubClient(props: Record<string, unknown>, sessionId: string, optedOut = false) {
  return {
    get_property: (name: string) => props[name],
    get_distinct_id: () => props.distinct_id,
    get_session_id: () => sessionId,
    has_opted_out_capturing: () => optedOut,
  } as unknown as PostHog;
}

/** Opens the link the way Safari would: a fresh tab with empty storage. */
function arriveInSafari(link: string): void {
  const url = new URL(link.replace(/^x-safari-https:/, "https:"));
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  setAnalyticsClientForTest(null);
  expect(seedPrintHandoff()).toBe(true);
}

const items = [{ id: "r1" }] as unknown as QueueItem[];
const meta = {} as ProjectMeta;

afterEach(() => setAnalyticsClientForTest(null));

describe("print hand-off keeps the PostHog visitor", () => {
  test("Safari continues the sender's person and session, once", () => {
    const senders = [
      // Signed out: the anonymous id is the person.
      { props: { distinct_id: "anon-1", $device_id: "anon-1", $user_state: "anonymous" }, expected: "anon-1" },
      // Signed in: carry the device id, which identify() already linked to the
      // account. Safari is signed out, so carrying the uid itself as identified
      // would be reset straight away (syncAnalyticsIdentity(null)).
      { props: { distinct_id: "uid-a", $device_id: "device-2", $user_state: "identified" }, expected: "device-2" },
    ];
    for (const { props, expected } of senders) {
      setAnalyticsClientForTest(stubClient(props, "session-1"));
      arriveInSafari(printHandoffUrl(packPrintHandoff(items, meta, new Map()), "https://recipeprinter.com"));
      expect(carriedAnalyticsBootstrap()).toEqual({ distinctID: expected, sessionID: "session-1" });
      // Read once: a later reload in Safari, maybe signed in by then, must not
      // be forced back to the carried anonymous id.
      expect(carriedAnalyticsBootstrap()).toBeUndefined();
    }

    // Someone who opted out of analytics sends nothing.
    setAnalyticsClientForTest(stubClient({ distinct_id: "anon-3", $device_id: "anon-3" }, "session-3", true));
    arriveInSafari(printHandoffUrl(packPrintHandoff(items, meta, new Map()), "https://recipeprinter.com"));
    expect(carriedAnalyticsBootstrap()).toBeUndefined();
  });
});
