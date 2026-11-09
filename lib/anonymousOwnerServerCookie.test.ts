import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";
import { ANONYMOUS_OWNER_COOKIE } from "@/lib/anonymousOwner";

/* The free import meter counts a signed-out cook by `rp_anon`. Written only by
   script, WebKit (every iOS browser) keeps that cookie 7 days at most, 24 hours
   after a Google arrival, so on 2026-11-08 a cook (PostHog recording 01a1bd51,
   Chrome on iPad) opened a new tab with no cookie and no stored id, was minted
   a new one, and got 10 more imports. A cookie the server sets has no such cap,
   so every page response refreshes the one the browser already holds. */

const ID = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

function pageRequest(host: string, cookie?: string) {
  return new NextRequest(`https://${host}/print`, {
    headers: { host, ...(cookie ? { cookie } : {}) },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the anonymous id cookie", () => {
  it("comes back from the server on every page, long-lived, and is never invented or echoed when mangled", () => {
    const environments: Array<[string, string]> = [
      ["production", "www.recipeprinter.com"],
      ["production", "recipeprinter.com"],
      ["preview", "recipeprinter-git-x.vercel.app"],
      ["development", "localhost:3000"],
    ];
    for (const [env, host] of environments) {
      vi.stubEnv("VERCEL_ENV", env);
      const where = `${env} ${host}`;

      const refreshed = middleware(pageRequest(host, `${ANONYMOUS_OWNER_COOKIE}=${ID}`)).cookies.get(
        ANONYMOUS_OWNER_COOKIE,
      );
      expect(refreshed?.value, where).toBe(ID);
      expect(refreshed?.maxAge, where).toBe(400 * 24 * 60 * 60);
      expect(refreshed?.path, where).toBe("/");

      // No cookie: the browser mints the id (it may hold one in localStorage
      // that must win), so the server does not.
      expect(middleware(pageRequest(host)).cookies.get(ANONYMOUS_OWNER_COOKIE), where).toBeUndefined();
      // A value CookPilot would refuse is not given another 400 days.
      expect(
        middleware(pageRequest(host, `${ANONYMOUS_OWNER_COOKIE}=bad;id`)).cookies.get(ANONYMOUS_OWNER_COOKIE),
        where,
      ).toBeUndefined();
    }
  });
});
