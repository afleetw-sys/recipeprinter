import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The route's two legs with the network played by a stub: CookPilot's parser
// (it fetches and reads), then our own fetch handed to CookPilot to read. What
// is under test is which requests the route makes after CookPilot has answered,
// and what it hands on.
const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
vi.mock("node:dns/promises", () => ({ lookup: () => lookup() }));

import { POST } from "@/app/api/parse/route";
import { __resetRateLimitsForTest } from "@/lib/server/rateLimit";

const PARSER = "https://parser.invalid/parse";
const SUPPLIED = "https://parser.invalid/supplied";

let requested: Array<{ url: string; body?: { html?: string } }> = [];

function network(reply: (url: string) => Response) {
  requested = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      requested.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
      return reply(url);
    }),
  );
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function importLink(url: string) {
  const response = await POST(
    new Request("http://localhost/api/parse", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.60" },
      body: JSON.stringify({ url }),
    }),
  );
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

beforeEach(() => {
  __resetRateLimitsForTest();
  vi.stubEnv("COOKPILOT_RECIPE_PARSER_URL", PARSER);
  vi.stubEnv("COOKPILOT_SUPPLIED_HTML_PARSER_URL", SUPPLIED);
  vi.stubEnv("RECIPEPRINTER_PARSER_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/api/parse when CookPilot read the page and found no recipe", () => {
  // CookPilot said where the recipe was. The route fetched the post itself,
  // had the same parser read it again, and answered "we couldn't find a
  // complete recipe on that page": three requests for a worse answer.
  it("hands on what CookPilot said and asks nothing further", async () => {
    const said =
      "We read this post, but it says the recipe is in the comments, which we can't see. " +
      "Open the comments, copy the recipe and paste it here.";
    network((url) =>
      url === PARSER
        ? json(404, { error: said, code: "not-found" })
        : new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );

    const { body } = await importLink("https://www.instagram.com/p/ABC123/");

    expect(body.success).toBe(false);
    expect(body.error).toBe(said);
    expect(body.parserExhausted).toBe(true);
    expect(requested.map((request) => request.url)).toEqual([PARSER]);
  });

  it("still reads the page itself when the 404 is not the parser's answer", async () => {
    // A mistyped endpoint or a missing function also answers 404, with no
    // verdict in it. That says nothing about the recipe page.
    network((url) => {
      if (url === PARSER) return new Response("<html>Not Found</html>", { status: 404 });
      if (url === SUPPLIED) return json(422, { error: "No recipe found on that page", verdict: { kind: "none" } });
      return new Response("<html><body>hello</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    });

    await importLink("https://www.example-blog.org/stew");

    expect(requested.map((request) => request.url)).toContain(SUPPLIED);
  });
});

// What production sends since 2026-11-10: the cause in `reason`, the sentence
// for the cook in `error`.
const SITE_UNREACHABLE = {
  error: "We couldn't reach that website. Try again in a few minutes, or paste the recipe text instead.",
  code: "unavailable",
  reason: "site-unreachable",
};

describe("/api/parse when CookPilot explained the failure", () => {
  // A paywall, a Facebook login or a PDF used to reach the cook as "this site
  // blocks anything automated", and "page not found" as generic no-recipe copy.
  it("hands on CookPilot's message for a final answer", async () => {
    const final: Array<[status: number, code: string, reason: string, error: string, failure: string]> = [
      [412, "failed-precondition", "paywall", "That page is behind a paywall or sign-in.", "blocked"],
      [412, "failed-precondition", "pdf-not-supported", "This link opens a PDF, and we can't read PDFs yet.", "blocked"],
      [404, "not-found", "page-not-found", "We couldn't find that page, the link may be cut off.", "not_found"],
      [404, "not-found", "recipe-in-comments", "We read this post, but the recipe is in the comments.", "no_recipe"],
    ];
    for (const [status, code, reason, error, failure] of final) {
      network((url) =>
        url === PARSER
          ? json(status, { error, code, reason })
          : new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
      );

      const { body } = await importLink("https://www.example-blog.org/stew");

      expect(body.error, reason).toBe(error);
      expect(body.failure, reason).toBe(failure);
      expect(body.parserExhausted, reason).toBe(true);
      expect(requested.map((request) => request.url), reason).toEqual([PARSER]);
    }
  });

  // A 503 or 504 is CookPilot's network failing, not the page: ours often gets
  // through, so we still try. When ours fails too, CookPilot's reason stands.
  it("hands on CookPilot's message when our own fetch fails too", async () => {
    const refused = {
      error: "That website wouldn't let us read this page. Paste the recipe text, or import a screenshot of it.",
      code: "unavailable",
      reason: "site-refused",
    };
    const timedOut = { error: "That page took too long to load.", code: "deadline-exceeded", reason: "timed-out" };
    const ourFetchFails: Array<[string, (url: string) => Response]> = [
      ["site answers 403", () => new Response("<html>Forbidden</html>", { status: 403 })],
      ["site answers 500", () => new Response("oops", { status: 500 })],
      ["site unreachable", () => { throw new TypeError("fetch failed"); }],
      ["200 challenge page", () => new Response("<html>Just a moment</html>", { status: 200, headers: { "content-type": "text/html" } })],
    ];
    for (const [parserStatus, said] of [[503, refused], [503, SITE_UNREACHABLE], [504, timedOut]] as const) {
      for (const [how, site] of ourFetchFails) {
        network((url) => {
          if (url === PARSER) return json(parserStatus, said);
          if (url === SUPPLIED) {
            return how === "200 challenge page"
              ? json(422, { verdict: { kind: "bot_wall", vendor: "cloudflare" } })
              : json(422, { verdict: { kind: how === "site answers 500" ? "server_error" : "none" } });
          }
          return site(url);
        });

        const { body } = await importLink("https://www.example-blog.org/stew");

        expect(body.error, `${said.reason}, ${how}`).toBe(said.error);
        expect(requested.map((request) => request.url), `${said.reason}, ${how}`).toContain(
          "https://www.example-blog.org/stew",
        );
      }
    }
  });

  it("still imports the recipe when our own fetch gets through", async () => {
    network((url) => {
      if (url === PARSER) return json(503, SITE_UNREACHABLE);
      if (url === SUPPLIED) {
        return json(200, {
          recipe: {
            title: "Stew",
            ingredientSections: [{ ingredients: [{ name: "beef" }] }],
            instructionSections: [{ instructions: [{ text: "Simmer." }] }],
          },
        });
      }
      return new Response("<html>stew</html>", { status: 200, headers: { "content-type": "text/html" } });
    });

    const { body } = await importLink("https://www.example-blog.org/stew");

    expect(body.success).toBe(true);
  });
});

describe("/api/parse reading a page that is not UTF-8", () => {
  // Our fetch decoded every page as UTF-8, so a windows-1252 page reached the
  // parser as "Cr�me br�l�e". CookPilot's own fetch reads such a
  // page as Latin-1; this leg now reads it the same way.
  it("hands the parser the page's own letters", async () => {
    const page =
      "<html><head><title>Crème brûlée</title></head><body><h1>Crème brûlée</h1>" +
      "<ul><li>500 ml crème fraîche</li><li>½ gousse de vanille</li></ul></body></html>";
    const pages: Array<[string, Uint8Array]> = [
      ["windows-1252", Uint8Array.from(page, (character) => character.charCodeAt(0))],
      ["utf-8", new TextEncoder().encode(page)],
    ];
    for (const [charset, bytes] of pages) {
      network((url) => {
        if (url === PARSER) return json(503, SITE_UNREACHABLE);
        if (url === SUPPLIED) return json(422, { error: "No recipe found on that page", verdict: { kind: "none" } });
        return new Response(new Blob([bytes as BlobPart]), { status: 200, headers: { "content-type": `text/html; charset=${charset}` } });
      });

      await importLink("https://www.example-blog.org/creme-brulee");

      expect(requested.find((request) => request.url === SUPPLIED)?.body?.html).toBe(page);
    }
  });
});

describe("/api/parse when neither reader answered at all", () => {
  // 2026-10-22: every CookPilot function answered a bare 500 for an hour. The
  // route took the parser's 500 as inconclusive, fetched the Instagram reel
  // itself, got a bare 500 from the second reader too, and told the cook there
  // was no complete recipe on a page nobody had read.
  it("says the fault is ours, not the page's", async () => {
    const bare500 = () => new Response("Internal Server Error", { status: 500 });
    for (const parserDown of [bare500, () => { throw new TypeError("fetch failed"); }]) {
      network((url) => {
        if (url === PARSER || url === SUPPLIED) return parserDown();
        return new Response("<html><body>a reel</body></html>", { status: 200, headers: { "content-type": "text/html" } });
      });

      const { body } = await importLink("https://www.instagram.com/reel/DezODG1iNLy/");

      expect(body.success).toBe(false);
      expect(body.failure).toBe("backend_unavailable");
    }
  });
});
