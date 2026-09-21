import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DividerFace } from "@/components/RecipeCardPrint";

const render = (intro: string | undefined) =>
  renderToStaticMarkup(
    <DividerFace
      title="Dinner"
      recipeTitles={["Lemon Pasta", "Tomato Soup"]}
      intro={intro}
      template="classic"
      showDecoration={false}
    />,
  );

describe("chapter opener description", () => {
  it("prints the recipes' names when nobody has written one", () => {
    expect(render(undefined)).toContain("recipe-card__chapter-intro");
  });

  it("prints what the cook wrote", () => {
    expect(render("Sunday suppers.")).toContain("Sunday suppers.");
  });

  it("prints nothing once the cook has removed it", () => {
    expect(render("")).not.toContain("recipe-card__chapter-intro");
  });
});
