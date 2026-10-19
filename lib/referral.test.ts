// @vitest-environment jsdom
import { beforeEach, describe, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";

const callable = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, answer: vi.fn() }));
vi.mock("@/lib/parser", () => ({
  callCookPilotParser: async (_name: string, data: Record<string, unknown>) => {
    callable.calls.push(data);
    return callable.answer(data);
  },
}));

import { GET as inviteRoute } from "@/app/invite/[code]/route";
import {
  INVITE_COOKIE,
  claimStoredOpen,
  membershipStatus,
  readyToActivate,
  readStoredOpen,
  recordInviteFromCookie,
  referralPurchaseProps,
  markPostPrintInviteShown,
  postPrintInviteShown,
  shouldShowPostPrintInvite,
} from "./referral";

/**
 * The referral program's client half (CookPilot decides who qualifies and
 * grants the days; recipePrinterReferral.test.ts there covers that).
 */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-02T15:00:00Z");

beforeEach(() => {
  window.localStorage.clear();
  callable.calls = [];
  callable.answer.mockReset();
});

describe("the invite link", () => {
  test("hands the code over in a cookie and sends the visitor home, with the code in no URL", async () => {
    const response = inviteRoute(new NextRequest("https://www.recipeprinter.com/invite/ab3cd4ef"), {
      params: { code: "ab3cd4ef" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://www.recipeprinter.com/");
    expect(response.cookies.get(INVITE_COOKIE)?.value).toBe("AB3CD4EF");
    // A malformed code sets nothing, and still lands on the homepage.
    const junk = inviteRoute(new NextRequest("https://www.recipeprinter.com/invite/x"), { params: { code: "x" } });
    expect(junk.cookies.get(INVITE_COOKIE)).toBeUndefined();
    expect(junk.headers.get("location")).toBe("https://www.recipeprinter.com/");
  });

  test("the first link wins until it can no longer be claimed; then a new one counts", () => {
    // Kept locally, with no call: the code is what the claim sends.
    expect(recordInviteFromCookie(`${INVITE_COOKIE}=AAAAAAAA`, NOW)).toMatchObject({ recorded: true });
    expect(recordInviteFromCookie(`other=1; ${INVITE_COOKIE}=BBBBBBBB`, NOW + DAY)).toEqual({
      recorded: false,
      firstTouch: false,
    });
    expect(callable.calls).toHaveLength(0);
    expect(readStoredOpen(NOW + DAY)?.openId).toBe("AAAAAAAA");

    // Thirty days on, the first is gone and the next link records.
    expect(readStoredOpen(NOW + 31 * DAY)).toBeNull();
    expect(recordInviteFromCookie(`${INVITE_COOKIE}=BBBBBBBB`, NOW + 31 * DAY)).toMatchObject({ recorded: true });
    expect(readStoredOpen(NOW + 31 * DAY)?.openId).toBe("BBBBBBBB");
  });

  test("a link opened before a phone's sign-in redirect is still claimed after it", async () => {
    recordInviteFromCookie(`${INVITE_COOKIE}=AAAAAAAA`);
    // The redirect reloads the page: only storage survives.
    vi.resetModules();
    const reloaded = await import("./referral");

    callable.answer.mockResolvedValueOnce({ status: "pending_verification" });
    expect(await reloaded.claimStoredOpen()).toEqual({ status: "pending_verification" });
    expect(reloaded.readStoredOpen()?.pendingVerification).toBe(true);

    callable.answer.mockResolvedValueOnce({ status: "granted", days: 3 });
    expect(await reloaded.claimStoredOpen()).toEqual({ status: "granted", days: 3 });
    expect(callable.calls).toEqual([{ op: "claim", openId: "AAAAAAAA" }, { op: "claim", openId: "AAAAAAAA" }]);
    // Claimed: nothing left to send again.
    expect(reloaded.readStoredOpen()).toBeNull();
    expect(await claimStoredOpen()).toBeNull();
  });
});

describe("analytics facts", () => {
  test("membership: paid wins, referral Pro only while referral days are running, otherwise free", () => {
    const base = { proActive: true, proPaid: false, promoEndsAtMs: NOW + 3 * DAY };
    expect(membershipStatus(null, NOW)).toBe("free");
    expect(membershipStatus({ ...base, proActive: false }, NOW)).toBe("free");
    expect(membershipStatus(base, NOW)).toBe("referral_pro");
    expect(membershipStatus({ ...base, proPaid: true }, NOW)).toBe("paid_pro");
    // A bought month after the referral days ended: still Pro, and paid for.
    expect(membershipStatus({ ...base, promoEndsAtMs: NOW - DAY }, NOW)).toBe("paid_pro");
  });

  test("a purchase says whether the buyer came through a friend and had referral Pro", () => {
    expect(referralPurchaseProps(null, NOW)).toEqual({
      acquired_via_referral: false, had_referral_pro: false, referral_pro_active: false,
    });
    expect(referralPurchaseProps({ referred: true, lifetimeDaysEarned: 3, promoEndsAtMs: NOW + DAY }, NOW)).toEqual({
      acquired_via_referral: true, had_referral_pro: true, referral_pro_active: true,
    });
  });
});

describe("starting a referrer's banked days", () => {
  test("by themselves on the next visit, in a tab that's showing, never inside the Cookbook Builder", () => {
    const visit = { bankedDays: 6, visible: true, surface: "cards" as const };
    expect(readyToActivate(visit)).toBe(true);
    // Any RecipePrinter page that isn't the Cookbook Builder counts (the homepage has no surface).
    expect(readyToActivate({ ...visit, surface: null })).toBe(true);
    expect(readyToActivate({ ...visit, bankedDays: 0 })).toBe(false);
    expect(readyToActivate({ ...visit, visible: false })).toBe(false);
    expect(readyToActivate({ ...visit, surface: "cookbook" })).toBe(false);
  });
});

describe("the invite after printing", () => {
  test("once per browser, whatever came before; never in a cookbook or at the cap", () => {
    // A browser that already saw the old "Leave feedback" dialog still gets this once.
    window.localStorage.setItem("recipeprinter:post-print-dialog:last-shown:v1", "1");
    const ask = (extra = {}) =>
      shouldShowPostPrintInvite({ cookbookMode: false, capReached: false, alreadyShown: postPrintInviteShown(), ...extra });
    expect(ask({ cookbookMode: true })).toBe(false);
    expect(ask({ capReached: true })).toBe(false);
    expect(ask()).toBe(true);
    markPostPrintInviteShown();
    expect(ask()).toBe(false);
  });
});
