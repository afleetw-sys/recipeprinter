import { recipePrinterUnlockPath } from "@/lib/firebase/recipePrinterPaths";
import { verifyFirebaseIdToken, type TokenCheck } from "@/lib/server/firebaseIdToken";

/**
 * Server-side proof that the caller paid for a particular cookbook.
 *
 * Everything that decided this before now lived in the browser:
 * `cookbookLocked` changed a button's label, and the unlock cache is a
 * `localStorage` key anyone can write. `/api/cookbook-pdf` asked for none of it
 * — no token, no entitlement, no identity — so the paid renderer answered to
 * anybody who could form a POST.
 *
 * Note what the existing server-owned entitlement work did and did not cover.
 * `firestore.rules` denies every client write to `cookbookUnlocks`, so nobody
 * can grant themselves the unlock DOCUMENT. That is real, and it is what makes
 * the check below trustworthy. It just never protected the RENDERER, which is
 * the thing the document is supposed to be permission for.
 *
 * Deliberately no `firebase-admin` and no service account. Both checks below go
 * through Google's REST APIs using credentials this deployment already has:
 *
 *  - the ID token is verified by exchanging it at Identity Toolkit, which
 *    accepts the public web API key. A forged or expired token fails there.
 *  - the unlock is then read from Firestore AS THAT USER, so the same
 *    `allow read: if owns(uid)` rule that governs the browser governs this. The
 *    server gains no authority the user doesn't have, which means a bug here
 *    can't turn into a way to read someone else's data.
 */

const FIRESTORE_BASE = "https://firestore.googleapis.com/v1/projects";

function config() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  return apiKey && projectId ? { apiKey, projectId } : null;
}

/** Whether this deployment can check entitlement at all. */
export function cookbookAccessConfigured(): boolean {
  return config() !== null;
}

/** The bearer token on the request, if any. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

export type { TokenCheck };

/**
 * What this ID token is worth. Verified locally — see `firebaseIdToken.ts` for
 * why this no longer asks Identity Toolkit — and every failure is logged with
 * its reason, since this once collapsed to `null` and left nothing to debug.
 */
export async function checkIdToken(idToken: string): Promise<TokenCheck> {
  const cfg = config();
  if (!cfg) return { ok: false, kind: "unavailable", reason: "not configured" };
  const check = await verifyFirebaseIdToken(idToken, cfg.projectId);
  if (!check.ok) console.warn(`cookbook-pdf: token check ${check.kind}: ${check.reason}`);
  return check;
}

/**
 * Reads one document as the token's owner.
 *
 * Three outcomes, not two, and the distinction matters more than it looks.
 * Firestore answers `404` for "this document isn't there" and `403` for
 * "you may not look" — and by this point we have already verified the token
 * belongs to this uid, so a `403` cannot mean "not their book". It means our
 * access is wrong: a rules change, a path change, App Check enforcement being
 * switched on. Folding that into `false` would tell every paying customer their
 * cookbook was never purchased, which is the single worst thing this route can
 * say. So it is reported separately and the caller turns it into "try again".
 */
type DocumentLookup = "found" | "absent" | "denied";

async function readDocument(
  projectId: string,
  segments: readonly string[],
  idToken: string,
): Promise<DocumentLookup> {
  const path = segments.map(encodeURIComponent).join("/");
  const url = `${FIRESTORE_BASE}/${encodeURIComponent(projectId)}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${idToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.ok) return "found";
  if (response.status === 404) return "absent";
  return "denied";
}

/**
 * Whether this account holds the unlock for this book.
 *
 * Checks the namespaced path and then the pre-namespace one, matching
 * `loadCookbookProjectUnlock` on the client — a customer who bought before the
 * paths moved must not be told they didn't.
 *
 * Throws rather than returning false when Firestore couldn't be reached at all,
 * so the caller can answer "try again" instead of "you didn't pay for this".
 * Telling a paying customer their purchase doesn't exist because of a network
 * blip is the one failure mode worth writing extra code to avoid.
 */
export async function hasCookbookUnlock(
  uid: string,
  bookProjectId: string,
  idToken: string,
): Promise<boolean> {
  const cfg = config();
  if (!cfg) throw new Error("Entitlement checking is not configured.");

  const namespaced = await readDocument(
    cfg.projectId,
    recipePrinterUnlockPath(uid, bookProjectId),
    idToken,
  );
  if (namespaced === "found") return true;
  if (namespaced === "denied") {
    // Logged loudly on purpose. If this ever fires in production it is blocking
    // paying customers, and the only symptom they see is "try again" — so the
    // logs have to be the place it becomes obvious.
    console.warn("cookbook-access: denied reading the namespaced unlock; check rules / App Check");
    throw new Error("Could not read the unlock document.");
  }

  const legacy = await readDocument(
    cfg.projectId,
    ["users", uid, "cookbookUnlocks", bookProjectId],
    idToken,
  );
  if (legacy === "denied") {
    console.warn("cookbook-access: denied reading the legacy unlock; check rules / App Check");
    throw new Error("Could not read the unlock document.");
  }
  return legacy === "found";
}

/** The book id inside a render request, if the payload carries a usable one. */
export function projectIdFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const project = (payload as { project?: unknown }).project;
  if (!project || typeof project !== "object") return null;
  const id = (project as { id?: unknown }).id;
  return typeof id === "string" && id.trim() ? id : null;
}
