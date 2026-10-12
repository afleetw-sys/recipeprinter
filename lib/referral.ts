import { localStore } from "@/lib/storage";

/**
 * The client half of the referral program (CookPilot `recipePrinterReferral`;
 * plan approved 2026-10-12).
 *
 * A friend's link (`/invite/{code}`) leaves the code in a cookie; the first
 * page that loads records the open with CookPilot and keeps only the returned
 * `openId` here, in localStorage, so it survives a phone's sign-in redirect.
 * Signing in claims it. CookPilot decides everything else: whether the
 * account is new to RecipePrinter, whether its email is verified, and what
 * each person gets.
 *
 * The first link wins: while an opened link is still claimable, a second
 * one is ignored, so who gets credit never depends on which link was tapped
 * last.
 */

export const REFERRAL_CALLABLE = "recipePrinterReferral";

/**
 * The app's own switch for everything a person sees of the program before
 * they've been invited: the after-print invite, the session status read that
 * finds rewards and expiry. Off until launch, like `IMPORT_ALLOWANCE_LIVE`;
 * CookPilot's `recipePrinterConfig/referrals.enabled` is the server's switch,
 * and both must be on. A friend's link is recorded and claimed either way,
 * and the server says no while it is off.
 */
export const REFERRALS_LIVE =
  false ||
  // Local preview only: lets a dev server against the emulators show the
  // program before launch. A deployed build never sets it.
  process.env.NEXT_PUBLIC_REFERRALS_PREVIEW === "1";
export const INVITE_COOKIE = "rp_invite";
/** Long enough to cover the redirect and the first page load, nothing more. */
export const INVITE_COOKIE_MAX_AGE_S = 60 * 60;

const OPEN_KEY = "recipeprinter:referral-open:v1";
const CODE_PATTERN = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;

export function normalizeInviteCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase();
  return CODE_PATTERN.test(code) ? code : null;
}

export function inviteUrl(code: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/invite/${code}`;
}

// ---- The opened link -------------------------------------------------------

export interface StoredOpen {
  openId: string;
  expiresAtMs: number;
  rewardDays: number;
  /** Set once a claim answered "check your email", so the reminder can say so. */
  pendingVerification?: boolean;
  /** Set once the "A friend gave you Pro" dialog has been shown for this link. */
  introShown?: boolean;
}

/** The claimable open, or null. An expired one is forgotten on read. */
export function readStoredOpen(nowMs = Date.now()): StoredOpen | null {
  const stored = localStore.getJson<StoredOpen>(OPEN_KEY);
  if (!stored || typeof stored.openId !== "string" || typeof stored.expiresAtMs !== "number") return null;
  if (stored.expiresAtMs <= nowMs) {
    localStore.remove(OPEN_KEY);
    return null;
  }
  return stored;
}

export function storeOpen(open: StoredOpen): void {
  localStore.setJson(OPEN_KEY, open);
  notify();
}

export function forgetStoredOpen(): void {
  localStore.remove(OPEN_KEY);
  notify();
}

/** First touch wins: a new link is only recorded when none is claimable. */
export function shouldRecordOpen(nowMs = Date.now()): boolean {
  return readStoredOpen(nowMs) === null;
}

// ---- The cookie the invite route left ---------------------------------------

export function readInviteCookie(cookie: string): string | null {
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === INVITE_COOKIE) return normalizeInviteCode(decodeURIComponent(rest.join("=")));
  }
  return null;
}

export function clearInviteCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${INVITE_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

// ---- Change notifications (for the invite line and the account card) -------

const listeners = new Set<() => void>();
let version = 0;
function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}
export function subscribeReferral(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function referralVersion(): number {
  return version;
}

// ---- Server answers ---------------------------------------------------------

export interface ReferralSummary {
  enabled: boolean;
  code: string | null;
  successfulReferrals: number;
  lifetimeDaysEarned: number;
  lifetimeCapDays: number;
  rewardDays: number;
  promoEndsAtMs: number | null;
  lastGrant: {
    atMs: number;
    days: number;
    role: "welcome" | "referrer";
    fulfillment: "promo" | "extension";
  } | null;
  referred: boolean;
  /** From the server's entitlement mirror, so nothing here reads RevenueCat. */
  proActive: boolean;
  proPaid: boolean;
}

export type ClaimResult =
  | { status: "granted"; days: number }
  | { status: "pending_verification" }
  | { status: "rejected"; reason: string }
  | { status: "disabled" };

export function capReached(summary: Pick<ReferralSummary, "lifetimeDaysEarned" | "lifetimeCapDays">): boolean {
  return summary.lifetimeDaysEarned >= summary.lifetimeCapDays;
}

/** Days this account can still earn from referrals. */
export function daysRemaining(summary: Pick<ReferralSummary, "lifetimeDaysEarned" | "lifetimeCapDays">): number {
  return Math.max(0, summary.lifetimeCapDays - summary.lifetimeDaysEarned);
}

// ---- Membership, for analytics ----------------------------------------------

export type MembershipStatus = "free" | "referral_pro" | "paid_pro";

/**
 * What kind of Pro this person has right now, from the server's mirror (so it
 * needs no RevenueCat read). Paid wins when both are running; a bought month,
 * promotional to RevenueCat but paid for, counts as paid.
 */
export function membershipStatus(
  summary: Pick<ReferralSummary, "proActive" | "proPaid" | "promoEndsAtMs"> | null,
  nowMs = Date.now(),
): MembershipStatus {
  if (!summary?.proActive) return "free";
  if (summary.proPaid) return "paid_pro";
  return (summary.promoEndsAtMs ?? 0) > nowMs ? "referral_pro" : "paid_pro";
}

let lastSummary: ReferralSummary | null = null;
/** The last summary this page loaded, for events fired far from where it was read. */
export function cachedReferralSummary(): ReferralSummary | null {
  return lastSummary;
}

/** Referral facts added to `purchase_completed`, so paid conversion can be split by them. */
export function referralPurchaseProps(
  summary: Pick<ReferralSummary, "referred" | "lifetimeDaysEarned" | "promoEndsAtMs"> | null,
  nowMs = Date.now(),
): { acquired_via_referral: boolean; had_referral_pro: boolean; referral_pro_active: boolean } {
  return {
    acquired_via_referral: Boolean(summary?.referred),
    had_referral_pro: (summary?.lifetimeDaysEarned ?? 0) > 0,
    referral_pro_active: (summary?.promoEndsAtMs ?? 0) > nowMs,
  };
}

// ---- The invite after printing ----------------------------------------------

const POST_PRINT_KEY = "recipeprinter:referral-post-print:v1";
export const POST_PRINT_MAX_SHOWS = 3;
export const POST_PRINT_GAP_MS = 14 * 24 * 60 * 60 * 1000;

interface PostPrintHistory {
  count: number;
  lastShownAtMs: number;
}

/**
 * Whether to mention inviting a friend after this print: at most three times
 * ever, at least two weeks apart, never in cookbook mode, and never once
 * there's nothing left to earn.
 */
export function shouldOfferReferralAfterPrint(input: {
  nowMs: number;
  cookbookMode: boolean;
  capReached: boolean;
  history: PostPrintHistory | null;
}): boolean {
  if (input.cookbookMode || input.capReached) return false;
  const history = input.history ?? { count: 0, lastShownAtMs: 0 };
  if (history.count >= POST_PRINT_MAX_SHOWS) return false;
  return input.nowMs - history.lastShownAtMs >= POST_PRINT_GAP_MS;
}

export function readPostPrintHistory(): PostPrintHistory | null {
  return localStore.getJson<PostPrintHistory>(POST_PRINT_KEY);
}

export function recordPostPrintReferralShown(nowMs = Date.now()): void {
  const history = readPostPrintHistory() ?? { count: 0, lastShownAtMs: 0 };
  localStore.setJson(POST_PRINT_KEY, { count: history.count + 1, lastShownAtMs: nowMs });
}

// ---- What's been celebrated --------------------------------------------------

const SEEN_GRANT_KEY = (uid: string) => `recipeprinter:referral-grant-seen:${uid}`;
const SEEN_EXPIRY_KEY = (uid: string) => `recipeprinter:referral-expiry-seen:${uid}`;

/** The grant to tell this person about, once per device. */
export function unseenGrant(uid: string, summary: ReferralSummary | null): ReferralSummary["lastGrant"] {
  const grant = summary?.lastGrant ?? null;
  if (!grant) return null;
  const seen = Number(localStore.get(SEEN_GRANT_KEY(uid)) ?? 0);
  return grant.atMs > seen ? grant : null;
}

export function markGrantSeen(uid: string, atMs: number): void {
  localStore.set(SEEN_GRANT_KEY(uid), String(atMs));
}

/** Referral Pro that has ended, not been replaced by paid Pro, and not been shown yet. */
export function expiredReferralToShow(uid: string, summary: ReferralSummary | null, nowMs = Date.now()): number | null {
  const end = summary?.promoEndsAtMs ?? null;
  if (!summary?.enabled || end === null || end > nowMs || summary.proActive) return null;
  if (Number(localStore.get(SEEN_EXPIRY_KEY(uid)) ?? 0) >= end) return null;
  return end;
}

export function markExpirySeen(uid: string, endMs: number): void {
  localStore.set(SEEN_EXPIRY_KEY(uid), String(endMs));
}

// ---- Calls ---------------------------------------------------------------------

async function callReferral(data: Record<string, unknown>): Promise<unknown> {
  // Through the shared helper, so the call carries App Check and `rpAnonId`
  // like every other CookPilot call.
  const { callCookPilotParser } = await import("@/lib/parser");
  return callCookPilotParser(REFERRAL_CALLABLE, data);
}

/** Records a friend's link left by the invite route, if this browser has none yet. */
export async function recordInviteFromCookie(cookie: string, nowMs = Date.now()): Promise<
  { recorded: true; open: StoredOpen } | { recorded: false; firstTouch: boolean } | null
> {
  const code = readInviteCookie(cookie);
  if (!code) return null;
  clearInviteCookie();
  if (!shouldRecordOpen(nowMs)) return { recorded: false, firstTouch: false };
  const answer = (await callReferral({ op: "open", code })) as
    { ok: true; openId: string; expiresAtMs: number; rewardDays: number } | { ok: false; reason: string };
  if (!answer || !answer.ok) return { recorded: false, firstTouch: true };
  const open = { openId: answer.openId, expiresAtMs: answer.expiresAtMs, rewardDays: answer.rewardDays };
  storeOpen(open);
  return { recorded: true, open };
}

/** Claims the stored link for the account that just signed in. */
export async function claimStoredOpen(nowMs = Date.now()): Promise<ClaimResult | null> {
  const open = readStoredOpen(nowMs);
  if (!open) return null;
  const result = (await callReferral({ op: "claim", openId: open.openId })) as ClaimResult;
  if (result.status === "pending_verification") {
    storeOpen({ ...open, pendingVerification: true });
  } else {
    // Granted, refused, or the program is off: there is nothing left to claim.
    forgetStoredOpen();
  }
  return result;
}

export async function loadReferralSummary(op: "link" | "status"): Promise<ReferralSummary> {
  const summary = (await callReferral({ op })) as ReferralSummary;
  lastSummary = summary;
  notify();
  return summary;
}
