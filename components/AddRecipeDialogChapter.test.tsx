// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";

afterEach(cleanup);

describe("The Add dialog's chapter choice", () => {
  // "Adding to" was the browser's own select, unlike every other choice in the
  // workspace, and its caret sat out at the far end of the row, away from
  // the box. It is the app's dropdown: a button with its caret inside, opening
  // our menu of every chapter, and a pick changes where the recipe goes.
  it("is our dropdown, caret inside, and changes the chapter", () => {
    const onChange = vi.fn();
    render(
      <AddRecipeDialog
        open
        onClose={() => {}}
        items={[]}
        onAddUrl={() => {}}
        onAddImageFiles={() => {}}
        onAddText={() => {}}
        onAddReadyRecipes={() => 0}
        lastSource="url"
        onSourceUsed={() => {}}
        chapterTarget={{
          options: [
            { id: "none", label: "No chapter" },
            { id: "s1", label: "Desserts" },
          ],
          value: "none",
          onChange,
        }}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("select")).toBeNull();

    const trigger = screen.getByRole("button", { name: /Adding to/ });
    expect(trigger.textContent).toContain("No chapter");
    expect(trigger.querySelector("svg")).not.toBeNull();

    fireEvent.click(trigger);
    const rows = screen.getAllByRole("menuitemradio");
    expect(rows.map((row) => row.textContent)).toEqual(["No chapter", "Desserts"]);
    fireEvent.click(rows[1]);
    expect(onChange).toHaveBeenCalledWith("s1");
  });
});
