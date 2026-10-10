import { describe, expect, it } from "vitest";
import { organizationNode } from "@/lib/seo";

describe("organizationNode", () => {
  // `sameAs` says "these accounts are this same entity". CookPilot is the
  // parent, so its accounts belong on parentOrganization: listed on the brand
  // itself they tell a crawler RecipePrinter *is* CookPilot.
  it("keeps CookPilot's accounts on the parent, not on RecipePrinter", () => {
    const org = organizationNode();

    expect(org.sameAs.length).toBeGreaterThan(0);
    expect(org.sameAs.filter((url) => /cookpilot/i.test(url))).toEqual([]);
    expect(org.parentOrganization.sameAs.length).toBeGreaterThan(0);
    expect(org.parentOrganization.sameAs.every((url) => /cookpilot/i.test(url))).toBe(true);
  });
});
