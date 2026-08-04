import { describe, expect, it } from "vitest";
import {
  categoryOf,
  classifyTrafficSource,
  isAiTraffic,
  isExternalSource,
  matchReferrer,
  normalizeUtmSource,
  resolveAttribution,
} from "./attribution";

const SITE = "https://recipeprinter.com";

/** Resolve as if the browser landed on `path` referred by `referrer`. */
function land(path: string, referrer = ""): ReturnType<typeof resolveAttribution> {
  return resolveAttribution({ href: `${SITE}${path}`, referrer });
}

describe("referrer classification", () => {
  it("recognizes AI assistants, including ones under a search-engine domain", () => {
    expect(matchReferrer("chatgpt.com")).toBe("ChatGPT");
    expect(matchReferrer("www.perplexity.ai")).toBe("Perplexity");
    expect(matchReferrer("claude.ai")).toBe("Claude");
    // gemini + copilot must beat the google/bing rules that would also match.
    expect(matchReferrer("gemini.google.com")).toBe("Gemini");
    expect(matchReferrer("copilot.microsoft.com")).toBe("Microsoft Copilot");
  });

  it("recognizes search engines across country TLDs", () => {
    expect(matchReferrer("www.google.com")).toBe("Google Search");
    expect(matchReferrer("google.co.uk")).toBe("Google Search");
    expect(matchReferrer("www.bing.com")).toBe("Bing Search");
    expect(matchReferrer("duckduckgo.com")).toBe("DuckDuckGo");
  });

  it("recognizes social networks and their subdomains", () => {
    expect(matchReferrer("www.pinterest.com")).toBe("Pinterest");
    expect(matchReferrer("pin.it")).toBe("Pinterest");
    expect(matchReferrer("out.reddit.com")).toBe("Reddit");
    expect(matchReferrer("m.facebook.com")).toBe("Facebook");
    expect(matchReferrer("l.instagram.com")).toBe("Instagram");
    expect(matchReferrer("cookpilotapp.com")).toBe("CookPilot");
  });

  it("does not match domains that merely contain a known name", () => {
    expect(matchReferrer("notgoogle.com")).toBeNull();
    expect(matchReferrer("mybing.example.com")).toBeNull();
  });
});

describe("utm_source normalization", () => {
  it("collapses vendor spellings onto one source", () => {
    expect(normalizeUtmSource("google", null)).toBe("Google Search");
    expect(normalizeUtmSource("google-ads", null)).toBe("Google Search");
    expect(normalizeUtmSource("FB", null)).toBe("Facebook");
    expect(normalizeUtmSource("ig", null)).toBe("Instagram");
    expect(normalizeUtmSource("mailchimp", null)).toBe("Email");
  });

  it("treats an email medium as Email when the source is unknown", () => {
    expect(normalizeUtmSource("acme_blast", "email")).toBe("Email");
  });

  it("title-cases an unknown source instead of discarding it", () => {
    expect(normalizeUtmSource("spring_sale", null)).toBe("Spring Sale");
  });
});

describe("precedence", () => {
  it("prefers utm_source over the referrer", () => {
    const a = land("/?utm_source=newsletter&utm_medium=email", "https://www.google.com/");
    expect(a.source).toBe("Email");
    expect(a.utmSource).toBe("newsletter");
  });

  it("maps click ids when there is no utm", () => {
    expect(land("/?gclid=abc123").source).toBe("Google Search");
    expect(land("/?fbclid=xyz789").source).toBe("Facebook");
  });

  it("falls back to the referrer, then to Direct / Unknown", () => {
    expect(land("/", "https://www.reddit.com/r/cooking").source).toBe("Reddit");
    expect(land("/", "https://some-blog.example.com/post").source).toBe("Referral");
    expect(land("/").source).toBe("Direct / Unknown");
  });

  it("ignores a self-referral (internal navigation) as Direct", () => {
    expect(land("/print", "https://recipeprinter.com/").source).toBe("Direct / Unknown");
  });
});

describe("resolveAttribution shape", () => {
  it("extracts the landing path with query and all campaign fields", () => {
    const a = land(
      "/deals?utm_source=Google&utm_medium=cpc&utm_campaign=summer&gclid=g1",
      "https://www.google.com/",
    );
    expect(a.landingPage).toBe("/deals?utm_source=Google&utm_medium=cpc&utm_campaign=summer&gclid=g1");
    expect(a.source).toBe("Google Search");
    expect(a.utmMedium).toBe("cpc");
    expect(a.utmCampaign).toBe("summer");
    expect(a.gclid).toBe("g1");
    expect(a.fbclid).toBeNull();
    expect(a.referrer).toBe("https://www.google.com/");
  });

  it("flags AI traffic", () => {
    expect(isAiTraffic(land("/", "https://chatgpt.com/").source)).toBe(true);
    expect(isAiTraffic(land("/", "https://www.google.com/").source)).toBe(false);
  });
});

describe("category rollup", () => {
  it("buckets each source into a coarse category", () => {
    expect(categoryOf("Claude")).toBe("AI");
    expect(categoryOf("Google Search")).toBe("Search");
    expect(categoryOf("Pinterest")).toBe("Social");
    expect(categoryOf("Email")).toBe("Email");
    expect(categoryOf("CookPilot")).toBe("Referral");
    expect(categoryOf("Direct / Unknown")).toBe("Direct");
  });

  it("treats an unknown custom utm tag as a Referral", () => {
    expect(categoryOf("Spring Sale")).toBe("Referral");
  });
});

describe("external-source guard (Direct must not clobber latest)", () => {
  it("only real external sources count as external", () => {
    expect(isExternalSource("Reddit")).toBe(true);
    expect(isExternalSource("Direct / Unknown")).toBe(false);
    // a self-referral resolves to Direct, so it is NOT external and won't advance latest.
    expect(isExternalSource(land("/print", "https://recipeprinter.com/").source)).toBe(false);
  });
});

describe("classifyTrafficSource guards", () => {
  it("bare utm_medium=email with no source is still Email", () => {
    expect(
      classifyTrafficSource({
        utmSource: null,
        utmMedium: "email",
        gclid: null,
        fbclid: null,
        referrerHost: null,
        isSelfReferral: false,
      }),
    ).toBe("Email");
  });
});
