// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/** A trigger whose anchor is only attached while its menu is open, as each
    chapter's ••• in the organizer is (one ref shared by every chapter). React
    attaches that ref in the same commit that mounts the menu, after the menu
    has already looked for it. */
function LateAnchorHarness() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={open ? anchorRef : undefined}>
      <button type="button" onClick={() => setOpen((isOpen) => !isOpen)}>
        Open
      </button>
      {open && (
        <AnchoredMenu anchorRef={anchorRef} onClose={() => setOpen(false)} label="Chapter">
          <button type="button" role="menuitem">
            Rename
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

  // The organizer's chapter ••• opened a menu that was never placed or
  // focused, so it sat off screen and the click seemed to do nothing. A menu
  // whose anchor attaches in the same commit as the menu is placed and
  // focused all the same, as is one whose anchor was there all along.
  for (const [name, Component] of [
    ["an anchor there all along", Harness],
    ["an anchor attached as it opens", LateAnchorHarness],
  ] as const) {
    it(`is placed and focused with ${name}`, async () => {
      render(<Component />);
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      const menu = screen.getByRole("menu");
      await waitFor(() => expect(menu.style.top).not.toBe(""));
      expect(menu.style.left).not.toBe("");
      expect(menu.contains(document.activeElement)).toBe(true);
    });
  }
});
