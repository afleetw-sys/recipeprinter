// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DividerFace, type DividerCardInlineEdit } from "@/components/RecipeCardPrint";
import { chapterIntroFromRecipes } from "@/lib/chapterIntro";

const TITLES = ["Lemon Pasta", "Tomato Soup"];
const derived = chapterIntroFromRecipes(TITLES);

function setup(intro: string | undefined) {
  const onIntroChange = vi.fn();
  const inlineEdit: DividerCardInlineEdit = {
    titleEditing: false,
    titleValue: "",
    onTitleOpen: () => {},
    onTitleChange: () => {},
    onTitleCommit: () => {},
    onTitleCancel: () => {},
    subtitle: undefined,
    onSubtitleChange: () => {},
    intro,
    onIntroChange,
  };
  const { container } = render(
    <DividerFace
      title="Dinner"
      recipeTitles={TITLES}
      intro={intro}
      inlineEdit={inlineEdit}
      template="classic"
      showDecoration={false}
    />,
  );
  const line = container.querySelector(".recipe-card__chapter-intro") as HTMLElement;
  fireEvent.mouseDown(line);
  return { onIntroChange, field: screen.getByLabelText("Chapter description") as HTMLTextAreaElement };
}

afterEach(cleanup);

describe("opening the chapter description", () => {
  it("puts the recipes' names in the field, so there is something to clear", () => {
    const { field } = setup(undefined);
    expect(field.value).toBe(derived);
  });

  it("removes the line when that text is cleared", () => {
    const { field, onIntroChange } = setup(undefined);
    fireEvent.change(field, { target: { value: "" } });
    expect(onIntroChange).toHaveBeenCalledWith("");
  });

  it("writes nothing when it is opened and left alone, so it keeps following the recipes", () => {
    const { field, onIntroChange } = setup(undefined);
    fireEvent.blur(field);
    expect(onIntroChange).not.toHaveBeenCalled();
  });

  it("opens a written description as written", () => {
    const { field } = setup("Sunday suppers.");
    expect(field.value).toBe("Sunday suppers.");
  });
});
