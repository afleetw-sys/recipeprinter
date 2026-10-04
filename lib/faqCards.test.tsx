// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FaqCards } from "@/components/seo/FaqCards";

afterEach(cleanup);

describe("FaqCards", () => {
  // The chips were built when the only ones were printer sites, so every chip
  // opened a new tab and said it was leaving. Every chip since points at one of
  // our own pages, and still did both.
  for (const expandable of [false, true]) {
    it(`opens only links that leave the site in a new tab (${expandable ? "expandable" : "open"} cards)`, () => {
      const { container } = render(
        <FaqCards
          expandable={expandable}
          items={[
            {
              question: "Where next?",
              answer: "Two places.",
              links: [
                { href: "/family-recipe-book", label: "Ours" },
                { href: "https://www.lulu.com/", label: "Theirs" },
              ],
            },
          ]}
        />,
      );
      const link = (label: string) =>
        Array.from(container.querySelectorAll("a")).find((a) => a.textContent?.startsWith(label))!;

      expect(link("Ours").getAttribute("target")).toBeNull();
      expect(link("Ours").textContent).not.toContain("new tab");
      expect(link("Theirs").getAttribute("target")).toBe("_blank");
      expect(link("Theirs").textContent).toContain("new tab");
    });
  }
});
