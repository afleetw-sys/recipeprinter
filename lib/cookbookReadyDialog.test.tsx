// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import {
  PHOTOS_HELP,
  PRINT_DESTINATIONS,
  getPrintDestination,
  type PrintDestinationId,
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

const pill = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
// The shortcut is a menu: open it, then pick a row. An empty id clears it.
const fillInFor = (id: string) => {
  fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
  const name = id ? getPrintDestination(id as PrintDestinationId).name : "None";
  fireEvent.click(screen.getByRole("menuitemradio", { name }));
};
const save = () => screen.getByRole("button", { name: /save pdf/i }) as HTMLButtonElement;

describe("the cookbook print dialog", () => {
  it("offers every place as an optional shortcut, with no price", () => {
    renderDialog(95);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/[$£€]|\bfrom about\b|\bcost/i);
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    for (const destination of PRINT_DESTINATIONS) {
      expect(screen.getByRole("menuitemradio", { name: destination.name })).toBeTruthy();
    }
    // Optional: it starts on nothing, and the questions are all there without it.
    expect(screen.getByRole("button", { name: /fill in for/i }).textContent).toContain("Choose a printer");
    expect(screen.getByRole("radiogroup", { name: "How it will be bound" })).toBeTruthy();
  });

  it("starts small: two questions, nothing explained, nothing to save yet", () => {
    renderDialog(95);
    // It read as a wall of text. The panel is a handful of pills until someone
    // answers, and this length is the guard against it quietly growing back.
    expect(screen.getByRole("dialog").textContent!.length).toBeLessThan(300);
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
    fillInFor("blurb");
    expect(pill("Hardcover").checked).toBe(true);
    expect(pill("8 × 10 in").checked).toBe(true);
    fillInFor("home");
    expect(pill("Spiral, comb or 3-ring").checked).toBe(true);
    expect(pill("Standard").checked).toBe(true);
    // Not a lock: change one answer and the rest stay as they were.
    fireEvent.click(pill("Edge to edge"));
    expect(pill("Edge to edge").checked).toBe(true);
    expect(save().disabled).toBe(false);
  });

  it("says what will happen when the answers do not suit the destination", () => {
    renderDialog(95);
    fillInFor("home");
    fireEvent.click(pill("Edge to edge"));
    expect(screen.getByText(/cut off/)).toBeTruthy();
  });

  it("never calls the book a product we guessed at, whoever is printing it", () => {
    renderDialog(95);
    for (const destination of PRINT_DESTINATIONS) {
      fillInFor(destination.id);
      expect(screen.getByRole("dialog").textContent).not.toMatch(/spiral cookbook|hardcover book/i);
    }
  });

  it("puts the way out to the place's site under the menu once one is chosen", () => {
    renderDialog(95);
    expect(screen.queryByRole("button", { name: /^open /i })).toBeNull();
    fillInFor("copy-shop");
    expect(screen.getByRole("button", { name: /open staples/i })).toBeTruthy();
    fillInFor("home");
    expect(screen.queryByRole("button", { name: /^open /i })).toBeNull();
  });

  it("closes the menu when a choice is made, and on Escape", () => {
    renderDialog(95);
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fillInFor("lulu");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("says what Save produces right under the answers, not down by the button", () => {
    renderDialog(95);
    expect(document.querySelector(".cookbook-ready__downloads")).toBeNull();
    fillInFor("copy-shop");
    const summary = document.querySelector(".cookbook-ready__downloads")!;
    expect(summary.textContent).toMatch(/one file/i);
    // Before the notes and the cover fields, and well before Save.
    const order = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order(screen.getByRole("radiogroup", { name: "How it will be bound" }), summary)).toBeTruthy();
    expect(order(summary, save())).toBeTruthy();
    fireEvent.click(pill("Edge to edge"));
    const cover = document.querySelector(".cookbook-cover-size")!;
    expect(order(summary, cover)).toBeTruthy();
  });

  it("draws the menu outside the dialog, so it is not confined to its size", () => {
    renderDialog(95);
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    const menu = screen.getByRole("menu");
    expect(screen.getByRole("dialog").contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
  });

  it("puts the check mark on the right of the chosen row", () => {
    renderDialog(95);
    fillInFor("lulu");
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    const chosen = screen.getByRole("menuitemradio", { name: "Lulu" });
    expect(chosen.getAttribute("aria-checked")).toBe("true");
    // The label comes first, then the slot holding the check.
    expect(chosen.firstChild?.textContent).toBe("Lulu");
    expect(chosen.lastElementChild?.querySelector("svg")).not.toBeNull();
    const other = screen.getByRole("menuitemradio", { name: "Blurb" });
    expect(other.lastElementChild?.querySelector("svg")).toBeNull();
  });

  it("does not count a press inside its own menu as outside", () => {
    renderDialog(95);
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    const row = screen.getByRole("menuitemradio", { name: "Blurb" });
    fireEvent.pointerDown(row);
    expect(screen.queryByRole("menu")).not.toBeNull();
    fireEvent.click(row);
    expect(pill("Hardcover").checked).toBe(true);
    // A press elsewhere does close it.
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("moves with the arrow keys and hands focus back on Tab", () => {
    renderDialog(95);
    const trigger = screen.getByRole("button", { name: /fill in for/i });
    fireEvent.click(trigger);
    const rows = screen.getAllByRole("menuitemradio");
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "ArrowDown" });
    expect(document.activeElement).toBe(rows[1]);
    fireEvent.keyDown(rows[1], { key: "ArrowUp" });
    expect(document.activeElement).toBe(rows[0]);
    fireEvent.keyDown(rows[0], { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("says how many files in plain terms, whoever is printing", () => {
    renderDialog(95);
    fillInFor("home");
    fireEvent.click(pill("Hardcover"));
    fireEvent.click(pill("8 × 10 in"));
    const line = document.querySelector(".cookbook-ready__downloads")!.textContent!;
    expect(line).toBe("You’ll get two files: the pages and the cover.");
    expect(line).not.toMatch(/service|shop/i);
  });

  it("keeps the answers when the shortcut is cleared", () => {
    renderDialog(95);
    fillInFor("blurb");
    fillInFor("");
    expect(pill("Hardcover").checked).toBe(true);
    expect(pill("8 × 10 in").checked).toBe(true);
  });

  it("reads the same whatever the page count", () => {
    const short = renderDialog(12).container.ownerDocument.body.textContent;
    cleanup();
    const long = renderDialog(400).container.ownerDocument.body.textContent;
    expect(long).toBe(short);
  });
});
