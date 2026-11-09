import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VISITOR_COUNTRY_COOKIE } from "@/lib/usdPriceLabel";
import {
  ANONYMOUS_OWNER_COOKIE,
  ANONYMOUS_OWNER_COOKIE_MAX_AGE_S,
  isAnonymousOwnerId,
} from "@/lib/anonymousOwner";

/**
 * Send the production deployment's own `*.vercel.app` alias to the real domain.
 *
 * `recipeprinter-1zf6.vercel.app` serves the identical, fully working app:
 * 200, `robots.txt` saying `Allow: /`, no `noindex` header. Anyone who lands
 * there can import, edit, and BUY — the purchase reaches Stripe and RevenueCat
 * exactly as it should.
 *
 * What they cannot do is show up in analytics. `isProductionRuntime()` gates
 * PostHog on the hostname (see lib/appEnvironment.ts), so on that alias
 * `initAnalytics()` returns before doing anything: no pageview, no events, no
 * session recording, for the entire visit. The same flag is only a LABEL on
 * the RevenueCat side — it sets `environment: "development"` on the customer
 * and blocks nothing.
 *
 * So a real customer buying from that URL produces a charge in two systems and
 * complete silence in the third, which is exactly the "entire sessions are
 * missing" hole this exists to close. The canonical host is where everyone
 * should have been anyway; this stops the other one being a usable front door.
 *
 * PREVIEW DEPLOYS ARE DELIBERATELY LEFT ALONE. They are `VERCEL_ENV=preview`
 * and their whole purpose is to be opened on a `*.vercel.app` URL; redirecting
 * them to production would make every PR preview point at the wrong build.
 */
const CANONICAL_HOST = "www.recipeprinter.com";
const VISITOR_REGION_COOKIE = "rp_region";

/**
 * Hand the visitor's country to the browser, so prices can say "US$" outside
 * the US (see lib/visitorCurrency.ts). Vercel geolocates every request into
 * this header; there is no browser API that answers the same question, and a
 * locale or timezone is where someone's settings are, not where they are.
 * Readable by script on purpose, since reading it is the whole job. Only a
 * country code (and a state code, below), each only rewritten when it changes.
 */
function withVisitorCountry(request: NextRequest, response: NextResponse): NextResponse {
  const country = request.headers.get("x-vercel-ip-country")?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) return response;
  const cookie = { path: "/", maxAge: 60 * 60 * 24, sameSite: "lax", secure: true } as const;
  if (request.cookies.get(VISITOR_COUNTRY_COOKIE)?.value !== country) {
    response.cookies.set(VISITOR_COUNTRY_COOKIE, country, cookie);
  }
  // The state or province too (e.g. "CA"), only for the ad tags: Reddit's
  // Limited Data Use needs it to know which state's privacy law applies
  // (lib/adTags.ts). Still no more precise than that.
  const region = request.headers.get("x-vercel-ip-country-region")?.toUpperCase();
  if (region && /^[A-Z0-9]{1,3}$/.test(region) && request.cookies.get(VISITOR_REGION_COOKIE)?.value !== region) {
    response.cookies.set(VISITOR_REGION_COOKIE, region, cookie);
  }
  return response;
}

/**
 * Send the browser's anonymous id back as a cookie the server set.
 *
 * The free import meter counts a signed-out cook by `rp_anon`
 * (lib/anonymousOwner.ts). Set only by script, WebKit (every iOS browser) keeps
 * it 7 days at most, 24 hours after a Google arrival; a cookie in a server
 * response has no such cap. Only an id the browser already holds is refreshed:
 * minting one here could outrank an older id in its localStorage and reset that
 * cook's count, which is the bypass this closes.
 */
function withAnonymousOwner(request: NextRequest, response: NextResponse): NextResponse {
  const id = request.cookies.get(ANONYMOUS_OWNER_COOKIE)?.value;
  if (!isAnonymousOwnerId(id)) return response;
  response.cookies.set(ANONYMOUS_OWNER_COOKIE, id, {
    path: "/",
    maxAge: ANONYMOUS_OWNER_COOKIE_MAX_AGE_S,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });
  return response;
}

/** What every page that isn't redirected carries back. */
function pageResponse(request: NextRequest): NextResponse {
  return withAnonymousOwner(request, withVisitorCountry(request, NextResponse.next()));
}

export function middleware(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return pageResponse(request);
  }

  const host = request.headers.get("host")?.toLowerCase();
  if (!host || host === CANONICAL_HOST || host === "recipeprinter.com") {
    return pageResponse(request);
  }

  const url = request.nextUrl.clone();
  url.protocol = "https:";
  url.host = CANONICAL_HOST;
  url.port = "";
  // 308 rather than 302: the alias is not a temporary home, and a permanent
  // redirect is what tells a search engine to stop offering it as a result.
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Everything a person can land on. Static assets and image optimisation are
  // excluded: they are fetched by a page that has already been redirected, and
  // bouncing them across hosts only adds a round trip.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|images/|ingest/).*)"],
};
