// Local stand-in for CookPilot's callables while checking the referral UI against the Auth
// emulator. The signed-in account's email picks the scenario:
//   verify*  an unverified password account: the claim waits until a code confirms it
//   earned*  a friend joined while away (promo)      paid*    a subscriber with 6 days banked (Nov 1 -> Nov 7)
//   expired* referral Pro has run out                capped*  15 of 15 days earned, expired
//   used*    9 of 10 free imports already used
//   anything else: a fresh account
// Claiming an invite (someone's /invite/<code>, or the demo /invite/AB3CD4EF, signed out, then sign up)
// adds the 3 days from a friend, and banks 3 for the account whose code it was (started on its next visit).
// An account that existed before the link was opened is refused, as the real rules refuse it.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { emailCodeStandIn } from "../../e2e/stubs/emailCode.mjs";

// Link imports: every link gets the same sample recipe (the Playwright fixture),
// so nothing reaches the real parser or spends scraper quota.
const parsedRecipe = readFileSync(new URL("../../e2e/fixtures/cookpilot-reply.json", import.meta.url), "utf8");
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-firebase-appcheck, x-firebase-gmpid, x-firebase-client",
  "access-control-allow-methods": "POST, OPTIONS, GET",
};
const DAY = 864e5;
// Emailed sign-in codes: printed here, and at GET /last-code?email=… (see e2e/stubs/emailCode.mjs).
// Ports can be moved (REFERRAL_STUB_PORT, REFERRAL_AUTH_PORT) to run a second preview beside one already up.
const STUB_PORT = Number(process.env.REFERRAL_STUB_PORT ?? 3212);
const codes = emailCodeStandIn({ authHost: `127.0.0.1:${process.env.REFERRAL_AUTH_PORT ?? 9198}`, projectId: "demo-recipeprinter" });
const claims = new Map();
// Accounts that joined through a friend's link, and when: they got 3 days, which count toward their cap.
const invited = new Map();
// Like the real claim rules (CookPilot decideClaim): an account this stand-in saw before the link
// was opened already uses RecipePrinter and can't be referred; each opened link is claimed once.
const firstSeen = new Map();
const opens = new Map();
let openCount = 0;
// Each account's own invite code, and what its friends have earned it. AB3CD4EF stays a demo
// code that belongs to nobody (a friend can still claim it; no one is credited).
const codeOf = new Map();
const ownerOf = new Map();
const credit = new Map(); // uid -> { friends, banked, startedDays, promoEndsAtMs }
function codeFor(uid) {
  if (!codeOf.has(uid)) {
    let code;
    do code = Array.from({ length: 8 }, () => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 31)]).join("");
    while (ownerOf.has(code) || code === "AB3CD4EF");
    codeOf.set(uid, code); ownerOf.set(code, uid);
  }
  return codeOf.get(uid);
}
const activated = new Set();
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", ...CORS }); res.end(JSON.stringify(body)); };
function caller(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); } catch { return null; }
}
function scenario(who) {
  const email = who?.email ?? "";
  const now = Date.now();
  const base = { enabled: true, code: null, successfulReferrals: 0, lifetimeDaysEarned: 0, lifetimeCapDays: 15,
    rewardDays: 3, promoEndsAtMs: null, lastGrant: null, referred: false, proActive: false, proPaid: false, bankedDays: 0 };
  if (email.startsWith("earned")) return { ...base, successfulReferrals: 2, lifetimeDaysEarned: 6, bankedDays: activated.has(who.user_id) ? 0 : 6 };
  if (email.startsWith("paid")) return { ...base, successfulReferrals: 2, lifetimeDaysEarned: 6, proActive: true, proPaid: true,
    bankedDays: activated.has(who.user_id) ? 0 : 6 };
  if (email.startsWith("expired")) return { ...base, code: null, lifetimeDaysEarned: 7, referred: true, promoEndsAtMs: now - DAY };
  if (email.startsWith("capped")) return { ...base, successfulReferrals: 1, lifetimeDaysEarned: 15, referred: true, promoEndsAtMs: now - DAY };
  return base;
}
function summary(who) {
  const s = withCredit(who, scenario(who));
  const at = invited.get(who?.user_id);
  if (at === undefined) return s;
  const welcomeEnds = at + 3 * DAY;
  return { ...s, referred: true, lifetimeDaysEarned: s.lifetimeDaysEarned + 3,
    promoEndsAtMs: Math.max(s.promoEndsAtMs ?? 0, welcomeEnds), proActive: s.proActive || welcomeEnds > Date.now() };
}
function withCredit(who, s) {
  const c = credit.get(who?.user_id);
  const code = who?.user_id && codeOf.has(who.user_id) ? codeOf.get(who.user_id) : s.code;
  if (!c) return { ...s, code };
  const ends = c.promoEndsAtMs ?? null;
  return { ...s, code, successfulReferrals: s.successfulReferrals + c.friends,
    lifetimeDaysEarned: Math.min(15, s.lifetimeDaysEarned + 3 * c.friends), bankedDays: s.bankedDays + c.banked,
    promoEndsAtMs: ends && ends > (s.promoEndsAtMs ?? 0) ? ends : s.promoEndsAtMs,
    proActive: s.proActive || (ends ?? 0) > Date.now() };
}
// The free-import meter, enforcing like production: 10 per 30 days, counted per
// account (or per signed-out browser, by its rpAnonId). A `used…` email starts at 9 of 10.
const LIMIT = 10;
const meters = new Map();
const pending = new Map();
function meter(who, data) {
  if (summary(who).proActive) return { ok: true, mode: "enforce", allowed: true, reason: "pro" };
  const key = who?.user_id ?? data.rpAnonId ?? "signed-out";
  let m = meters.get(key);
  if (!m || (m.nextFreeAt && m.nextFreeAt <= Date.now())) {
    m = { used: who?.email?.startsWith("used") ? 9 : 0, nextFreeAt: null };
    if (m.used) m.nextFreeAt = Date.now() + 21 * DAY;
    meters.set(key, m);
  }
  const usage = () => ({ used: m.used, limit: LIMIT, nextFreeAt: m.nextFreeAt });
  if (data.op === "reserve") {
    if (m.used >= LIMIT) return { ok: true, mode: "enforce", allowed: false, reason: "limit", ...usage() };
    m.used += 1;
    m.nextFreeAt ??= Date.now() + 30 * DAY;
    pending.set(data.importId, key);
  } else if (data.op === "settle" && data.outcome === "failure" && pending.get(data.importId) === key) {
    m.used = Math.max(0, m.used - 1);
    if (!m.used) m.nextFreeAt = null;
  }
  if (data.op === "settle") pending.delete(data.importId);
  return { ok: true, mode: "enforce", allowed: true, ...usage() };
}
createServer((req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  if (req.method === "GET" && req.url === "/health") return send(res, 200, { ok: true });
  if (req.method === "GET" && req.url.startsWith("/last-code")) {
    return send(res, 200, { code: codes.lastCode(new URL(req.url, "http://stub").searchParams.get("email")) });
  }
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const data = JSON.parse(raw || "{}").data ?? {};
    const who = caller(req);
    if (who?.user_id && !firstSeen.has(who.user_id)) firstSeen.set(who.user_id, Date.now());
    console.log(req.url, JSON.stringify(data), who?.email ?? "-");
    if (req.url === "/parse-url" || req.url === "/parse-html") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(parsedRecipe);
    }
    if (/\/recipePrinterEmailCode(Send|Verify)$/.test(req.url)) {
      codes.handle(req.url, data).then((result) => send(res, 200, { result }))
        .catch((error) => send(res, 500, { error: { status: "INTERNAL", message: String(error) } }));
      return;
    }
    if (req.url.endsWith("/recipePrinterReferral")) {
      if (data.op === "open") {
        const openId = `stub-open-${++openCount}`;
        opens.set(openId, { openedAtMs: Date.now(), claimedBy: null, referrerUid: ownerOf.get(data.code) ?? null });
        return send(res, 200, { result: { ok: true, openId, expiresAtMs: Date.now() + 30 * DAY, rewardDays: 3 } });
      }
      if (data.op === "claim") {
        // The app now keeps the link itself and sends the code (as `openId`), like the real backend.
        const code = String(data.code ?? data.openId ?? "").toUpperCase();
        const open = { referrerUid: ownerOf.get(code) ?? null, claimedBy: null };
        const reject = (reason) => send(res, 200, { result: { status: "rejected", reason } });
        if (!code) return reject("bad_code");
        if (invited.has(who.user_id)) return reject("already_referred");
        if (open.referrerUid === who.user_id) return reject("self_referral");
        // New to RecipePrinter: this stand-in first saw the account moments ago (at sign-up).
        if (Date.now() - firstSeen.get(who.user_id) > 10 * 60_000) return reject("existing_account");
        const n = (claims.get(who.user_id) ?? 0) + 1; claims.set(who.user_id, n);
        if (who.email?.startsWith("verify") && !who.email_verified) return send(res, 200, { result: { status: "pending_verification" } });
        open.claimedBy = who.user_id;
        invited.set(who.user_id, Date.now());
        // The inviter's 3 days wait (banked) until their next visit starts them.
        if (open.referrerUid) {
          const c = credit.get(open.referrerUid) ?? { friends: 0, banked: 0, promoEndsAtMs: null };
          if (3 * (c.friends + 1) <= 15) { c.friends += 1; c.banked += 3; }
          credit.set(open.referrerUid, c);
        }
        return send(res, 200, { result: { status: "granted", days: 3 } });
      }
      const s = summary(who);
      // Like the real server, `link` always makes a code.
      if (data.op === "activate") {
        const c = credit.get(who.user_id);
        if (c && c.banked > 0) {
          const days = c.banked;
          c.promoEndsAtMs = Math.max(Date.now(), c.promoEndsAtMs ?? 0) + days * DAY;
          c.banked = 0;
          return send(res, 200, { result: { days, fulfillment: "promo", pending: 0, renewsAtMs: null, friends: days / 3 } });
        }
        const paid = who.email?.startsWith("paid");
        const days = (who.email?.startsWith("earned") || paid) && !activated.has(who.user_id) ? 6 : 0;
        activated.add(who.user_id);
        // A subscriber renewing Nov 1 gets Nov 7 (two friends, 3 days each).
        return send(res, 200, { result: { days, fulfillment: days ? (paid ? "extension" : "promo") : null, pending: 0,
          renewsAtMs: paid && days ? Date.parse("2026-11-07T15:00:00Z") : null, friends: days / 3 } });
      }
      return send(res, 200, { result: data.op === "link" ? { ...s, code: codeFor(who.user_id) } : s });
    }
    if (req.url.endsWith("/recipePrinterImportMeter")) return send(res, 200, { result: meter(who, data) });
    send(res, 404, { error: { status: "NOT_FOUND", message: "stub" } });
  });
}).listen(STUB_PORT, "127.0.0.1", () => console.log(`referral stub on :${STUB_PORT}`));
