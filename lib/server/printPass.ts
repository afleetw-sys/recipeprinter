import { createHmac, timingSafeEqual } from "node:crypto";
import { recipePrinterUserPath } from "@/lib/firebase/recipePrinterPaths";
import { PREMIUM_TEMPLATE_ENTITLEMENTS } from "@/lib/premiumTemplates";
import { RECIPEPRINTER_PRO_ENTITLEMENT_ID } from "@/lib/proProduct";

/**
 * A short-lived, signed note that says "this cook has Pro", for one print in
 * Safari.
 *
 * The Google app on iPhone cannot print, so its cards are handed to Safari
 * (lib/printHandoff). Safari is a different browser with no sign-in and no
 * RevenueCat identity, so a subscriber's deck arrived locked: the upgrade
 * prompt, or the watermark. The pass carries their entitlements across.
 *
 * It is issued only from a verified Firebase ID token, reading the account's
 * mirrored entitlements AS that user (the same REST read and the same rules as
 * lib/server/cookbookAccess), and it is signed here, so a hand-edited link
 * cannot mint one. It grants nothing but what that account already had, and
 * expires in `PASS_LIFETIME_MS`.
 */

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects";
/** Long enough for a cook to finish in Safari; short enough not to matter if a
    link is ever passed on. */
export const PASS_LIFETIME_MS = 30 * 60 * 1000;

const MIRRORED = [...Object.values(PREMIUM_TEMPLATE_ENTITLEMENTS), RECIPEPRINTER_PRO_ENTITLEMENT_ID];
/** Only a legacy one-time template purchase may be active with no expiry (see
    lib/proAccessFallback.ts, which applies the same rule on the client). */
const LIFETIME_ELIGIBLE = new Set<string>(Object.values(PREMIUM_TEMPLATE_ENTITLEMENTS));

export interface PrintPass {
  /** Active entitlement ids. */
  ent: string[];
  /** Expiry, ms since epoch. */
  exp: number;
}

function signingKey(): Buffer | null {
  // Derived from an existing server-only secret rather than a new one, under
  // its own label, so this key is good for nothing else.
  const secret = process.env.RECIPEPRINTER_PDF_AUTH?.trim();
  return secret ? createHmac("sha256", secret).update("recipeprinter-print-pass-v1").digest() : null;
}

export function printPassConfigured(): boolean {
  return signingKey() !== null && Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim());
}

function sign(body: string, key: Buffer): string {
  return createHmac("sha256", key).update(body).digest("base64url");
}

export function signPrintPass(pass: PrintPass): string {
  const key = signingKey();
  if (!key) throw new Error("Print passes are not configured.");
  const body = Buffer.from(JSON.stringify(pass)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

/** The pass, if it is ours, intact and unexpired. */
export function readPrintPass(token: string, nowMs = Date.now()): PrintPass | null {
  const key = signingKey();
  const [body, signature] = token.split(".");
  if (!key || !body || !signature) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const pass = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<PrintPass>;
    if (!Array.isArray(pass.ent) || typeof pass.exp !== "number" || pass.exp <= nowMs) return null;
    return { ent: pass.ent.filter((id): id is string => typeof id === "string"), exp: pass.exp };
  } catch {
    return null;
  }
}

type FirestoreValue = {
  booleanValue?: boolean;
  timestampValue?: string;
  mapValue?: { fields?: Record<string, FirestoreValue> };
};

async function readUserFields(
  projectId: string,
  segments: readonly string[],
  idToken: string,
): Promise<Record<string, FirestoreValue> | null> {
  const path = segments.map(encodeURIComponent).join("/");
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return {};
  if (!response.ok) return null;
  const doc = (await response.json()) as { fields?: Record<string, FirestoreValue> };
  return doc.fields ?? {};
}

/**
 * The entitlements this account holds right now, from the mirror the
 * RevenueCat webhook keeps on its profile, and the soonest any of them ends.
 * Reads the namespaced profile over the legacy one, as the client does
 * (lib/recipePrinterUserProfile). Throws when neither could be read.
 */
export async function activeEntitlements(
  uid: string,
  idToken: string,
  nowMs = Date.now(),
): Promise<{ ent: string[]; endsAt: number | null }> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!projectId) throw new Error("Not configured.");
  const [namespaced, legacy] = await Promise.all([
    readUserFields(projectId, recipePrinterUserPath(uid), idToken),
    readUserFields(projectId, ["users", uid], idToken),
  ]);
  if (namespaced === null && legacy === null) throw new Error("Couldn't read the account.");
  const merged = { ...(legacy ?? {}), ...(namespaced ?? {}) };
  const mirror = merged.recipePrinterEntitlements?.mapValue?.fields ?? {};
  const ent: string[] = [];
  let endsAt: number | null = null;
  for (const id of MIRRORED) {
    const fields = mirror[id]?.mapValue?.fields;
    if (fields?.active?.booleanValue !== true) continue;
    const expiresAt = fields.expiresAt?.timestampValue ? Date.parse(fields.expiresAt.timestampValue) : null;
    if (expiresAt === null ? !LIFETIME_ELIGIBLE.has(id) : expiresAt <= nowMs) continue;
    ent.push(id);
    if (expiresAt !== null) endsAt = endsAt === null ? expiresAt : Math.min(endsAt, expiresAt);
  }
  return { ent, endsAt };
}

/** RevenueCat's anonymous app-user id: what a signed-out purchase belongs to. */
const ANONYMOUS_CUSTOMER = /^\$RCAnonymousID:[0-9a-f]{32}$/;
const RC_API = "https://api.revenuecat.com/v2";

export function isAnonymousCustomerId(value: unknown): value is string {
  return typeof value === "string" && ANONYMOUS_CUSTOMER.test(value);
}

async function rc<T>(path: string, secret: string): Promise<T> {
  const response = await fetch(`${RC_API}${path}`, {
    headers: { Authorization: `Bearer ${secret}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`RevenueCat ${response.status} on ${path.split("?")[0]}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

/**
 * The entitlements a signed-out purchase holds, asked of RevenueCat directly.
 *
 * A signed-out subscriber has no account and so no mirror to read; their Pro
 * lives on the random anonymous id in their browser, and holding that id is
 * what owning the purchase means today. Only anonymous ids are accepted here:
 * an account's id is its Firebase uid, which is not a secret, so accounts go
 * through the ID-token path instead. These are GETs, which never create a
 * RevenueCat customer (unlike configuring the SDK).
 *
 * Needs `customer_information:customers:read` and
 * `project_configuration:entitlements:read` on `REVENUECAT_SECRET_KEY`.
 */
export async function anonymousEntitlements(
  customerId: string,
  nowMs = Date.now(),
): Promise<{ ent: string[]; endsAt: number | null }> {
  const secret = process.env.REVENUECAT_SECRET_KEY?.trim();
  const projectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  if (!secret || !projectId) throw new Error("RevenueCat is not configured.");
  const project = `/projects/${encodeURIComponent(projectId)}`;
  const [active, catalog] = await Promise.all([
    rc<{ items: Array<{ entitlement_id: string; expires_at: number | null }> }>(
      `${project}/customers/${encodeURIComponent(customerId)}/active_entitlements`,
      secret,
    ),
    rc<{ items: Array<{ id: string; lookup_key: string }> }>(`${project}/entitlements?limit=100`, secret),
  ]);
  const lookupKey = new Map(catalog.items.map((entitlement) => [entitlement.id, entitlement.lookup_key]));
  const ent: string[] = [];
  let endsAt: number | null = null;
  for (const item of active.items) {
    const id = lookupKey.get(item.entitlement_id);
    if (!id || !MIRRORED.includes(id)) continue;
    if (item.expires_at === null ? !LIFETIME_ELIGIBLE.has(id) : item.expires_at <= nowMs) continue;
    ent.push(id);
    if (item.expires_at !== null) endsAt = endsAt === null ? item.expires_at : Math.min(endsAt, item.expires_at);
  }
  return { ent, endsAt };
}
