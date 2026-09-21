// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
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
