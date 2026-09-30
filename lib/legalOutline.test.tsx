// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LegalOutline } from "@/components/LegalOutline";

// The outline marks the section being read: the last one whose top has
// crossed a third of the way down the screen, and the final one at the very
// bottom of the page. jsdom has no layout, so each section's position is
// stubbed and moved by hand to stand in for scrolling.

const SECTIONS = [
  { id: "one", title: "One" },
  { id: "two", title: "Two" },
  { id: "three", title: "Three" },
];

let tops: Record<string, number> = {};

beforeEach(() => {
  document.body.innerHTML = "";
  for (const section of SECTIONS) {
    const element = document.createElement("section");
    element.id = section.id;
    element.getBoundingClientRect = () => ({ top: tops[section.id] ?? 0 }) as DOMRect;
    document.body.appendChild(element);
  }
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 900 });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, value: 10_000 });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function scrollTo(next: Record<string, number>, scrollY = 1000) {
  tops = next;
  Object.defineProperty(window, "scrollY", { configurable: true, value: scrollY });
  act(() => {
    window.dispatchEvent(new Event("scroll"));
  });
}

const current = () => screen.getByRole("link", { current: "location" }).textContent;

describe("LegalOutline", () => {
  it("marks the first section at the top of the page", () => {
    tops = { one: 100, two: 1200, three: 2400 };
    render(<LegalOutline sections={SECTIONS} />);
    expect(current()).toContain("One");
  });

  it("follows the reader down the page", () => {
    tops = { one: 100, two: 1200, three: 2400 };
    render(<LegalOutline sections={SECTIONS} />);

    scrollTo({ one: -1000, two: 200, three: 1400 });
    expect(current()).toContain("Two");
  });

  it("does not jump ahead to a section only peeking in at the bottom", () => {
    tops = { one: 100, two: 1200, three: 2400 };
    render(<LegalOutline sections={SECTIONS} />);

    scrollTo({ one: -1000, two: 100, three: 800 });
    expect(current()).toContain("Two");
  });

  it("marks the last section at the bottom, even when it is too short to reach the line", () => {
    tops = { one: 100, two: 1200, three: 2400 };
    render(<LegalOutline sections={SECTIONS} />);

    scrollTo({ one: -3000, two: -200, three: 600 }, 10_000 - 900);
    expect(current()).toContain("Three");
  });
});
