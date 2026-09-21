// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ImagePicker } from "@/components/ImagePicker";

// ImagePicker checks the deck's mobile breakpoint on mount (`useIsMobileSheet`),
// which jsdom doesn't implement.
beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }));
});

afterEach(cleanup);

/**
 * The deck unmounts a page's ImagePicker when it scrolls out of the active
 * window and builds a fresh instance when it scrolls back in (see PrintDeck's
 * `isActive && renderActiveControls(...)`). `openSignal` lives in the parent
 * so it survives that teardown — which means a signal the parent never clears
 * looks, to a brand-new instance, exactly like a fresh "open me" request.
 */
function ParentWithSignal({ mounted, requestedTick }: { mounted: boolean; requestedTick: number }) {
  // Mirrors app/print/page.tsx's `photoDialog` state: a tick the parent sets
  // to open the picker, and `clearPhotoDialogSignal`-style consumption that
  // resets it back to nothing once acted on.
  const [consumedTick, setConsumedTick] = useState(0);
  const effectiveSignal = requestedTick > consumedTick ? requestedTick : undefined;
  if (!mounted) return null;
  return (
    <ImagePicker
      current={undefined}
      images={[]}
      onSelect={() => {}}
      openSignal={effectiveSignal}
      onOpenSignalConsumed={() => setConsumedTick(requestedTick)}
    />
  );
}

describe("ImagePicker openSignal", () => {
  it("does not reopen on remount once the signal has been consumed", () => {
    const { rerender } = render(<ParentWithSignal mounted={true} requestedTick={1} />);
    // The signal opens the dialog the first time.
    expect(screen.queryByText("Choose an image")).not.toBe(null);

    // Scroll away: the deck unmounts this page's picker entirely.
    rerender(<ParentWithSignal mounted={false} requestedTick={1} />);
    expect(screen.queryByText("Choose an image")).toBe(null);

    // Scroll back: a brand-new ImagePicker mounts. Without clearing the
    // signal on consumption, this remount would see the same stale tick and
    // reopen the dialog even though nobody clicked anything.
    rerender(<ParentWithSignal mounted={true} requestedTick={1} />);
    expect(screen.queryByText("Choose an image")).toBe(null);
  });

  it("still opens for a genuinely new signal", () => {
    const { rerender } = render(<ParentWithSignal mounted={true} requestedTick={1} />);
    expect(screen.queryByText("Choose an image")).not.toBe(null);
    rerender(<ParentWithSignal mounted={false} requestedTick={1} />);
    rerender(<ParentWithSignal mounted={true} requestedTick={2} />);
    expect(screen.queryByText("Choose an image")).not.toBe(null);
  });
});

/**
 * Every collage-capable slot now goes through the grid unconditionally (see
 * ImagePicker's own note on why there is no single-vs-multiple switch), but a
 * cover or chapter that hasn't been touched since that change can still carry
 * a photo the OLD way — `current`, not `gridImages`. It has to read as one
 * already-ticked tile, not as if the page had no photo at all.
 */
describe("ImagePicker grid selection", () => {
  it("shows a photo stored the old way (current) as already selected", () => {
    render(
      <ImagePicker
        current="a.jpg"
        images={["a.jpg", "b.jpg"]}
        onSelect={() => {}}
        gridImages={[]}
        onGridChange={() => {}}
        openSignal={1}
        onOpenSignalConsumed={() => {}}
      />,
    );
    const tile = screen.getByLabelText("Remove photo 1 from collage");
    expect(tile.getAttribute("aria-pressed")).toBe("true");
  });

  it("migrates it into gridImages, rather than duplicating it, on the next tap elsewhere", () => {
    const onGridChange = vi.fn();
    render(
      <ImagePicker
        current="a.jpg"
        images={["a.jpg", "b.jpg"]}
        onSelect={() => {}}
        gridImages={[]}
        onGridChange={onGridChange}
        openSignal={1}
        onOpenSignalConsumed={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Add photo 2 to collage"));
    expect(onGridChange).toHaveBeenCalledWith(["a.jpg", "b.jpg"]);
  });

  it("tapping the already-selected legacy photo removes it, same as any other tile", () => {
    const onGridChange = vi.fn();
    render(
      <ImagePicker
        current="a.jpg"
        images={["a.jpg", "b.jpg"]}
        onSelect={() => {}}
        gridImages={[]}
        onGridChange={onGridChange}
        openSignal={1}
        onOpenSignalConsumed={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Remove photo 1 from collage"));
    expect(onGridChange).toHaveBeenCalledWith([]);
  });
});
