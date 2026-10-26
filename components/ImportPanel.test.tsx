// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImportPanel } from "@/components/ImportPanel";

afterEach(cleanup);

/** What the link field starts when this is pasted into it and submitted. */
function submit(pasted: string) {
  const onAddUrl = vi.fn();
  const onAddText = vi.fn();
  render(
    <ImportPanel
      items={[]}
      initialMode="url"
      onAddUrl={onAddUrl}
      onAddText={onAddText}
      onAddImageFiles={vi.fn()}
      onAddReadyRecipes={vi.fn(() => 0)}
    />,
  );
  const field = screen.getByRole("textbox");
  fireEvent.change(field, { target: { value: pasted } });
  fireEvent.submit(field.closest("form")!);
  const started = onAddUrl.mock.calls.length
    ? { url: onAddUrl.mock.calls[0][0] as string }
    : onAddText.mock.calls.length
      ? { text: true }
      : {};
  cleanup();
  return started;
}

describe("the link field", () => {
  // "RECIPE HERE: https://bit.ly/4idG4GX", copied whole out of a post, went to
  // the recipe-text reader instead of the link. A link with a few words round
  // it is a link: those words are the post's, not the recipe.
  it("imports the link out of a short caption around it", () => {
    const link = "https://bit.ly/4idG4GX";
    for (const pasted of [
      `RECIPE HERE: ${link}`,
      `Check this out!\n${link}`,
      `Made this last night, so good ${link} 😋`,
      `The recipe is here (${link}).`,
      `link in bio → ${link}`,
    ]) {
      expect(submit(pasted), pasted).toEqual({ url: link });
    }
  });

  it("still reads a pasted recipe as text, a link in it or not", () => {
    for (const pasted of [
      "Recipe from https://www.plainchicken.com/casserole/\nIngredients\n2 cups chicken\n1 can soup",
      "Mexican Picadillo Ingredients 1 lb ground beef (or ground turkey) 1 onion, diced, from https://example.com/picadillo",
      "Mexican Picadillo\nIngredients\n1 lb ground beef",
    ]) {
      expect(submit(pasted), pasted).toEqual({ text: true });
    }
  });

  it("still takes a plain link, and one that wrapped across lines", () => {
    expect(submit("https://bit.ly/4idG4GX")).toEqual({ url: "https://bit.ly/4idG4GX" });
    expect(submit("https://www.plainchicken.com/million-\ndollar-chicken-casserole/").url).toBeTruthy();
  });
});
