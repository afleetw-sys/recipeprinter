import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A hostname whose DNS answer we control, so the test can play the part of an
// attacker's AAAA record without a network.
const lookup = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookup(...args) }));

import { POST } from "@/app/api/parse/route";
import { __resetRateLimitsForTest } from "@/lib/server/rateLimit";

const fetchSpy = vi.fn();

function importRequest(url: string) {
  return new Request("http://localhost/api/parse", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.50" },
    body: JSON.stringify({ url }),
  });
}

beforeEach(() => {
  __resetRateLimitsForTest();
  lookup.mockReset();
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  // Configured, so that if validation let a request through, the CookPilot leg
  // would try to send it. The assertions below are that it never gets that far.
  vi.stubEnv("COOKPILOT_RECIPE_PARSER_URL", "https://parser.invalid/parse");
  vi.stubEnv("RECIPEPRINTER_PARSER_SECRET", "test-secret");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const NOT_PUBLIC = "That URL doesn't look like a public recipe page.";

async function expectRefusedBeforeAnyRequest(url: string, message: string | RegExp = NOT_PUBLIC) {
  const response = await POST(importRequest(url));
  expect(response.status).toBe(400);
  const body = (await response.json()) as { success: boolean; error: string };
  expect(body.success).toBe(false);
  expect(body.error).toMatch(message instanceof RegExp ? message : new RegExp(`^${message}$`));
  expect(fetchSpy).not.toHaveBeenCalled();
}

describe("/api/parse refuses non-public destinations before any request leaves", () => {
  // These reach the address check, and only the bracket handling gets them
  // there: without it `[::ffff:a9fe:a9fe]` fails `isIP`, falls into the DNS
  // lookup, and comes back as a generic 500 rather than being refused.
  it.each([
    "http://[::ffff:a9fe:a9fe]/latest/meta-data",
    "http://[::ffff:7f00:1]/",
    "http://[febf::1]/",
  ])("literal address %s", async (url) => {
    await expectRefusedBeforeAnyRequest(url);
  });

  // Loopback and link-local literals are caught even earlier, by the
  // reserved-address message. The guarantee is the same: no request leaves.
  it.each(["http://[::1]/recipe", "http://127.0.0.1/", "http://169.254.169.254/latest/meta-data"])(
    "reserved literal %s",
    async (url) => {
      await expectRefusedBeforeAnyRequest(url, /reserved address|public recipe page/);
    },
  );

  it.each([
    ["::ffff:a9fe:a9fe", "an IPv4-mapped metadata address"],
    ["::ffff:7f00:1", "an IPv4-mapped loopback address"],
    ["febf::1", "a link-local address past fe80"],
    ["64:ff9b::a9fe:a9fe", "a NAT64-wrapped metadata address"],
  ])("a hostname whose AAAA record is %s (%s)", async (address) => {
    lookup.mockResolvedValue([{ address, family: 6 }]);
    await expectRefusedBeforeAnyRequest("https://recipes.attacker-site.com/pie");
  });

  it("refuses when any one of several answers is private", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "::ffff:a9fe:a9fe", family: 6 },
    ]);
    await expectRefusedBeforeAnyRequest("https://recipes.attacker-site.com/pie");
  });

  it("lets a public hostname through to the parser", async () => {
    lookup.mockResolvedValue([{ address: "2606:4700:4700::1111", family: 6 }]);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ recipes: [] }), { status: 200 }));
    await POST(importRequest("https://recipes.real-site.com/pie"));
    expect(fetchSpy).toHaveBeenCalled();
    expect(String(fetchSpy.mock.calls[0][0])).toBe("https://parser.invalid/parse");
  });
});
