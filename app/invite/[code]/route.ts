import { NextResponse, type NextRequest } from "next/server";
import { INVITE_COOKIE, INVITE_COOKIE_MAX_AGE_S, REFERRALS_LIVE, normalizeInviteCode } from "@/lib/referral";

/**
 * A friend's invite link: recipeprinter.com/invite/{code}.
 *
 * Hands the code to the browser in a short-lived cookie and sends the visitor
 * straight to the homepage. The code never appears in a URL the app renders, so
 * PostHog's pageview never records it, and it stays clear of `?ref=`, which is
 * traffic attribution (lib/attribution.ts). The homepage reads the cookie,
 * records the open with CookPilot and forgets it (lib/referral.ts).
 *
 * While the program is hidden (`REFERRALS_LIVE` off) a link still lands on the
 * homepage, with nothing to claim.
 */
export function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const home = new URL("/", request.url);
  const response = NextResponse.redirect(home, 302);
  const code = normalizeInviteCode(params.code);
  if (code && REFERRALS_LIVE) {
    response.cookies.set(INVITE_COOKIE, code, {
      path: "/",
      maxAge: INVITE_COOKIE_MAX_AGE_S,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }
  // Per-person and never worth indexing.
  response.headers.set("X-Robots-Tag", "noindex");
  return response;
}
