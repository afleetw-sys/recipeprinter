// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineRichField } from "@/components/InlineRichField";

// An ingredient or step row can't show a line break: the card prints the row
// on one line, so a break typed inside it vanished on save and the two halves
// ran together ("Chicken Marinade800g chicken thigh"). A cook pressing
// Shift+Return between ingredients got a new line while editing, then saw it
// all combine again when they clicked away. In a row that splits, every way a
// line break can arrive has to start a new row instead.

afterEach(cleanup);

const LINE = "Chicken Marinade800g chicken thigh";
const CARET = { start: "Chicken Marinade".length, end: "Chicken Marinade".length };

function setup() {
  const onSplit = vi.fn();
  render(
    <InlineRichField
      ariaLabel="Ingredient"
      value={LINE}
      caret={CARET}
      onCommit={() => {}}
      onCancel={() => {}}
      onSplit={onSplit}
    />,
  );
  return { field: screen.getByRole("textbox"), onSplit };
}

function beforeInput(field: HTMLElement, inputType: string): Event {
  const event = new Event("beforeinput", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "inputType", { value: inputType });
  field.dispatchEvent(event);
  return event;
}

describe("a line break in a row that splits", () => {
  it("starts a new row, however the keyboard sends it", () => {
    const ways: Array<[string, (field: HTMLElement) => void]> = [
      ["Shift+Return on a keyboard", (field) => fireEvent.keyDown(field, { key: "Enter", shiftKey: true })],
      [
        "a phone's line break with Shift down",
        (field) => {
          fireEvent.keyDown(field, { key: "Shift", shiftKey: true });
          beforeInput(field, "insertLineBreak");
        },
      ],
    ];
    for (const [name, press] of ways) {
      const { field, onSplit } = setup();
      press(field);
      expect(onSplit, name).toHaveBeenCalledWith("Chicken Marinade", "800g chicken thigh");
      cleanup();
    }
  });
});
