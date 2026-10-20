import { localStore, sessionStore } from "@/lib/storage";

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
 * The reward to quote before an account exists to ask the server (signed-out
 * copy). CookPilot's config is the real number; keep this in step with it.
 */
export const DEFAULT_REWARD_DAYS = 3;

/**
 * The app's own switch for everything a person sees of the program before
 * they've been invited: the after-print invite, the session status read that
 * finds rewards and expiry. On since launch (Amelia, 2026-10-19), like `IMPORT_ALLOWANCE_LIVE`;
 * CookPilot's `recipePrinterConfig/referrals.enabled` is the server's switch,
 * and both must be on. A friend's link is recorded and claimed either way,
 * and the server says no while it is off.
 */
export const REFERRALS_LIVE =
  true ||
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

/** What goes with the link in a share sheet. */
export function inviteShareText(rewardDays: number): string {
  return `Try RecipePrinter with me. We both get ${rewardDays} days of Pro.`;
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
    renewsAtMs?: number;
  } | null;
  referred: boolean;
  /** Earned from friends and waiting for this account's next active visit. */
  bankedDays: number;
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

// ---- What the inviter already has (for the invite's wording) ----------------

/**
 * `paid`: a renewing subscription, so a reward moves their next payment later.
 * `pro`: Pro with nothing renewing (referral days, a bought month), so a
 * reward adds days. `free`: a reward is Pro they don't have yet.
 */
export type InviterPlan = "free" | "pro" | "paid";

const RENEWING_PRO_PRODUCTS = new Set(["pro_monthly", "pro_annual"]);

export function inviterPlan(input: { hasPro: boolean; productIdentifier?: string | null }): InviterPlan {
  if (!input.hasPro) return "free";
  return input.productIdentifier && RENEWING_PRO_PRODUCTS.has(input.productIdentifier) ? "paid" : "pro";
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

/**
 * A new key on purpose: it replaces the once-per-browser "Leave feedback"
 * dialog, so every browser, including one that already saw that, sees this
 * once.
 */
const POST_PRINT_INVITE_KEY = "recipeprinter:post-print-invite:v1";

/**
 * Whether the "Give 3 days. Get 3 days." dialog shows now: once per browser,
 * after a card export (Print or a PDF/PNG/JPG download) or a second card
 * import (a cookbook has its own screen),
 * and never once there's nothing left to earn.
 */
export function shouldShowPostPrintInvite(input: {
  cookbookMode: boolean;
  capReached: boolean;
  alreadyShown: boolean;
}): boolean {
  return !input.cookbookMode && !input.capReached && !input.alreadyShown;
}

/**
 * Card imports this browser has made, for offering the invite after the
 * second one (Amelia, 2026-10-19: "after second import or first print",
 * whichever comes first, still once per browser). Cookbook imports don't count.
 */
const CARD_IMPORTS_KEY = "recipeprinter:card-imports:v1";
export const CARD_IMPORTED_EVENT = "recipeprinter:card-imported";
export const INVITE_AFTER_IMPORTS = 2;

export function noteCardImport(): void {
  const count = Number(localStore.get(CARD_IMPORTS_KEY) ?? 0) + 1;
  localStore.set(CARD_IMPORTS_KEY, String(count));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CARD_IMPORTED_EVENT));
}

export function cardImportCount(): number {
  return Number(localStore.get(CARD_IMPORTS_KEY) ?? 0);
}

export function postPrintInviteShown(): boolean {
  return localStore.get(POST_PRINT_INVITE_KEY) !== null;
}

export function markPostPrintInviteShown(): void {
  localStore.set(POST_PRINT_INVITE_KEY, "1");
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

let warmed = false;

/**
 * Wakes the referral function while a friend is still signing up, so the
 * claim that follows doesn't also wait for a cold start, and has Firebase and
 * an App Check token ready in the page. "open" is a no-op on the server. Once
 * per page; failures don't matter.
 */
export function warmReferralBackend(code: string): void {
  if (warmed) return;
  warmed = true;
  void callReferral({ op: "open", code }).catch(() => undefined);
}

/**
 * Keeps the friend's link the invite route left in a cookie, for claiming at
 * sign-in. Local and immediate: the backend's "open" step only echoed the code
 * back with the attribution window, so waiting on Firebase, App Check and a
 * function call just held up the "A friend gave you Pro" dialog (Amelia,
 * 2026-10-19). The claim checks everything that matters.
 */
const ATTRIBUTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export function recordInviteFromCookie(cookie: string, nowMs = Date.now()):
  { recorded: true; open: StoredOpen } | { recorded: false; firstTouch: boolean } | null {
  const code = readInviteCookie(cookie);
  if (!code) return null;
  clearInviteCookie();
  if (!shouldRecordOpen(nowMs)) return { recorded: false, firstTouch: false };
  const open = { openId: code, expiresAtMs: nowMs + ATTRIBUTION_DAYS * DAY_MS, rewardDays: DEFAULT_REWARD_DAYS };
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

export interface ActivationResult {
  days: number;
  fulfillment: "promo" | "extension" | null;
  pending: number;
  /** A subscriber's next renewal after the extension, from RevenueCat. */
  renewsAtMs: number | null;
  /** How many friends' rewards started. */
  friends: number;
}

// ---- When banked days start --------------------------------------------------

/**
 * Where the person is: the card printer, or the Cookbook Builder. Set by
 * /print. For the first launch the program belongs to the card printer, so
 * nothing referral-related is offered, or started, inside the Cookbook Builder.
 */
export type ReferralSurface = "cards" | "cookbook";
export const REFERRAL_SURFACE_EVENT = "recipeprinter:referral-surface";
let surface: ReferralSurface | null = null;
export function setReferralSurface(next: ReferralSurface | null): void {
  surface = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(REFERRAL_SURFACE_EVENT));
}
export function referralSurface(): ReferralSurface | null {
  return surface;
}

/**
 * A referrer's banked days start by themselves the next time they come to
 * RecipePrinter: in a tab that's showing, anywhere but the Cookbook Builder
 * (there they wait for the next card-printer page). There is no button for it.
 */
export function readyToActivate(input: {
  bankedDays: number;
  visible: boolean;
  surface: ReferralSurface | null;
}): boolean {
  return input.bankedDays > 0 && input.visible && input.surface !== "cookbook";
}

export async function activateBankedRewards(): Promise<ActivationResult> {
  const result = (await callReferral({ op: "activate" })) as ActivationResult;
  if (lastSummary) lastSummary = { ...lastSummary, bankedDays: 0 };
  return result;
}

export async function loadReferralSummary(op: "link" | "status"): Promise<ReferralSummary> {
  const summary = (await callReferral({ op })) as ReferralSummary;
  lastSummary = summary;
  notify();
  return summary;
}

// ---- Signing in to get a link ------------------------------------------------

/**
 * "Get my referral link" signed out: sign in, then land on /invites with the
 * link ready, instead of back in the dialog to press it again (Amelia,
 * 2026-10-19). Kept in the tab's session so it survives a phone's sign-in
 * redirect, and only for a few minutes so an abandoned sign-in never
 * navigates someone later.
 */
const INVITES_AFTER_SIGN_IN_KEY = "recipeprinter:invites-after-sign-in:v1";
const INVITES_AFTER_SIGN_IN_MS = 10 * 60_000;

export function goToInvitesAfterSignIn(nowMs = Date.now()): void {
  sessionStore.set(INVITES_AFTER_SIGN_IN_KEY, String(nowMs));
}

export function cancelGoToInvitesAfterSignIn(): void {
  sessionStore.remove(INVITES_AFTER_SIGN_IN_KEY);
}

/** Whether a sign-in just finished that should land on /invites; clears it either way. */
export function takeGoToInvitesAfterSignIn(nowMs = Date.now()): boolean {
  const at = Number(sessionStore.get(INVITES_AFTER_SIGN_IN_KEY) ?? 0);
  sessionStore.remove(INVITES_AFTER_SIGN_IN_KEY);
  return at > 0 && nowMs - at < INVITES_AFTER_SIGN_IN_MS;
}
