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

  it("names the amplification channels a launch actually runs through", () => {
    // Every link posted to X is rewritten to a t.co shim, so that hostname is
    // the whole channel as far as the referrer is concerned.
    expect(matchReferrer("t.co")).toBe("X / Twitter");
    expect(matchReferrer("x.com")).toBe("X / Twitter");
    expect(matchReferrer("twitter.com")).toBe("X / Twitter");
    expect(matchReferrer("bsky.app")).toBe("Bluesky");
    expect(matchReferrer("www.threads.net")).toBe("Threads");
    expect(matchReferrer("www.linkedin.com")).toBe("LinkedIn");
    expect(matchReferrer("lnkd.in")).toBe("LinkedIn");
    expect(matchReferrer("www.tiktok.com")).toBe("TikTok");
    expect(matchReferrer("youtu.be")).toBe("YouTube");
    // `x` must be preceded by a dot or the start, never mid-label.
    expect(matchReferrer("fx.com")).toBeNull();
  });

  it("recognizes the launch and directory platforms", () => {
    expect(matchReferrer("www.producthunt.com")).toBe("Product Hunt");
    expect(matchReferrer("peerlist.io")).toBe("Peerlist");
    expect(matchReferrer("www.peerlist.io")).toBe("Peerlist");
    expect(matchReferrer("peerpush.net")).toBe("PeerPush");
    expect(matchReferrer("www.peerpush.net")).toBe("PeerPush");
    expect(matchReferrer("uneed.best")).toBe("Uneed");
    expect(matchReferrer("www.uneed.best")).toBe("Uneed");
    expect(matchReferrer("fazier.com")).toBe("Fazier");
    expect(matchReferrer("microlaunch.net")).toBe("MicroLaunch");
    expect(matchReferrer("tinylaun.ch")).toBe("TinyLaunch");
    expect(matchReferrer("startupfame.com")).toBe("Startup Fame");
    expect(matchReferrer("betalist.com")).toBe("BetaList");
    expect(matchReferrer("www.indiehackers.com")).toBe("Indie Hackers");
    expect(matchReferrer("www.saashub.com")).toBe("SaaSHub");
    expect(matchReferrer("alternativeto.net")).toBe("AlternativeTo");
    // Mobbin kept both domains through its move.
    expect(matchReferrer("mobbin.com")).toBe("Mobbin");
    expect(matchReferrer("mobbin.design")).toBe("Mobbin");
    expect(matchReferrer("land-book.com")).toBe("Land-book");
    expect(matchReferrer("godly.website")).toBe("Godly");
  });

  it("scopes Hacker News to the news subdomain, not all of ycombinator.com", () => {
    expect(matchReferrer("news.ycombinator.com")).toBe("Hacker News");
    expect(matchReferrer("hn.algolia.com")).toBe("Hacker News");
    // A click from YC's own site is not a Show HN click.
    expect(matchReferrer("www.ycombinator.com")).toBeNull();
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
    expect(land("/", "https://peerlist.io/ameliaw/project/recipeprinter").source).toBe("Peerlist");
    expect(land("/", "https://www.uneed.best/tool/recipeprinter").source).toBe("Uneed");
    expect(land("/", "https://peerpush.net/p/recipeprinter").source).toBe("PeerPush");
    expect(land("/", "https://www.producthunt.com/posts/recipeprinter").source).toBe("Product Hunt");
    expect(land("/", "https://news.ycombinator.com/item?id=1").source).toBe("Hacker News");
    expect(land("/", "https://t.co/abc123").source).toBe("X / Twitter");
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
    expect(categoryOf("Peerlist")).toBe("Launch");
    expect(categoryOf("PeerPush")).toBe("Launch");
    expect(categoryOf("Uneed")).toBe("Launch");
    expect(categoryOf("Product Hunt")).toBe("Launch");
    expect(categoryOf("Hacker News")).toBe("Launch");
    expect(categoryOf("Mobbin")).toBe("Launch");
    expect(categoryOf("X / Twitter")).toBe("Social");
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
      refParam: null,
        referrerHost: null,
        isSelfReferral: false,
      }),
    ).toBe("Email");
  });
});

describe("?ref= tags", () => {
  // The visit that prompted all of this: a link that named its own source in
  // the URL, filed as Direct because nothing read the tag.
  it("reads a host-shaped ref the way it would read that referrer", () => {
    expect(land("/?ref=launches.uicomet.com").source).toBe("UI Comet");
    expect(land("/?ref=https://launches.uicomet.com/products/x").source).toBe("UI Comet");
    // Same name whether it arrived tagged or with the referrer intact, so one
    // source never splits into two rows.
    expect(land("/", "https://launches.uicomet.com/products/x").source).toBe("UI Comet");
  });

  it("accepts via= and source= as the same idea", () => {
    expect(land("/?via=pinterest.com").source).toBe("Pinterest");
    expect(land("/?source=reddit.com").source).toBe("Reddit");
  });

  it("resolves a recognized word tag", () => {
    expect(land("/?ref=newsletter").source).toBe("Email");
    expect(land("/?ref=cookpilot").source).toBe("CookPilot");
    // Product Hunt appends this to every outbound link on a listing.
    expect(land("/?ref=producthunt").source).toBe("Product Hunt");
  });

  it("declines an unrecognized code rather than inventing a source", () => {
    // Affiliate/referral codes live in `ref` too. Title-casing them would bury
    // the real sources under a tail of one-visit rows.
    expect(land("/?ref=a83kfj20").source).toBe("Direct / Unknown");
    expect(land("/?ref=a83kfj20").refParam).toBe("a83kfj20");
  });

  it("keeps utm_source above ref, and ref above the referrer", () => {
    expect(land("/?utm_source=reddit&ref=pinterest.com").source).toBe("Reddit");
    expect(land("/?ref=pinterest.com", "https://www.google.com/").source).toBe("Pinterest");
  });

  it("files an unmatched host-shaped ref as a plain Referral", () => {
    expect(land("/?ref=somewhere-new.example").source).toBe("Referral");
  });
});

describe("android in-app browsers", () => {
  // Tapping a link inside an app hands us `android-app://<package>`, so the
  // "hostname" is a package name and no domain rule can match it.
  it("names the app instead of burying it in Referral", () => {
    expect(land("/", "android-app://com.instagram.android").source).toBe("Instagram");
    expect(land("/", "android-app://com.facebook.katana").source).toBe("Facebook");
    expect(land("/", "android-app://com.google.android.gm").source).toBe("Email");
    expect(land("/", "android-app://com.reddit.frontpage").source).toBe("Reddit");
    expect(land("/", "android-app://com.twitter.android").source).toBe("X / Twitter");
    expect(land("/", "android-app://com.linkedin.android").source).toBe("LinkedIn");
  });

  it("still calls an unknown app a Referral, not Direct", () => {
    expect(land("/", "android-app://com.example.unknown").source).toBe("Referral");
  });
});

describe("our own share links", () => {
  it("attributes a shared card, which carries no referrer anywhere it gets pasted", () => {
    const a = land("/print/abc123?utm_source=shared_card");
    expect(a.source).toBe("Shared Card");
    expect(categoryOf(a.source)).toBe("Referral");
  });
});
