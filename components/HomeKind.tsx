"use client";

import { createContext, useContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CommunityGallery } from "@/components/CommunityGallery";
import { COMMUNITY_PHOTOS, COOKBOOK_PHOTOS } from "@/lib/communityGallery";

/** Which kind of project the front door is about to start. Recipe cards is
    the default and asks for nothing; Cookbook is the one-project, $19.99,
    unlimited-recipe alternative. */
export type ImportKind = "cards" | "cookbook";

const HomeKindContext = createContext<{
  kind: ImportKind;
  setKind: (kind: ImportKind) => void;
} | null>(null);

/**
 * The homepage's tab choice, for the whole page rather than the panel.
 *
 * The Cookbook tab used to swap only the box under the tabs, so everything
 * around it still talked about recipe cards: the subhead, the holiday banner
 * pitching the cookbook you were already looking at, and a strip of printed
 * cards. A tab that changes one box reads as a banner dropped into the page.
 * This lets the subhead and the photo strip follow it too.
 *
 * The page itself stays a server component: this wraps it, and the parts that
 * change are small client islands inside it.
 */
export function HomeKindProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<ImportKind>("cards");
  return <HomeKindContext.Provider value={{ kind, setKind }}>{children}</HomeKindContext.Provider>;
}

/** Falls back to its own state outside the homepage's provider. */
export function useHomeKind() {
  const shared = useContext(HomeKindContext);
  const [kind, setKind] = useState<ImportKind>("cards");
  return shared ?? { kind, setKind };
}

/** The hero's second line. Server-rendered as the recipe-cards sentence, which
    is what search engines and a first paint get. */
export function HomeSubhead() {
  const { kind } = useHomeKind();
  return kind === "cookbook"
    ? <>Make a printed cookbook from the recipes your family cooks.</>
    : <>Turn web and social recipe links into printable recipe cards for your kitchen.</>;
}

/** The photo strip under the front door, showing whichever thing the tab makes. */
export function HomeGallery() {
  const { kind } = useHomeKind();
  return kind === "cookbook" ? (
    <CommunityGallery
      key="cookbook"
      items={COOKBOOK_PHOTOS}
      heading="Printed cookbooks"
      label="Photos of printed cookbooks"
    />
  ) : (
    <CommunityGallery key="cards" items={COMMUNITY_PHOTOS} />
  );
}

/**
 * The choice between recipe cards and a cookbook, heading the front door's
 * panel (PrinterWorkspace).
 *
 * The selected tab carries a thick accent underline that SLIDES to it rather
 * than each tab drawing its own: one bar, moved, reads as a single control
 * picking between two states. It is measured off the active button's own box,
 * since the two labels aren't the same width. Same technique as
 * `SegmentedControl`'s thumb (components/Controls.tsx); not reused directly
 * because these tabs carry their own padding, dimming and "New" badge.
 */
export function HomeKindTabs() {
  const { kind, setKind } = useHomeKind();
  const tabListRef = useRef<HTMLDivElement | null>(null);
  const [tabFill, setTabFill] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = tabListRef.current;
    if (!root) return;
    function measure() {
      const active = root!.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      // From the rects, not `offsetLeft`/`offsetWidth`, which round to whole
      // pixels and leave the bar a pixel off at 125% or 150% display scaling.
      const tab = active.getBoundingClientRect();
      if (tab.width <= 0) return;
      const row = root!.getBoundingClientRect();
      setTabFill({ left: tab.left - row.left, width: tab.width });
    }
    measure();
    // Every tab, not just the row: Karla swaps in after the fallback face has
    // drawn the labels, and the fallback is wider on Windows, so whatever
    // resizes a tab moves the bar with it.
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    root.querySelectorAll<HTMLElement>('[role="tab"]').forEach((tab) => observer.observe(tab));
    const fonts = document.fonts;
    fonts?.ready.then(measure).catch(() => undefined);
    fonts?.addEventListener?.("loadingdone", measure);
    return () => {
      observer.disconnect();
      fonts?.removeEventListener?.("loadingdone", measure);
    };
  }, [kind]);

  const tabClass = (selected: boolean) =>
    `relative z-10 flex items-center gap-1 px-cp-2 pb-cp-2 pt-cp-1 text-cp-body-lg font-bold text-ink transition-opacity duration-200 ease-out ${
      selected ? "opacity-100" : "opacity-45 hover:opacity-70"
    }`;

  return (
    <div
      ref={tabListRef}
      className="relative isolate mx-auto flex w-fit gap-cp-4"
      role="tablist"
      aria-label="What you're printing"
    >
      {tabFill && (
        <span
          aria-hidden
          className="absolute bottom-0 left-0 z-0 h-[3px] bg-[var(--cp-accent)] transition-[transform,width] duration-200 ease-out"
          style={{ transform: `translateX(${tabFill.left}px)`, width: `${tabFill.width}px` }}
        />
      )}
      <button type="button" role="tab" aria-selected={kind === "cards"} onClick={() => setKind("cards")} className={tabClass(kind === "cards")}>
        Recipe cards
      </button>
      <button type="button" role="tab" aria-selected={kind === "cookbook"} onClick={() => setKind("cookbook")} className={tabClass(kind === "cookbook")}>
        Cookbook
        <span className="rp-new-badge">New</span>
      </button>
    </div>
  );
}
