// Local stand-in for CookPilot's callables while checking the referral UI against the Auth
// emulator. The signed-in account's email picks the scenario:
//   verify*  first claim waits on email verification, the next is granted
//   earned*  a friend joined while away (promo)      paid*    a subscriber with 6 days banked (Nov 1 -> Nov 7)
//   expired* referral Pro has run out                capped*  15 of 15 days earned, expired
//   used*    9 of 10 free imports already used
//   anything else: a fresh account
// Claiming an invite (/invite/AB3CD4EF signed out, then sign up) adds the 3 days from a friend.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

// Link imports: every link gets the same sample recipe (the Playwright fixture),
// so nothing reaches the real parser or spends scraper quota.
const parsedRecipe = readFileSync(new URL("../../e2e/fixtures/cookpilot-reply.json", import.meta.url), "utf8");
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, authorization, x-firebase-appcheck, x-firebase-gmpid, x-firebase-client",
  "access-control-allow-methods": "POST, OPTIONS, GET",
};
const DAY = 864e5;
const claims = new Map();
// Accounts that joined through a friend's link, and when: they got 3 days, which count toward their cap.
const invited = new Map();
const activated = new Set();
const send = (res, status, body) => { res.writeHead(status, { "content-type": "application/json", ...CORS }); res.end(JSON.stringify(body)); };
function caller(req) {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  try { return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString()); } catch { return null; }
}
function scenario(who) {
  const email = who?.email ?? "";
  const now = Date.now();
  const base = { enabled: true, code: "AB3CD4EF", successfulReferrals: 0, lifetimeDaysEarned: 0, lifetimeCapDays: 15,
    rewardDays: 3, promoEndsAtMs: null, lastGrant: null, referred: false, proActive: false, proPaid: false, bankedDays: 0 };
  if (email.startsWith("earned")) return { ...base, successfulReferrals: 2, lifetimeDaysEarned: 6, bankedDays: activated.has(who.user_id) ? 0 : 6 };
  if (email.startsWith("paid")) return { ...base, successfulReferrals: 2, lifetimeDaysEarned: 6, proActive: true, proPaid: true,
    bankedDays: activated.has(who.user_id) ? 0 : 6 };
  if (email.startsWith("expired")) return { ...base, code: null, lifetimeDaysEarned: 7, referred: true, promoEndsAtMs: now - DAY };
  if (email.startsWith("capped")) return { ...base, successfulReferrals: 1, lifetimeDaysEarned: 15, referred: true, promoEndsAtMs: now - DAY };
  return base;
}
function summary(who) {
  const s = scenario(who);
  const at = invited.get(who?.user_id);
  if (at === undefined) return s;
  const welcomeEnds = at + 3 * DAY;
  return { ...s, referred: true, lifetimeDaysEarned: s.lifetimeDaysEarned + 3,
    promoEndsAtMs: Math.max(s.promoEndsAtMs ?? 0, welcomeEnds), proActive: s.proActive || welcomeEnds > Date.now() };
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
  let raw = ""; req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const data = JSON.parse(raw || "{}").data ?? {};
    const who = caller(req);
    console.log(req.url, JSON.stringify(data), who?.email ?? "-");
    if (req.url === "/parse-url" || req.url === "/parse-html") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end(parsedRecipe);
    }
    if (req.url.endsWith("/checkUserProviders")) return send(res, 200, { result: { providers: [] } });
    if (req.url.endsWith("/recipePrinterReferral")) {
      if (data.op === "open") return send(res, 200, { result: { ok: true, openId: "stub-open-0001", expiresAtMs: Date.now() + 30 * DAY, rewardDays: 3 } });
      if (data.op === "claim") {
        const n = (claims.get(who.user_id) ?? 0) + 1; claims.set(who.user_id, n);
        if (who.email?.startsWith("verify") && !who.email_verified) return send(res, 200, { result: { status: "pending_verification" } });
        if (!invited.has(who.user_id)) invited.set(who.user_id, Date.now());
        return send(res, 200, { result: { status: "granted", days: 3 } });
      }
      const s = summary(who);
      // Like the real server, `link` always makes a code.
      if (data.op === "activate") {
        const paid = who.email?.startsWith("paid");
        const days = (who.email?.startsWith("earned") || paid) && !activated.has(who.user_id) ? 6 : 0;
        activated.add(who.user_id);
        // A subscriber renewing Nov 1 gets Nov 7 (two friends, 3 days each).
        return send(res, 200, { result: { days, fulfillment: days ? (paid ? "extension" : "promo") : null, pending: 0,
          renewsAtMs: paid && days ? Date.parse("2026-11-07T15:00:00Z") : null, friends: days / 3 } });
      }
      return send(res, 200, { result: data.op === "link" ? { ...s, code: s.code ?? "AB3CD4EF" } : s });
    }
    if (req.url.endsWith("/recipePrinterImportMeter")) return send(res, 200, { result: meter(who, data) });
    send(res, 404, { error: { status: "NOT_FOUND", message: "stub" } });
  });
}).listen(3212, "127.0.0.1", () => console.log("referral stub on :3212"));
