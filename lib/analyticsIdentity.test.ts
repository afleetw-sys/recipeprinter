import { describe, expect, test, vi } from "vitest";
import type { PostHog } from "posthog-js";
import { setAnalyticsClientForTest, syncAnalyticsIdentity } from "./analytics";

/**
 * Signing out has to end the PostHog person. Without a reset, everything the
 * next person does on a shared device (a family laptop, a library computer)
 * lands on the account that was signed in before, referral and purchase
 * attribution included.
 */
function stubClient(state: { userState?: string; optedOut?: boolean; internal?: boolean } = {}) {
  const props: Record<string, unknown> = { $user_state: state.userState ?? "anonymous" };
  let optedOut = state.optedOut ?? false;
  const client = {
    identify: vi.fn(() => {
      props.$user_state = "identified";
    }),
    reset: vi.fn(() => {
      props.$user_state = "anonymous";
    }),
    get_property: vi.fn((name: string) => props[name]),
    get_session_property: vi.fn((name: string) => (name === "internal" && state.internal ? true : undefined)),
    register_for_session: vi.fn(),
    register_once: vi.fn(),
    has_opted_out_capturing: vi.fn(() => optedOut),
    opt_out_capturing: vi.fn(() => {
      optedOut = true;
    }),
  };
  return client;
}

describe("syncAnalyticsIdentity", () => {
  test("signing out ends the person, once, without touching opt-outs or ordinary visitors", () => {
    // An ordinary signed-out visitor keeps their anonymous person.
    let client = stubClient();
    setAnalyticsClientForTest(client as unknown as PostHog);
    syncAnalyticsIdentity(null);
    expect(client.reset).not.toHaveBeenCalled();

    // Sign in, sign out (reset once, however often the listener repeats it),
    // sign back in (identified again).
    syncAnalyticsIdentity("uid-a");
    syncAnalyticsIdentity(null);
    syncAnalyticsIdentity(null);
    expect(client.reset).toHaveBeenCalledTimes(1);
    syncAnalyticsIdentity("uid-a");
    expect(client.identify).toHaveBeenCalledTimes(2);

    // A signed-out load still carrying a signed-in person (signed out while
    // analytics hadn't loaded, or by an older build) starts a new one.
    client = stubClient({ userState: "identified" });
    setAnalyticsClientForTest(client as unknown as PostHog);
    syncAnalyticsIdentity(null);
    expect(client.reset).toHaveBeenCalledTimes(1);

    // A reset never undoes an opt-out or a testing session's internal tag.
    client = stubClient({ optedOut: true, internal: true });
    setAnalyticsClientForTest(client as unknown as PostHog);
    syncAnalyticsIdentity("uid-b");
    syncAnalyticsIdentity(null);
    expect(client.opt_out_capturing).toHaveBeenCalled();
    expect(client.register_for_session).toHaveBeenCalledWith(expect.objectContaining({ internal: true }));
  });
});
