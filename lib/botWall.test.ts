import { describe, expect, it } from "vitest";
import { BODY_PREFIX_BYTES, INERT_MARKERS, classifyPage, type PageVerdict } from "@/lib/server/botWall";

function sample(status: number, headers: Record<string, string>, body = "") {
  return { status, headers: new Headers(headers), bodyPrefix: body };
}

/** The Cloudflare headers that sit on a large fraction of the readable web. */
const CF_ORDINARY = { server: "cloudflare", "cf-ray": "8a1b2c3d4e5f6789-LHR" };

const CHALLENGE_PAGE = `<!DOCTYPE html><html><head><title>Just a moment...</title>
<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></head>
<body><div id="challenge-running">Checking your browser</div></body></html>`;

/** A real page: long, prose-heavy, no structured data, behind Cloudflare. */
const REAL_BLOG_PAGE =
  `<!DOCTYPE html><html><head><title>Grandma's Banana Bread</title></head><body>` +
  `<article><h1>Banana Bread</h1><p>${"This is the story of the loaf. ".repeat(2000)}</p></article>` +
  `</body></html>`;

const RECIPE_JSON_LD =
  `<script type="application/ld+json">{"@type":"Recipe","name":"Borscht",` +
  `"recipeIngredient":["beets"],"recipeInstructions":["Boil them."]}</script>`;

type Case = [name: string, input: ReturnType<typeof sample>, expected: Partial<PageVerdict>];

describe("classifyPage", () => {
  // The gap this module was written to close, first in the file: a challenge
  // that answers 200 used to pass the content-type gate, yield no JSON-LD, and
  // be counted as "no recipe on that page".
  const positives: Case[] = [
    [
      "cloudflare interstitial at 200",
      sample(200, CF_ORDINARY, CHALLENGE_PAGE),
      { kind: "bot_wall", vendor: "cloudflare", confidence: "strong" },
    ],
    [
      "cf-mitigated header at 403",
      sample(403, { ...CF_ORDINARY, "cf-mitigated": "challenge" }, ""),
      { kind: "bot_wall", vendor: "cloudflare", signal: "cf-mitigated" },
    ],
    [
      "turnstile widget",
      sample(403, {}, `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>`),
      { kind: "bot_wall", vendor: "cloudflare" },
    ],
    [
      "cloudflare firewall error code 1020 needs an IP, not a browser",
      sample(403, CF_ORDINARY, "<p>Error code: 1020</p>"),
      { kind: "bot_wall", vendor: "cloudflare", signal: "cf-error-code" },
    ],
    [
      "attention required is a block, not a challenge",
      sample(403, CF_ORDINARY, "<title>Attention Required! | Cloudflare</title>"),
      { kind: "bot_wall", vendor: "cloudflare" },
    ],
    [
      // A real 429 from food52.com, captured while checking this module
      // against live sites.
      "vercel botid checkpoint",
      sample(429, { server: "Vercel", "x-vercel-mitigated": "challenge" }, "<title>Vercel Security Checkpoint</title>"),
      { kind: "bot_wall", vendor: "vercel", signal: "x-vercel-mitigated" },
    ],
    [
      "vercel checkpoint by title alone",
      sample(429, {}, "<title>Vercel Security Checkpoint</title>"),
      { kind: "bot_wall", vendor: "vercel", confidence: "strong" },
    ],
    [
      "datadome cookie",
      sample(403, { "set-cookie": "datadome=abc123; Path=/" }, ""),
      { kind: "bot_wall", vendor: "datadome" },
    ],
    [
      "datadome captcha page at 200",
      sample(200, {}, `<iframe src="https://geo.captcha-delivery.com/captcha/"></iframe>`),
      { kind: "bot_wall", vendor: "datadome" },
    ],
    [
      "perimeterx script at 200",
      sample(200, {}, "<script>window._pxAppId = 'PXabc';</script>"),
      { kind: "bot_wall", vendor: "perimeterx" },
    ],
    [
      "perimeterx cookie",
      sample(403, { "set-cookie": "_px3=deadbeef; Path=/" }, "Please verify you are a human"),
      { kind: "bot_wall", vendor: "perimeterx" },
    ],
    [
      "akamai access denied",
      sample(403, { server: "AkamaiGHost" }, "Access Denied. Reference #18.a1b2c3.1700000000"),
      { kind: "bot_wall", vendor: "akamai" },
    ],
    [
      "imperva x-iinfo",
      sample(403, { "x-iinfo": "9-12345678-0 NNNN CT(0 0 0)" }, ""),
      { kind: "bot_wall", vendor: "imperva" },
    ],
    [
      "incapsula incident in the body",
      sample(403, {}, "Request unsuccessful. Incapsula incident ID: 123-456"),
      { kind: "bot_wall", vendor: "imperva" },
    ],
    [
      "sucuri firewall",
      sample(403, { "x-sucuri-id": "12345" }, "Sucuri WebSite Firewall - Access Denied"),
      { kind: "bot_wall", vendor: "sucuri" },
    ],
    [
      "bare 403 with nothing in it is weak, not strong",
      sample(403, {}, "<html><body>Forbidden</body></html>"),
      { kind: "bot_wall", vendor: "generic", confidence: "weak" },
    ],
    [
      "429 naming unusual traffic is weak",
      sample(429, {}, `<html><body>${"padding ".repeat(400)}We detected unusual traffic.</body></html>`),
      { kind: "bot_wall", vendor: "generic", confidence: "weak" },
    ],
  ];

  // The negatives are what earn this module: every one of them is a page a
  // false positive would have us pay a scraping API to re-fetch.
  const negatives: Case[] = [
    [
      "404 from a cloudflare-fronted site is a 404",
      sample(404, CF_ORDINARY, "<h1>Page not found</h1><p>Try the recipe index.</p>"),
      { kind: "not_found" },
    ],
    ["410 gone", sample(410, CF_ORDINARY, ""), { kind: "not_found" }],
    [
      "real recipe blog behind cloudflare with no structured data",
      sample(200, { ...CF_ORDINARY, "cf-cache-status": "HIT" }, REAL_BLOG_PAGE),
      { kind: "none" },
    ],
    [
      "soft paywall at 200",
      sample(200, {}, `<script type="application/ld+json">{"@type":"NewsArticle"}</script>Subscribe to continue reading`),
      { kind: "paywall" },
    ],
    [
      "402 payment required",
      sample(402, {}, "Subscribe to continue"),
      { kind: "paywall" },
    ],
    [
      "401 login page on a cloudflare host is an auth wall",
      sample(401, CF_ORDINARY, "<form>Sign in</form>"),
      { kind: "paywall" },
    ],
    [
      "recipe structured data beats a stray cdn-cgi reference",
      sample(200, CF_ORDINARY, `${RECIPE_JSON_LD}<img src="/cdn-cgi/image/width=800/photo.jpg">`),
      { kind: "none" },
    ],
    ["bare 503 is an overloaded host", sample(503, {}, "Service Temporarily Unavailable"), { kind: "server_error" }],
    ["500", sample(500, CF_ORDINARY, ""), { kind: "server_error" }],
    ["502", sample(502, CF_ORDINARY, ""), { kind: "server_error" }],
    ["504", sample(504, {}, "Gateway Timeout"), { kind: "server_error" }],
    [
      "403 carrying a full article is a real page, not a wall",
      sample(403, {}, `${RECIPE_JSON_LD}<article>${"words ".repeat(10000)}</article>`),
      { kind: "none" },
    ],
    ["empty 200 body", sample(200, CF_ORDINARY, ""), { kind: "none" }],
    [
      "an ordinary page served by vercel is not a checkpoint",
      sample(200, { server: "Vercel", "x-vercel-id": "cle1::abc123" }, REAL_BLOG_PAGE),
      { kind: "none" },
    ],
    [
      "a bare _abck cookie is set on ordinary pages",
      sample(200, { "set-cookie": "_abck=ABC~-1~xyz; Path=/" }, REAL_BLOG_PAGE),
      { kind: "none" },
    ],
  ];

  it.each([...positives, ...negatives])("%s", (_name, input, expected) => {
    expect(classifyPage(input)).toMatchObject(expected);
  });

  // A 503 that DOES name a vendor is the old Cloudflare JS challenge, and the
  // 5xx negative above must not swallow it.
  it("lets a fingerprinted 503 through as a wall", () => {
    const verdict = classifyPage(sample(503, CF_ORDINARY, CHALLENGE_PAGE));
    expect(verdict).toMatchObject({ kind: "bot_wall", vendor: "cloudflare" });
  });

  // The rule that would misclassify the widest swathe of the readable web.
  it("treats the ubiquitous cloudflare markers as inert on their own", () => {
    for (const marker of INERT_MARKERS) {
      const asHeader = classifyPage(sample(200, { [marker.split(":")[0]]: "1" }, REAL_BLOG_PAGE));
      const inBody = classifyPage(sample(200, {}, `${REAL_BLOG_PAGE}<!-- ${marker} -->`));
      expect(asHeader.kind, `${marker} as a header`).toBe("none");
      expect(inBody.kind, `${marker} in the body`).toBe("none");
    }
  });

  it("reads only a bounded prefix's worth", () => {
    expect(BODY_PREFIX_BYTES).toBeLessThanOrEqual(32_000);
  });
});
