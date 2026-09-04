import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportError } from "@/lib/parser";
import { normalizeFractions, parseUrlAll } from "@/lib/parser";

// What these tests are about is one decision: after `/api/parse` fails, do we
// go on to run CookPilot's parser AGAIN through its client callable? The route
// already calls that same parser server-side, so an unconditional retry means
// the cook waits through two full parses to reach one answer. `parserExhausted`
// is the route telling us the parser already answered.
//
// So the callable is a spy and the assertion is usually its call count. The
// modules underneath (Firebase Functions, Storage) are irrelevant here and are
// mocked to nothing.

const callable = vi.hoisted(() => vi.fn());

vi.mock("firebase/functions", () => ({
  httpsCallable: () => callable,
}));
vi.mock("@/lib/firebase/functions", () => ({ getFns: () => ({}) }));
vi.mock("@/lib/anonymousOwner", () => ({ anonymousOwnerId: () => "anon-test" }));

const COOKPILOT_RESULT = {
  data: {
    recipe: {
      title: "Fallback Borscht",
      ingredientSections: [{ title: undefined, ingredients: [{ name: "beets", amount: "2" }] }],
      instructionSections: [{ title: undefined, instructions: [{ text: "Simmer." }] }],
    },
  },
};

/** Stubs `/api/parse` with one response. */
function routeReplies(status: number, body: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      status,
      json: async () => body,
    })),
  );
}

beforeEach(() => {
  callable.mockReset();
  callable.mockResolvedValue(COOKPILOT_RESULT);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseUrlAll — CookPilot fallback suppression", () => {
  it("returns the route's recipes without touching the callable", async () => {
    routeReplies(200, {
      success: true,
      recipes: [{ title: "Route Borscht", ingredients: [], instructions: [] }],
    });

    const recipes = await parseUrlAll("example.com/borscht");

    expect(recipes).toHaveLength(1);
    expect(recipes[0].title).toBe("Route Borscht");
    expect(callable).not.toHaveBeenCalled();
  });

  it("does not route around our own rate limit by calling the parser directly", async () => {
    // The fallback reaches the same paid parser the 429 was protecting, so a
    // retry here would spend exactly the budget the limit defends.
    routeReplies(429, {
      success: false,
      error: "That's a lot of imports at once. Wait a moment and try again.",
      rateLimited: true,
    });

    await expect(parseUrlAll("example.com/borscht")).rejects.toThrow(ImportError);
    expect(callable).not.toHaveBeenCalled();
  });

  it("still falls back when the recipe SITE rate-limits us", async () => {
    // A 429 from the website is not our limiter: CookPilot's parser egresses
    // from somewhere else and may not be blocked, so this retry is worth it.
    routeReplies(429, {
      success: false,
      error: "This website wouldn't let us read the recipe.",
    });

    const recipes = await parseUrlAll("example.com/borscht");

    expect(recipes[0].title).toBe("Fallback Borscht");
    expect(callable).toHaveBeenCalledTimes(1);
  });

  it("does not re-run the parser when the route says it already found nothing", async () => {
    routeReplies(422, {
      success: false,
      error: "We couldn't find a complete recipe on that page.",
      parserExhausted: true,
    });

    await expect(parseUrlAll("example.com/not-a-recipe")).rejects.toThrow(ImportError);
    expect(callable).not.toHaveBeenCalled();
  });

  it("still falls back when the route never consulted the parser", async () => {
    // No `parserExhausted`: the deployment has no server-side parser configured,
    // so the route only managed a JSON-LD read. The callable is the first time
    // the real parser sees this URL, and it's the whole reason the fallback
    // exists — suppressing it here would break import on those deployments.
    routeReplies(422, {
      success: false,
      error: "We couldn't find a complete recipe on that page.",
    });

    const recipes = await parseUrlAll("example.com/borscht");

    expect(callable).toHaveBeenCalledTimes(1);
    expect(recipes[0].title).toBe("Fallback Borscht");
  });

  it("falls back when the route itself is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );

    const recipes = await parseUrlAll("example.com/borscht");

    expect(callable).toHaveBeenCalledTimes(1);
    expect(recipes[0].title).toBe("Fallback Borscht");
  });

  it("keeps not retrying a rejected input (400)", async () => {
    routeReplies(400, { success: false, error: "That doesn't look like a valid URL." });

    await expect(parseUrlAll("example.com/nope")).rejects.toThrow(ImportError);
    expect(callable).not.toHaveBeenCalled();
  });
});

describe("parseUrlAll — analytics buckets for suppressed retries", () => {
  // Suppressing the retry means these statuses now end at parseUrlAll's own
  // throw instead of being categorized by `friendlyError` on the way out of the
  // fallback. The bucket has to come out the same either way, or the closed
  // vocabulary stops being comparable across the two paths.
  const cases: Array<[number, string]> = [
    [422, "no_recipe"],
    [404, "not_found"],
    [403, "blocked"],
    [429, "blocked"],
    [413, "too_large"],
    [504, "timeout"],
    [502, "backend_unavailable"],
  ];

  for (const [status, category] of cases) {
    it(`reports ${status} as ${category}`, async () => {
      routeReplies(status, { success: false, error: "nope", parserExhausted: true });

      await expect(parseUrlAll("example.com/x")).rejects.toMatchObject({ code: category });
      expect(callable).not.toHaveBeenCalled();
    });
  }
});

describe("normalizeFractions", () => {
  // The exact paste that lost three of its nine ingredients in production.
  it("rewrites the glyphs that were being discarded", () => {
    expect(normalizeFractions("¼ cup red wine or balsamic dressing")).toBe(
      "1/4 cup red wine or balsamic dressing",
    );
    expect(normalizeFractions("½ lemon juice")).toBe("1/2 lemon juice");
  });

  // Running these together would multiply the amount by more than twenty.
  it("keeps a whole number apart from its fraction", () => {
    expect(normalizeFractions("1½ cups flour")).toBe("1 1/2 cups flour");
    expect(normalizeFractions("2 ¾ tsp salt")).toBe("2 3/4 tsp salt");
  });

  it("handles the fraction slash", () => {
    expect(normalizeFractions("1⁄2 cup sugar")).toBe("1/2 cup sugar");
  });

  it("leaves ASCII fractions and ordinary text alone", () => {
    expect(normalizeFractions("1/2 cup olive oil")).toBe("1/2 cup olive oil");
    expect(normalizeFractions("Salt/pepper to taste")).toBe("Salt/pepper to taste");
  });

  it("covers every glyph it claims to", () => {
    for (const glyph of ["½", "⅓", "⅔", "¼", "¾", "⅕", "⅙", "⅛", "⅜", "⅝", "⅞"]) {
      expect(normalizeFractions(`${glyph} cup`)).toMatch(/^\d+\/\d+ cup$/);
    }
  });
});
