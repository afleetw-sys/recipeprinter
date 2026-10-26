// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeoCapture } from "@/components/seo/SeoCapture";
import { SEO_LANDING_PAGES, seoCaptureProps } from "@/lib/seoLandingPages";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(cleanup);

/**
 * Visitors arrived on a link-only page holding a recipe to type out, met
 * "That doesn't look like a valid URL." with no other box in sight, and left.
 * A page may open on its own source, but every source has to be one tap away.
 */
describe("SEO capture", () => {
  it("offers every import source on every page", () => {
    const pages = SEO_LANDING_PAGES.filter((page) => !page.startsCookbook);
    expect(pages.length).toBeGreaterThan(0);
    for (const page of pages) {
      render(<SeoCapture {...seoCaptureProps(page)} />);
      const toggle = screen.queryByRole("group", { name: "Import source" });
      const tabs = toggle ? within(toggle).getAllByRole("button").map((tab) => tab.textContent?.trim()) : [];
      expect(tabs.sort(), page.slug).toEqual(["Image", "Link", "Recipe apps", "Text"]);
      cleanup();
    }
  });
});
