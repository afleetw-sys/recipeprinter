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
