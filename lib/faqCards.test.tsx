// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FAQ_EXPAND_AFTER, FaqCards, type FaqCardItem } from "@/components/seo/FaqCards";

afterEach(cleanup);

const questions = (count: number): FaqCardItem[] =>
  Array.from({ length: count }, (_, i) => ({ question: `Question ${i + 1}?`, answer: `Answer ${i + 1}.` }));

describe("FaqCards", () => {
  it(`lays up to ${FAQ_EXPAND_AFTER} questions out open`, () => {
    for (let count = 1; count <= FAQ_EXPAND_AFTER; count++) {
      const { container } = render(<FaqCards items={questions(count)} />);
      expect(container.querySelectorAll("details")).toHaveLength(0);
      expect(container.querySelectorAll("dt")).toHaveLength(count);
      cleanup();
    }
  });

  it(`folds more than ${FAQ_EXPAND_AFTER} questions into expandable cards, answers still in the page`, () => {
    for (const count of [FAQ_EXPAND_AFTER + 1, 9, 16]) {
      const { container } = render(<FaqCards items={questions(count)} />);
      const cards = container.querySelectorAll("details");
      expect(cards).toHaveLength(count);
      expect(Array.from(cards).every((card) => !card.open)).toBe(true);
      expect(container.textContent).toContain(`Answer ${count}.`);
      cleanup();
    }
  });

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
