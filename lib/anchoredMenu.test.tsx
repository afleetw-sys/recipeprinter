// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AnchoredMenu } from "@/components/AnchoredMenu";

afterEach(cleanup);

/** A trigger inside a box that clips everything, like the rail's scroll area. */
function Harness() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  return (
    <div style={{ overflow: "hidden", width: 50 }} data-testid="clipper">
      <div ref={anchorRef}>
        <button type="button" onClick={() => setOpen((isOpen) => !isOpen)}>
          Open
        </button>
      </div>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} label="Sort">
          <button type="button" role="menuitemradio" aria-checked="false">
            One
          </button>
          <button type="button" role="menuitemradio" aria-checked="true">
            Two
          </button>
        </AnchoredMenu>
      )}
    </div>
  );
}

describe("AnchoredMenu", () => {
  it("is drawn on the page, so a clipping ancestor cannot cut it off", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");
    // The bug: the sort menu lived inside the rail's scroll box and was cut at its edge.
    expect(screen.getByTestId("clipper").contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain("anchored-menu");
  });

  it("starts on the chosen row and moves with the arrow keys", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const [one, two] = screen.getAllByRole("menuitemradio");
    expect(document.activeElement).toBe(two);
    fireEvent.keyDown(two, { key: "ArrowDown" });
    expect(document.activeElement).toBe(one);
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on a press elsewhere but not on one inside itself", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.pointerDown(screen.getByRole("menuitemradio", { name: "One" }));
    expect(screen.queryByRole("menu")).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
