import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

/**
 * The signed-in billing portal link behind "Manage subscription" and
 * "Resubscribe" (see the route's own doc comment).
 *
 * Its answers decide what those buttons do, so each one is pinned:
 * - a link → open the portal, no email step;
 * - 404 → there is no web subscription behind this cook's Pro, which is the
 *   one case where Resubscribe may open a fresh checkout without risking a
 *   second subscription on top of a live one;
 * - anything else → fall back to RevenueCat's emailed sign-in, never checkout.
 */

// `vi.mock` is hoisted above the imports, so the spy has to be too.
const { verifyFirebaseIdToken } = vi.hoisted(() => ({ verifyFirebaseIdToken: vi.fn() }));
vi.mock("@/lib/server/firebaseIdToken", () => ({ verifyFirebaseIdToken }));


const ENV = {
  REVENUECAT_SECRET_KEY: "sk_test",
  REVENUECAT_PROJECT_ID: "proj_test",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-recipeprinter",
};

function request(token?: string) {
  return new Request("http://localhost/api/pro/manage", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

type Sub = { id: string; store?: string; gives_access?: boolean; starts_at?: number };

/** RevenueCat's v2 API, answering only the two calls the route makes. */
function revenueCat(subscriptions: Sub[], portal: Record<string, unknown> = { management_url: "https://billing.revenuecat.com/manage/abc" }) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string) => {
    calls.push(url);
    if (url.includes("/customers/")) return Response.json({ items: subscriptions });
    if (url.endsWith("/authenticated_management_url")) return Response.json(portal);
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  verifyFirebaseIdToken.mockResolvedValue({ ok: true, uid: "user-1" });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  verifyFirebaseIdToken.mockReset();
});

describe("POST /api/pro/manage", () => {
  test("hands back the signed-in portal link for the cook's web subscription", async () => {
    const calls = revenueCat([{ id: "sub_web", store: "rc_billing", gives_access: true }]);
    const response = await POST(request("token"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://billing.revenuecat.com/manage/abc" });
    // Looked up as the token's owner, never anyone named in the request.
    expect(calls[0]).toContain("/customers/user-1/subscriptions");
    expect(calls[1]).toContain("/subscriptions/sub_web/authenticated_management_url");
  });

  test("prefers the subscription still granting access, then the newest", async () => {
    const calls = revenueCat([
      { id: "old_lapsed", store: "rc_billing", gives_access: false, starts_at: 3 },
      { id: "canceled_but_running", store: "rc_billing", gives_access: true, starts_at: 1 },
      { id: "newer_running", store: "rc_billing", gives_access: true, starts_at: 2 },
    ]);
    await POST(request("token"));
    expect(calls[1]).toContain("/subscriptions/newer_running/");
  });

  test("ignores app-store subscriptions, which RevenueCat's portal can't manage", async () => {
    const calls = revenueCat([
      { id: "ios", store: "app_store", gives_access: true },
      { id: "web", store: "rc_billing", gives_access: true },
    ]);
    await POST(request("token"));
    expect(calls[1]).toContain("/subscriptions/web/");
  });

  test("404 when Pro has no web subscription behind it (a promotional grant)", async () => {
    revenueCat([{ id: "promo", store: "promotional", gives_access: true }]);
    const response = await POST(request("token"));
    expect(response.status).toBe(404);
  });

  test("never 404s on a RevenueCat failure — that would let Resubscribe sell a second subscription", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const response = await POST(request("token"));
    expect(response.status).not.toBe(404);
    expect(response.status).toBe(502);
  });

  test("never hands back a link that isn't https", async () => {
    revenueCat([{ id: "web", store: "rc_billing", gives_access: true }], { management_url: "javascript:alert(1)" });
    const response = await POST(request("token"));
    expect(response.status).toBe(502);
  });

  test("401 with no sign-in token", async () => {
    revenueCat([]);
    expect((await POST(request())).status).toBe(401);
  });

  test("401 for a token that doesn't verify", async () => {
    revenueCat([]);
    verifyFirebaseIdToken.mockResolvedValue({ ok: false, kind: "rejected", reason: "bad signature" });
    expect((await POST(request("forged"))).status).toBe(401);
  });

  test("503, not 404, when the deployment has no RevenueCat key", async () => {
    vi.stubEnv("REVENUECAT_SECRET_KEY", "");
    expect((await POST(request("token"))).status).toBe(503);
  });
});
