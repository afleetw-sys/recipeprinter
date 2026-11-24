// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeCustomizePanel } from "@/components/print/ThemeCustomizePanel";
import type { RecipePrintTemplate } from "@/types/recipe";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(cleanup);

function renderPanel(template: RecipePrintTemplate) {
  render(
    <ThemeCustomizePanel
      cookbook={false}
      proMarked={false}
      photosShown={false}
      fontScale={1}
      setFontScale={() => {}}
      photoScale={1}
      setPhotoScale={() => {}}
      accent={null}
      setAccent={() => {}}
      posterColor={null}
      setPosterColor={() => {}}
      utensil={null}
      setUtensil={() => {}}
      stacked={false}
      setStacked={() => {}}
      background
      setBackground={() => {}}
      template={template}
      customized={false}
      onReset={() => {}}
      onBack={() => {}}
    />,
  );
}

describe("Customize theme background color", () => {
  it("shows the control only for themes with colored paper", () => {
    renderPanel("typewriter");
    expect(screen.getByRole("checkbox", { name: /background color/i })).toBeTruthy();
  });

  it.each(["document", "classic", "pantry", "poster", "winter"] as const)(
    "hides the control for the naturally white %s theme",
    (template) => {
      renderPanel(template);
      expect(screen.queryByRole("checkbox", { name: /background color/i })).toBeNull();
    },
  );
});
