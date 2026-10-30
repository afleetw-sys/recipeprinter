// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useFreeThemeOnOpen } from "@/lib/useFreeThemeOnOpen";
import { isPremiumTemplate } from "@/lib/premiumTemplates";
import type { CustomerInfoLoadStatus } from "@/lib/proAccessFallback";
import type { RecipePrintTemplate } from "@/types/recipe";

interface Props {
  status: CustomerInfoLoadStatus;
  /** What the cook owns: every theme (Pro), or only these. */
  owned: "all" | RecipePrintTemplate[];
  cookbookMode: boolean;
}

function render(initial: RecipePrintTemplate, props: Props) {
  return renderHook(
    ({ status, owned, cookbookMode }: Props) => {
      const [template, setTemplate] = useState<RecipePrintTemplate>(initial);
      const unlocked = !isPremiumTemplate(template) || owned === "all" || owned.includes(template);
      const pickTemplate = useFreeThemeOnOpen({ template, setTemplate, status, unlocked, cookbookMode });
      return { template, setTemplate, pickTemplate };
    },
    { initialProps: props },
  );
}

const free: Props = { status: "ok", owned: [], cookbookMode: false };

// Only Pro remembers a Pro theme. Classic was the free default until
// 2026-10-29, so every free cook from before had it remembered, and it opened
// them on a paywalled theme.
describe("a remembered theme", () => {
  it("opens as Document for a free cook when it is a Pro theme", () => {
    for (const theme of ["classic", "garden", "heirloom"] as RecipePrintTemplate[]) {
      const page = render(theme, { ...free, status: "idle" });
      expect(page.result.current.template, theme).toBe(theme);
      page.rerender(free);
      expect(page.result.current.template, theme).toBe("document");

      // One loaded later (a saved project) too.
      act(() => page.result.current.setTemplate(theme));
      expect(page.result.current.template, theme).toBe("document");
    }

    // Unanswered or failed checks prove nothing; Pro, a theme bought on its
    // own, and a cookbook's own unlock all keep it.
    for (const props of [
      { ...free, status: "idle" },
      { ...free, status: "error" },
      { ...free, owned: "all" },
      { ...free, owned: ["heirloom"] },
      { ...free, cookbookMode: true },
    ] as Props[]) {
      expect(render("heirloom", props).result.current.template).toBe("heirloom");
    }

    // A free theme is remembered as it always was.
    expect(render("pantry", free).result.current.template).toBe("pantry");

    // A free cook who picks a Pro theme on the page gets to look at it.
    const picked = render("document", free);
    act(() => picked.result.current.pickTemplate("classic"));
    expect(picked.result.current.template).toBe("classic");
  });
});
