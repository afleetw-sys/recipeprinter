// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import { COOKBOOK_PRESETS } from "@/lib/cookbookPresets";
import {
  PRINT_DESTINATIONS,
  destinationPresets,
  formatOption,
  getPrintDestination,
} from "@/lib/printDestinations";

afterEach(cleanup);

function renderDialog(pageCount: number) {
  return render(
    <CookbookReadyDialog
      open
      justPurchased={false}
      onClose={() => {}}
      onExport={() => {}}
      onPrinterClick={() => {}}
      exportingPreset={null}
      exportError={null}
      pageCount={pageCount}
    />,
  );
}

describe("the cookbook print dialog", () => {
  it("lists every place with generic text and no price", () => {
    renderDialog(95);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/[$£€]|\bfrom about\b|\bcost/i);
    for (const destination of PRINT_DESTINATIONS) {
      expect(screen.getByLabelText(destination.name)).toBeTruthy();
      // A destination's one line appears once it is picked.
      if (destination.tagline) {
        fireEvent.click(screen.getByLabelText(destination.name));
        expect(screen.getByText(destination.tagline)).toBeTruthy();
      }
    }
  });

  it("offers every format before anything is chosen, and saves nothing until one is", () => {
    renderDialog(95);
    for (const preset of COOKBOOK_PRESETS) {
      expect(screen.getByText(formatOption(preset).title)).toBeTruthy();
    }
    expect((screen.getByRole("button", { name: /save pdf/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("fills the format in from the destination and leaves the others open", () => {
    renderDialog(95);
    fireEvent.click(screen.getByLabelText("Lulu"));
    const lulu = getPrintDestination("lulu");
    const first = destinationPresets(lulu)[0];
    const checked = screen
      .getAllByRole("radio")
      .filter((radio) => (radio as HTMLInputElement).checked)
      .map((radio) => (radio as HTMLInputElement).value);
    expect(checked).toContain(first.id);
    // Not a lock: any other format can be chosen, and the choice sticks.
    const other = COOKBOOK_PRESETS.find((preset) => preset.id !== first.id)!;
    const radioFor = (title: string) =>
      screen.getByText(title).closest("label")!.querySelector("input") as HTMLInputElement;
    fireEvent.click(radioFor(formatOption(other).title));
    expect(radioFor(formatOption(other).title).checked).toBe(true);
    expect((screen.getByRole("button", { name: /save pdf/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("never calls the book a product we guessed at, whoever is printing it", () => {
    renderDialog(95);
    for (const destination of PRINT_DESTINATIONS) {
      fireEvent.click(screen.getByLabelText(destination.name));
      expect(screen.getByRole("dialog").textContent).not.toMatch(/spiral cookbook|hardcover book\b(?!,)/i);
    }
  });

  it("reads the same whatever the page count", () => {
    const short = renderDialog(12).container.ownerDocument.body.textContent;
    cleanup();
    const long = renderDialog(400).container.ownerDocument.body.textContent;
    expect(long).toBe(short);
  });
});
