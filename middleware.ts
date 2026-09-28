import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { VISITOR_COUNTRY_COOKIE } from "@/lib/usdPriceLabel";

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

/**
 * Hand the visitor's country to the browser, so prices can say "US$" outside
 * the US (see lib/visitorCurrency.ts). Vercel geolocates every request into
 * this header; there is no browser API that answers the same question, and a
 * locale or timezone is where someone's settings are, not where they are.
 * Readable by script on purpose, since reading it is the whole job. Only a
 * country code, and only rewritten when it changes.
 */
function withVisitorCountry(request: NextRequest, response: NextResponse): NextResponse {
  const country = request.headers.get("x-vercel-ip-country")?.toUpperCase();
  if (!country || !/^[A-Z]{2}$/.test(country)) return response;
  if (request.cookies.get(VISITOR_COUNTRY_COOKIE)?.value === country) return response;
  response.cookies.set(VISITOR_COUNTRY_COOKIE, country, {
    path: "/",
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
    secure: true,
  });
  return response;
}

export function middleware(request: NextRequest) {
  if (process.env.VERCEL_ENV !== "production") {
    return withVisitorCountry(request, NextResponse.next());
  }

  const host = request.headers.get("host")?.toLowerCase();
  if (!host || host === CANONICAL_HOST || host === "recipeprinter.com") {
    return withVisitorCountry(request, NextResponse.next());
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
