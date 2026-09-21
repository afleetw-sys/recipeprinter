import { createPublicKey, createVerify, type KeyObject } from "node:crypto";

/**
 * Verifies a Firebase ID token on the server without asking Google about it.
 *
 * This used to be an `accounts:lookup` call to Identity Toolkit, which is a
 * REST request from OUR server carrying no App Check token. Once App Check
 * enforcement is switched on for Authentication (it is, on the shared
 * cookpilot-bbecb project), Google answers every such request with "Firebase
 * App Check token is invalid" — including for a perfectly good token — and a
 * paying customer could no longer download their book. A server has no way to
 * attest itself to App Check, so the fix is not to make that call at all.
 *
 * A Firebase ID token is a JWT signed with a key Google publishes, so the
 * server can check it entirely from public information: signature, expiry,
 * audience, issuer. That is the same check `firebase-admin`'s `verifyIdToken`
 * does, minus revocation — a deleted or disabled account keeps passing until
 * its token expires, at most an hour. The unlock read that follows still runs
 * as that user under the Firestore rules, so this gate grants nothing on its own.
 */

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const DEFAULT_CERT_TTL_MS = 60 * 60 * 1000;
/** How soon after a fetch an unknown key id may trigger another one. */
const CERT_REFETCH_FLOOR_MS = 60 * 1000;

export type TokenCheck =
  | { ok: true; uid: string }
  /** The token is not a valid, current one for this project: sign in again. */
  | { ok: false; kind: "rejected"; reason: string }
  /** We could not get what we needed to decide (Google's certificates were
      unreachable, or this deployment isn't configured). Says nothing about the
      token, so it must not read as "signed out". */
  | { ok: false; kind: "unavailable"; reason: string };

/** Resolves a token's `kid` to Google's public key, or null if there is none. */
export type KeyResolver = (kid: string) => Promise<KeyObject | null>;

let certCache: { keys: Map<string, KeyObject>; fetchedAt: number; expiresAt: number } | null = null;

async function loadCerts(now: number): Promise<Map<string, KeyObject>> {
  const response = await fetch(CERTS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`certificate fetch HTTP ${response.status}`);
  const pems = (await response.json()) as Record<string, string>;
  const keys = new Map<string, KeyObject>();
  for (const [kid, pem] of Object.entries(pems)) keys.set(kid, createPublicKey(pem));
  const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") ?? "")?.[1];
  const ttl = maxAge ? Number(maxAge) * 1000 : DEFAULT_CERT_TTL_MS;
  certCache = { keys, fetchedAt: now, expiresAt: now + ttl };
  return keys;
}

/** Google's real keys, cached for as long as Google says they may be. */
export const googleKeyResolver: KeyResolver = async (kid) => {
  const now = Date.now();
  if (certCache && now < certCache.expiresAt) {
    const hit = certCache.keys.get(kid);
    if (hit) return hit;
    // Google rotates keys; an unknown id may just be a new one. Look again, but
    // not on every request, so junk tokens can't make us hammer their endpoint.
    if (now - certCache.fetchedAt < CERT_REFETCH_FLOOR_MS) return null;
  }
  return (await loadCerts(now)).get(kid) ?? null;
};

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
  options: { resolveKey?: KeyResolver; nowSeconds?: number } = {},
): Promise<TokenCheck> {
  const rejected = (reason: string): TokenCheck => ({ ok: false, kind: "rejected", reason });
  const parts = idToken.split(".");
  if (parts.length !== 3) return rejected("not a JWT");
  const [headerPart, payloadPart, signaturePart] = parts;
  const header = decodePart(headerPart);
  const payload = decodePart(payloadPart);
  if (!header || !payload) return rejected("malformed token");
  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    return rejected("unexpected signing algorithm");
  }

  let key: KeyObject | null;
  try {
    key = await (options.resolveKey ?? googleKeyResolver)(header.kid);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, kind: "unavailable", reason };
  }
  if (!key) return rejected("unknown signing key");

  let signatureValid = false;
  try {
    signatureValid = createVerify("RSA-SHA256")
      .update(`${headerPart}.${payloadPart}`)
      .verify(key, Buffer.from(signaturePart, "base64url"));
  } catch {
    signatureValid = false;
  }
  if (!signatureValid) return rejected("bad signature");

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return rejected("token expired");
  if (typeof payload.iat !== "number" || payload.iat > now + 300) {
    return rejected("token issued in the future");
  }
  if (payload.aud !== projectId) return rejected("wrong audience");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return rejected("wrong issuer");
  if (typeof payload.sub !== "string" || !payload.sub) return rejected("no subject");
  return { ok: true, uid: payload.sub };
}
