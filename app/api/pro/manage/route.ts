import { NextResponse } from "next/server";
import { verifyFirebaseIdToken } from "@/lib/server/firebaseIdToken";

export const runtime = "nodejs";

/**
 * A billing-portal link the signed-in subscriber can open straight away.
 *
 * `customerInfo.managementURL` from the browser SDK is RevenueCat's generic
 * portal entry: it asks for an email address and mails a sign-in link, so a
 * cook who wanted to cancel had to leave for their inbox first. They are
 * already signed in to us, and their RevenueCat app user id IS their Firebase
 * uid, so the server can ask RevenueCat for the per-subscription link that is
 * already authenticated (API v2, `authenticated_management_url`) instead.
 *
 * Needs a v2 secret key with subscription read access in
 * `REVENUECAT_SECRET_KEY`, and `REVENUECAT_PROJECT_ID`. When either is missing,
 * or RevenueCat says no, the answer is a 404/503 and the client falls back to
 * the email flow — never worse than before.
 */

const API = "https://api.revenuecat.com/v2";

interface RcSubscription {
  id: string;
  store?: string;
  status?: string;
  gives_access?: boolean;
  starts_at?: number;
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function rc<T>(path: string, secret: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
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

/** The subscription the portal should open on: a Web Billing one (the only
    store whose portal is RevenueCat's), preferring one that still grants
    access, then the newest. */
function pickSubscription(items: RcSubscription[]): RcSubscription | null {
  const web = items.filter((sub) => sub.store === "rc_billing");
  if (web.length === 0) return null;
  return [...web].sort(
    (a, b) =>
      Number(Boolean(b.gives_access)) - Number(Boolean(a.gives_access)) ||
      (b.starts_at ?? 0) - (a.starts_at ?? 0),
  )[0];
}

export async function POST(request: Request) {
  const secret = process.env.REVENUECAT_SECRET_KEY?.trim();
  const projectId = process.env.REVENUECAT_PROJECT_ID?.trim();
  const firebaseProject = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!secret || !projectId || !firebaseProject) return fail(503, "not configured");

  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!idToken) return fail(401, "sign in required");
  const check = await verifyFirebaseIdToken(idToken, firebaseProject);
  if (!check.ok) {
    console.warn(`pro-manage: token check ${check.kind}: ${check.reason}`);
    return fail(check.kind === "rejected" ? 401 : 503, "sign in required");
  }

  try {
    const customer = encodeURIComponent(check.uid);
    const list = await rc<{ items?: RcSubscription[] }>(
      `/projects/${encodeURIComponent(projectId)}/customers/${customer}/subscriptions?limit=50`,
      secret,
    );
    const subscription = pickSubscription(list.items ?? []);
    if (!subscription) return fail(404, "no web subscription");

    const link = await rc<{ management_url?: string; url?: string }>(
      `/projects/${encodeURIComponent(projectId)}/subscriptions/${encodeURIComponent(subscription.id)}/authenticated_management_url`,
      secret,
    );
    const url = link.management_url ?? link.url;
    if (!url || !/^https:\/\//i.test(url)) return fail(502, "no portal link");
    return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.warn("pro-manage:", error instanceof Error ? error.message : error);
    return fail(502, "portal unavailable");
  }
}
