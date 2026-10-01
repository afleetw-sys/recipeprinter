import { describe, expect, it } from "vitest";
import { cleanSourceUrl, printableSourceUrl } from "@/lib/sourceUrl";

// A real link a cook pasted, straight from a Google ad.
const AD_LINK =
  "https://www.thepioneerwoman.com/food-cooking/recipes/a32450737/slow-cooker-white-chicken-chili-recipe/?utm_source=google&utm_medium=cpc&utm_campaign=mgu_ga_pw_md_pmx_prog_org_us_21687406524&gad_source=1&gad_campaignid=21697738690&gbraid=0AAAABxutSrlfISb_uL3BmTGW_SX2YmIA&gclid=Cj0KCQjw5vLVBhCiARIsAD56SFJSPx99";

describe("source links", () => {
  it("drop an ad's tracking tags and print as one short line", () => {
    expect(printableSourceUrl(AD_LINK)).toBe(
      "thepioneerwoman.com/food-cooking/recipes/a32450737/slow-cooker-white-chicken-chili-recipe",
    );
    expect(cleanSourceUrl(AD_LINK)).toBe(
      "https://www.thepioneerwoman.com/food-cooking/recipes/a32450737/slow-cooker-white-chicken-chili-recipe/",
    );
  });

  it("keep query parameters that identify the page", () => {
    expect(printableSourceUrl("https://example.com/?p=123&utm_source=x&fbclid=y")).toBe("example.com?p=123");
    expect(printableSourceUrl("https://cooking.site/recipe?id=9#comments")).toBe("cooking.site/recipe?id=9");
  });

  it("leave anything that is not a web link alone", () => {
    expect(printableSourceUrl(undefined)).toBeNull();
    expect(printableSourceUrl("Grandma's notebook")).toBeNull();
    expect(cleanSourceUrl("Grandma's notebook")).toBe("Grandma's notebook");
  });
});
