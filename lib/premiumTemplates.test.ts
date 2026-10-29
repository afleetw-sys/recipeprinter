import { describe, expect, it } from "vitest";
import {
  cookbookTemplateFor,
  DEFAULT_COOKBOOK_TEMPLATE,
  isPremiumTemplate,
} from "@/lib/premiumTemplates";

describe("cookbookTemplateFor", () => {
  it("opens a book on bistro when the cook is on the plain Document default", () => {
    expect(DEFAULT_COOKBOOK_TEMPLATE).toBe("bistro");
    expect(cookbookTemplateFor("document")).toBe("bistro");
  });

  it("is the same every time, whatever came before it", () => {
    const seen = new Set(Array.from({ length: 10 }, () => cookbookTemplateFor("document")));
    expect(seen.size).toBe(1);
  });

  it("respects a premium theme the cook already chose", () => {
    expect(cookbookTemplateFor("heirloom")).toBe("heirloom");
    expect(cookbookTemplateFor("keepsake")).toBe("keepsake");
  });

  it("always hands back a premium theme, so the book never opens locked", () => {
    expect(isPremiumTemplate(cookbookTemplateFor("document"))).toBe(true);
  });
});
