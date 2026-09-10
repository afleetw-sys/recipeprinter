import { beforeEach, describe, expect, it, vi } from "vitest";
import { browserHeaders, rescueBotWall, rescueExhausted, type RescueDeps } from "@/lib/server/botRescue";
import type { PageVerdict } from "@/lib/server/botWall";

const WALL: PageVerdict = {
  kind: "bot_wall",
  vendor: "cloudflare",
  signal: "cf-mitigated",
  confidence: "strong",
  needsJs: true,
};

const RECIPE_HTML =
  `<html><head><script type="application/ld+json">{"@type":"Recipe","name":"Borscht",` +
  `"recipeIngredient":["beets"],"recipeInstructions":["Boil them."]}</script></head><body></body></html>`;

const CHALLENGE_HTML = `<html><head><title>Just a moment...</title>
<script src="/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1"></script></head></html>`;

function htmlResponse(body: string, status = 200, headers: Record<string, string> = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

let fetchPage: ReturnType<typeof vi.fn>;

function deps(): RescueDeps {
  return {
    fetchPage: fetchPage as unknown as RescueDeps["fetchPage"],
    readHtml: (response) => response.text(),
  };
}

function ctx(overrides: Partial<Parameters<typeof rescueBotWall>[0]> = {}) {
  return {
    url: new URL("https://smittenkitchen.com/borscht"),
    verdict: WALL,
    caller: "203.0.113.7",
    deadlineAt: Date.now() + 60_000,
    ...overrides,
  };
}

beforeEach(() => {
  fetchPage = vi.fn(async () => htmlResponse(RECIPE_HTML));
});

describe("rescueBotWall", () => {
  it("retries a confirmed wall and returns the page", async () => {
    const report = await rescueBotWall(ctx(), deps());
    expect(report).toMatchObject({ outcome: "a_headers", html: RECIPE_HTML });
    expect(fetchPage).toHaveBeenCalledOnce();
  });

  // The whole point of the classifier. Each of these is a page a rescue would
  // re-fetch for nothing, and the paid rung would re-fetch for money.
  const neverRescued: PageVerdict[] = [
    { kind: "not_found" },
    { kind: "paywall", signal: "http-402" },
    { kind: "server_error" },
    { kind: "none" },
  ];

  it.each(neverRescued)("never fetches for a $kind verdict", async (verdict) => {
    const report = await rescueBotWall(ctx({ verdict }), deps());
    expect(report).toEqual({ outcome: "skipped_budget" });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("never fetches for a placeholder host", async () => {
    const report = await rescueBotWall(ctx({ url: new URL("https://example.com/borscht") }), deps());
    expect(report).toEqual({ outcome: "skipped_budget" });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("declines to start when there is not enough time left", async () => {
    const report = await rescueBotWall(ctx({ deadlineAt: Date.now() + 2_000 }), deps());
    expect(report).toEqual({ outcome: "skipped_budget" });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  // Getting the interstitial a second time is not a rescue. Without this the
  // challenge page reaches the JSON-LD reader and is reported as "no recipe on
  // that page" all over again, which is the bug this whole change exists for.
  it("does not count a second interstitial as a rescue", async () => {
    fetchPage.mockResolvedValue(htmlResponse(CHALLENGE_HTML));
    expect(await rescueBotWall(ctx(), deps())).toEqual({ outcome: "none" });
  });

  it("gives up on a non-2xx retry", async () => {
    fetchPage.mockResolvedValue(htmlResponse("", 403));
    expect(await rescueBotWall(ctx(), deps())).toEqual({ outcome: "none" });
  });

  it("gives up when the retry is not html", async () => {
    fetchPage.mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json" } }));
    expect(await rescueBotWall(ctx(), deps())).toEqual({ outcome: "none" });
  });

  // A rescue that throws has to leave the original failure intact rather than
  // replacing it with a worse one.
  it("never throws when a rung blows up", async () => {
    fetchPage.mockRejectedValue(new Error("ECONNRESET"));
    expect(await rescueBotWall(ctx(), deps())).toEqual({ outcome: "none" });
  });

  it("runs at most one ladder per call", async () => {
    await rescueBotWall(ctx(), deps());
    expect(fetchPage).toHaveBeenCalledOnce();
  });

  it("clips the rung timeout to the time actually left", async () => {
    await rescueBotWall(ctx({ deadlineAt: Date.now() + 9_000 }), deps());
    const [, , timeoutMs] = fetchPage.mock.calls[0];
    expect(timeoutMs).toBeGreaterThan(0);
    expect(timeoutMs).toBeLessThan(9_000);
  });
});

describe("browserHeaders", () => {
  const headers = browserHeaders(new URL("https://smittenkitchen.com/borscht"));

  it("sends the sec-fetch set a real navigation carries", () => {
    expect(headers["sec-fetch-dest"]).toBe("document");
    expect(headers["sec-fetch-mode"]).toBe("navigate");
    expect(headers["sec-ch-ua-platform"]).toBe('"macOS"');
  });

  // The tells in the ordinary request, which is what rung A exists to drop.
  it("drops the no-cache tell a browser never sends", () => {
    expect(headers).not.toHaveProperty("cache-control");
    expect(headers).not.toHaveProperty("pragma");
  });

  it("refers from the site's own origin, not a search it never made", () => {
    expect(headers.referer).toBe("https://smittenkitchen.com/");
  });

  // Brotli would return binary if undici does not transparently decompress it,
  // and binary reads as "no recipe" rather than as an error.
  it("asks only for encodings we know we can read", () => {
    expect(headers["accept-encoding"]).toBe("gzip, deflate");
  });
});

describe("rescueExhausted", () => {
  // The distinction that decides whether the client still tries the callable
  // on its own, different egress IP.
  it("is true only when every rung actually ran", () => {
    expect(rescueExhausted("none")).toBe(true);
    expect(rescueExhausted("skipped_budget")).toBe(false);
    expect(rescueExhausted("a_headers")).toBe(false);
  });
});
