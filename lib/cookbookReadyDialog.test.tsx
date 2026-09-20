// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import { PRINT_DESTINATIONS } from "@/lib/printDestinations";

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

describe("the cookbook print dialog's destination list", () => {
  it("lists every place with generic text and no price", () => {
    renderDialog(95);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/[$£€]|\bfrom about\b|\bcost/i);
    for (const destination of PRINT_DESTINATIONS) {
      expect(screen.getByText(destination.name)).toBeTruthy();
      if (destination.tagline) expect(screen.getByText(destination.tagline)).toBeTruthy();
    }
  });

  it("reads the same whatever the page count", () => {
    const short = renderDialog(12).container.ownerDocument.body.textContent;
    cleanup();
    const long = renderDialog(400).container.ownerDocument.body.textContent;
    expect(long).toBe(short);
  });
});
