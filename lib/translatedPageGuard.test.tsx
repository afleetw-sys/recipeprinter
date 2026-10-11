// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { installTranslatedPageGuard } from "@/lib/translatedPageGuard";

/**
 * What a browser translator does to a page: every text node is thrown away
 * and a wrapped, translated copy is put where it was.
 */
function translate(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  for (const text of texts) {
    const font = document.createElement("font");
    font.textContent = `[${text.data}]`;
    text.replaceWith(font);
  }
}

/** The shapes on the print page that sit next to text: an icon that appears
    beside a label, a label that goes away, and a label that changes. */
const CASES: Record<string, (on: boolean) => JSX.Element> = {
  "an element inserted before translated text": (on) => <button>{on ? <i data-spinner /> : null}Print</button>,
  "translated text removed": (on) => <p>{on ? null : "Saving"}<b>done</b></p>,
  "translated text swapped for an element": (on) => <p>{on ? <b>Saved</b> : "Saving"}</p>,
};

describe("a page a browser translator has rewritten", () => {
  beforeAll(installTranslatedPageGuard);
  afterEach(cleanup);

  it("keeps updating instead of crashing, and still draws what was inserted", () => {
    for (const [name, view] of Object.entries(CASES)) {
      const { container, rerender, unmount } = render(view(false));
      translate(container);
      expect(() => rerender(view(true)), name).not.toThrow();
      if (name.startsWith("an element inserted")) {
        expect(container.querySelector("[data-spinner]"), name).not.toBeNull();
      }
      expect(() => unmount(), name).not.toThrow();
    }
  });
});
