// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import type { PreparedCookbookPages } from "@/lib/cookbookPdfExport";
import {
  PHOTOS_HELP,
  PRINT_DESTINATIONS,
  getPrintDestination,
  type PrintDestinationId,
} from "@/lib/printDestinations";

afterEach(cleanup);

function renderDialog() {
  return render(
    <CookbookReadyDialog
      open
      justPurchased={false}
      onClose={() => {}}
      onExport={() => {}}
      onPrinterClick={() => {}}
      exportingPreset={null}
      exportError={null}
    />,
  );
}

function renderExportingDialog(
  recipeCount: number,
  exportProgress: "preparing" | "rendering-pages" | "rendering-cover" = "preparing",
) {
  return render(
    <CookbookReadyDialog
      open
      justPurchased={false}
      onClose={() => {}}
      onExport={() => {}}
      onPrinterClick={() => {}}
      exportingPreset="hardcover-8x10"
      exportProgress={exportProgress}
      exportError={null}
      recipeCount={recipeCount}
    />,
  );
}

function renderFinishedDialog() {
  return render(
    <CookbookReadyDialog
      open
      justPurchased={false}
      onClose={() => {}}
      onExport={() => {}}
      onPrinterClick={() => {}}
      exportingPreset={null}
      exportError={null}
      lastExport={{
        presetId: "hardcover-8x10",
        files: [
          { name: "Family-Hardcover-8x10.pdf", downloadUrl: "https://storage.example/pages.pdf", role: "pages" },
          { name: "Family-Cover-Hardcover-8x10.pdf", downloadUrl: "https://storage.example/cover.pdf", role: "cover" },
        ],
      }}
      onExportAnother={() => {}}
    />,
  );
}

function fakePages(): PreparedCookbookPages {
  return {
    project: { id: "book-1", sections: [] } as unknown as PreparedCookbookPages["project"],
    preset: "hardcover-8x10",
    file: { name: "Family-Hardcover-8x10.pdf", downloadUrl: "https://storage.example/pages.pdf", role: "pages" },
    pageCount: 148,
  };
}

function renderAwaitingCoverDialog(onDownloadCover = () => {}) {
  return render(
    <CookbookReadyDialog
      open
      justPurchased={false}
      onClose={() => {}}
      onExport={() => {}}
      onPrinterClick={() => {}}
      exportingPreset={null}
      exportError={null}
      awaitingCover={fakePages()}
      onDownloadCover={onDownloadCover}
      onExportAnother={() => {}}
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
  it("shows a dedicated cover-only progress view, once the interior has already downloaded", () => {
    renderExportingDialog(148, "rendering-cover");
    expect(screen.getByRole("heading", { name: "Creating your cookbook PDF" })).toBeTruthy();
    expect(screen.getByText("Creating the cover PDF").closest("li")?.getAttribute("aria-current")).toBe("step");
    expect(screen.getByRole("status").textContent).toMatch(/Sizing the cover and spine/);
    // The cover renders on its own now, as a later click, never bundled into
    // the pages steps — there is nothing here about laying out recipes.
    expect(screen.queryByText("Creating the pages PDF")).toBeNull();
    expect(screen.queryByText("Laying out your recipes")).toBeNull();
    expect(screen.getByRole("dialog").textContent).not.toMatch(/\d+%/);
  });

  it("keeps the long pages render visibly active without claiming false completion", () => {
    vi.useFakeTimers();
    try {
      renderExportingDialog(148, "rendering-pages");
      expect(screen.getByRole("status").textContent).toMatch(/Building the page layout for 148 recipes/);
      expect(screen.queryByText(/Preparing your cookbook/)).toBeNull();

      act(() => vi.advanceTimersByTime(7_000));
      expect(screen.getByText("Placing photos").closest("li")?.className).toContain("is-current");
      expect(screen.getByRole("status").textContent).toMatch(/Fitting recipe photos/);

      act(() => vi.advanceTimersByTime(14_000));
      expect(screen.getByRole("status").textContent).toMatch(/Large cookbooks can take a little longer/);
      expect(screen.getByText("Creating the pages PDF").closest("li")?.className).toContain(
        "is-current",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("turns the file steps into the compact success state, offering each real download again separately", () => {
    renderFinishedDialog();
    expect(screen.getByRole("heading", { name: "Download started" })).toBeTruthy();
    expect(screen.getByText("Interior pages PDF downloaded").closest("li")?.className).toContain(
      "is-done",
    );
    expect(screen.getByText("Cover PDF downloaded").closest("li")?.className).toContain("is-done");
    // No zip: the interior and the cover are two separate real downloads, so
    // there are two separate "download again" buttons.
    expect(screen.getByRole("button", { name: "Download interior again" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download cover again" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /ZIP/ })).toBeNull();
    expect(screen.getByText(/Both PDFs downloaded separately/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try another way" })).toBeTruthy();
    expect(document.querySelector(".cookbook-next__settings")).toBeNull();
  });

  it("prompts for the cover size once the interior has already downloaded", () => {
    const download = vi.fn();
    renderAwaitingCoverDialog(download);
    expect(screen.getByRole("heading", { name: "Download your cover next" })).toBeTruthy();
    expect(screen.getByText("Interior pages PDF downloaded")).toBeTruthy();
    expect(screen.getByText(/enter the cover size it gives you back/i)).toBeTruthy();
    expect(screen.getByText("Cover size")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Download cover" }));
    expect(download).toHaveBeenCalledOnce();
  });

  it("offers every place as an optional shortcut, with no price", () => {
    renderDialog();
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
    renderDialog();
    // It read as a wall of text. The panel is a handful of pills until someone
    // answers, and this length is the guard against it quietly growing back.
    expect(screen.getByRole("dialog").textContent!.length).toBeLessThan(300);
    expect(save().disabled).toBe(true);
    expect(screen.queryByText("Size")).toBeNull();
    expect(screen.queryByText("Photos")).toBeNull();
  });

  it("asks for a hardcover's size and nothing else", () => {
    renderDialog();
    fireEvent.click(pill("Hardcover"));
    expect(screen.getByText("Size")).toBeTruthy();
    expect(screen.queryByText("Photos")).toBeNull();
    expect(save().disabled).toBe(true);
    fireEvent.click(pill("8 × 10 in"));
    expect(save().disabled).toBe(false);
  });

  it("asks a lay-flat book about its photos, and explains the answer chosen", () => {
    renderDialog();
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
    renderDialog();
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

  it("clears the shortcut once an answer no longer suits it, rather than leaving a stale claim", () => {
    renderDialog();
    fillInFor("home");
    fireEvent.click(pill("Edge to edge"));
    // "Fill in for Home" sitting over a file Home can't use would be a claim
    // the file doesn't back up. Resetting it is more honest than a note under
    // controls that still say "Home".
    expect(screen.getByRole("button", { name: /fill in for/i }).textContent).toContain(
      "Choose a printer",
    );
    expect(screen.queryByText(/cut off/)).toBeNull();
    // Not a lock either direction: the book itself is untouched.
    expect(pill("Edge to edge").checked).toBe(true);
    expect(save().disabled).toBe(false);
  });

  it("leaves the shortcut alone when the new answer is still a book that destination makes", () => {
    renderDialog();
    // Lulu offers both of its own books — switching between them is not a
    // disagreement, so the shortcut should survive it.
    fillInFor("lulu");
    fireEvent.click(pill("Hardcover"));
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    expect(screen.getByRole("menuitemradio", { name: "Lulu" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("never calls the book a product we guessed at, whoever is printing it", () => {
    renderDialog();
    for (const destination of PRINT_DESTINATIONS) {
      fillInFor(destination.id);
      expect(screen.getByRole("dialog").textContent).not.toMatch(/spiral cookbook|hardcover book/i);
    }
  });

  it("puts the way out to the place's site under the menu once one is chosen", () => {
    renderDialog();
    expect(screen.queryByRole("button", { name: /^open /i })).toBeNull();
    fillInFor("copy-shop");
    expect(screen.getByRole("button", { name: /open staples/i })).toBeTruthy();
    fillInFor("home");
    expect(screen.queryByRole("button", { name: /^open /i })).toBeNull();
  });

  it("closes the menu when a choice is made, and on Escape", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fillInFor("lulu");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("says what Save produces right under the shortcut, before the questions that follow it", () => {
    renderDialog();
    expect(document.querySelector(".cookbook-ready__downloads")).toBeNull();
    fillInFor("copy-shop");
    const summary = document.querySelector(".cookbook-ready__downloads")!;
    expect(summary.textContent).toMatch(/one file/i);
    // Right under "Fill in for", ahead of the binding question, and well
    // before Save. The cover-size fields no longer live on this screen at
    // all — they only appear later, in the "download your cover" step, once
    // a real spine width is available.
    const order = (a: Element, b: Element) =>
      a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(order(screen.getByRole("button", { name: /fill in for/i }), summary)).toBeTruthy();
    expect(
      order(summary, screen.getByRole("radiogroup", { name: "How it will be bound" })),
    ).toBeTruthy();
    expect(order(summary, save())).toBeTruthy();
    fireEvent.click(pill("Edge to edge"));
    expect(document.querySelector(".cookbook-cover-size")).toBeNull();
  });

  it("draws the menu outside the dialog, so it is not confined to its size", () => {
    renderDialog();
    fireEvent.click(screen.getByRole("button", { name: /fill in for/i }));
    const menu = screen.getByRole("menu");
    expect(screen.getByRole("dialog").contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
  });

  it("puts the check mark on the right of the chosen row", () => {
    renderDialog();
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
    renderDialog();
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
    renderDialog();
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
    renderDialog();
    fillInFor("home");
    fireEvent.click(pill("Hardcover"));
    fireEvent.click(pill("8 × 10 in"));
    const line = document.querySelector(".cookbook-ready__downloads")!.textContent!;
    expect(line).toBe("You’ll get two files: the pages and the cover.");
    expect(line).not.toMatch(/service|shop/i);
  });

  it("keeps the answers when the shortcut is cleared", () => {
    renderDialog();
    fillInFor("blurb");
    fillInFor("");
    expect(pill("Hardcover").checked).toBe(true);
    expect(pill("8 × 10 in").checked).toBe(true);
  });

});
