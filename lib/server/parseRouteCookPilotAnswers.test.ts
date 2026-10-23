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
        if (url === PARSER) return json(503, { error: "Failed to fetch the URL (unreachable)", code: "unavailable" });
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
