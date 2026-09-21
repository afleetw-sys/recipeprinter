// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import { PHOTOS_HELP, PRINT_DESTINATIONS } from "@/lib/printDestinations";

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

const pill = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const save = () => screen.getByRole("button", { name: /save pdf/i }) as HTMLButtonElement;

describe("the cookbook print dialog", () => {
  it("lists every place, with no price", () => {
    renderDialog(95);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/[$£€]|\bfrom about\b|\bcost/i);
    for (const destination of PRINT_DESTINATIONS) {
      expect(screen.getByLabelText(destination.name)).toBeTruthy();
    }
  });

  it("starts small: two questions, nothing explained, nothing to save yet", () => {
    renderDialog(95);
    // It read as a wall of text. The panel is a handful of pills until someone
    // answers, and this length is the guard against it quietly growing back.
    expect(screen.getByRole("dialog").textContent!.length).toBeLessThan(220);
    expect(save().disabled).toBe(true);
    expect(screen.queryByText("Size")).toBeNull();
    expect(screen.queryByText("Photos")).toBeNull();
  });

  it("asks for a hardcover's size and nothing else", () => {
    renderDialog(95);
    fireEvent.click(pill("Hardcover"));
    expect(screen.getByText("Size")).toBeTruthy();
    expect(screen.queryByText("Photos")).toBeNull();
    expect(save().disabled).toBe(true);
    fireEvent.click(pill("8 × 10 in"));
    expect(save().disabled).toBe(false);
  });

  it("asks a lay-flat book about its photos, and explains the answer chosen", () => {
    renderDialog(95);
    fireEvent.click(pill("Spiral, comb or 3-ring"));
    expect(screen.getByText("Photos")).toBeTruthy();
    expect(screen.queryByText("Size")).toBeNull();
    expect(save().disabled).toBe(true);
    fireEvent.click(pill("Standard"));
    expect(screen.getByText(PHOTOS_HELP.standard)).toBeTruthy();
    fireEvent.click(pill("Edge to edge"));
    expect(screen.getByText(PHOTOS_HELP.edge)).toBeTruthy();
    expect(screen.queryByText(PHOTOS_HELP.standard)).toBeNull();
    expect(save().disabled).toBe(false);
  });

  it("fills every answer in from a destination and leaves each one open", () => {
    renderDialog(95);
    fireEvent.click(pill("Blurb"));
    expect(pill("Hardcover").checked).toBe(true);
    expect(pill("8 × 10 in").checked).toBe(true);
    fireEvent.click(pill("My own printer"));
    expect(pill("Spiral, comb or 3-ring").checked).toBe(true);
    expect(pill("Standard").checked).toBe(true);
    // Not a lock: change one answer and the rest stay as they were.
    fireEvent.click(pill("Edge to edge"));
    expect(pill("Edge to edge").checked).toBe(true);
    expect(save().disabled).toBe(false);
  });

  it("says what will happen when the answers do not suit the destination", () => {
    renderDialog(95);
    fireEvent.click(pill("My own printer"));
    fireEvent.click(pill("Edge to edge"));
    expect(screen.getByText(/cut off/)).toBeTruthy();
  });

  it("never calls the book a product we guessed at, whoever is printing it", () => {
    renderDialog(95);
    for (const destination of PRINT_DESTINATIONS) {
      fireEvent.click(screen.getByLabelText(destination.name));
      expect(screen.getByRole("dialog").textContent).not.toMatch(/spiral cookbook|hardcover book/i);
    }
  });

  it("reads the same whatever the page count", () => {
    const short = renderDialog(12).container.ownerDocument.body.textContent;
    cleanup();
    const long = renderDialog(400).container.ownerDocument.body.textContent;
    expect(long).toBe(short);
  });
});
