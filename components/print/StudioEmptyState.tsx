"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import { ImportPanel } from "@/components/ImportPanel";
import { PendingImportRows } from "@/components/print/PendingImportRows";
import { flipTransform } from "@/lib/flipTransform";
import { takeArrivingImporter } from "@/lib/studioHandoff";
import type { QueueItem } from "@/types/recipe";

/** The geometry the hand-off animation flies out of (see Studio). */
export interface StudioHandoffRects {
  pendingCard: DOMRect | null;
  importPanel: DOMRect | null;
}

/**
 * A project with nothing on its first page yet.
 *
 * This is deliberately the studio, not a page about the studio. It renders the
 * real shell — `recipe-print-page`, `recipe-print-shell`, `recipe-page-rail`,
 * `recipe-page-canvas`, `recipe-config-panel` — so the columns, widths, sticky
 * behaviour and every responsive rule are the ones the workspace already has,
 * rather than a second layout that has to be kept in step with it.
 *
 * What was here before was a centred one-column page with a headline and a
 * form: perfectly tidy, and a completely different screen from the one it led
 * to. Arriving felt like being moved to another part of the site rather than
 * watching your project fill in, and the importer's travel had nothing to
 * travel across.
 *
 * So each column shows its own absence honestly:
 *
 *  - The rail keeps its place and shows the slot page one will occupy, which
 *    is where the thumbnail is about to appear.
 *  - The canvas holds a real sheet at page proportions — the same white,
 *    hairline and radius as `.recipe-page-scaler` — with the importer on it.
 *    A blank page you put a recipe onto is the truest description of what this
 *    product does, and it is exactly the object that is about to have a recipe
 *    on it.
 *  - The setup panel carries whatever the caller can honestly offer before
 *    there is anything to lay out (`configSlot`). Today that is the theme
 *    picker, whose previews are generic samples anyway — so choosing a design
 *    while adding your first recipe works, and is not placeholder chrome.
 */
export function StudioEmptyState({
  items,
  onAddUrl,
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
  onRemoveRecipe,
  canRetry,
  onRetry,
  captureRef,
  configSlot,
}: {
  items: QueueItem[];
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
  canRetry: (item: QueueItem) => boolean;
  onRetry: (id: string) => void;
  /** Where this layout sits, handed up so the workspace can animate out of it
      once the first recipe lands. See `runStudioHandoff` in Studio. */
  captureRef: MutableRefObject<StudioHandoffRects>;
  /** What the setup column can offer with nothing laid out yet. Passed in
      rather than built here: the values it needs (template, entitlements,
      toasts) all live in the studio, and this component has no business
      knowing about purchases. */
  configSlot?: ReactNode;
}) {
  const pendingRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const pending = items.filter((item) => item.status !== "ready");

  /**
   * Keep the two rects that the hand-off animation flies out of.
   *
   * Measured here rather than read later because by the time the workspace
   * exists this component is gone — the switch is an early return in the
   * studio, not a sibling swap. A ref is the only thing that survives it.
   */
  const capture = useCallback(() => {
    captureRef.current = {
      pendingCard: pendingRef.current?.getBoundingClientRect() ?? null,
      importPanel: panelRef.current?.getBoundingClientRect() ?? null,
    };
  }, [captureRef]);

  useLayoutEffect(() => {
    capture();
    window.addEventListener("resize", capture);
    return () => window.removeEventListener("resize", capture);
  });

  /**
   * Arrive by travelling, not by appearing.
   *
   * The front door hands an import over by navigating here, so without this the
   * importer someone was just typing into is replaced by a different-looking
   * one somewhere else on screen, with nothing connecting them. It is the same
   * object; showing it move is the only way to say so.
   *
   * Runs once, on mount, and only when the front door actually left a rect
   * behind (`takeArrivingImporter` clears as it reads) — so a bookmark, the
   * logo or Back all just render, with nothing flying anywhere.
   */
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || typeof window === "undefined") return;
    const from = takeArrivingImporter()?.importPanel ?? null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const transform = flipTransform(from, el.getBoundingClientRect());
    if (!transform) return;
    el.style.transformOrigin = "top left";
    el.animate([{ transform }, { transform: "none" }], {
      duration: 380,
      easing: "cubic-bezier(0.2, 0, 0, 1)",
      fill: "backwards",
    });
    // Mount only — a later re-render must not replay it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="recipe-print-shell rp-empty px-cp-6 print:p-0">
      {/* Where page one is going to be. Not interactive: the importer in the
          middle is the way to fill it, and a second control here would just be
          two buttons for one job. */}
      <div className="recipe-page-rail rp-empty__rail" aria-hidden="true">
        <div className="rp-empty__slot">
          <span className="rp-empty__slot-num">1</span>
        </div>
        <p className="rp-empty__rail-note">Your pages appear here</p>
      </div>

      <div className="recipe-page-canvas rp-empty__canvas">
        <div className="rp-empty__sheet">
          <div className="rp-empty__sheet-body">
            <div className="rp-empty__intro">
              <h1 className="rp-empty__title text-cp-h2 font-extrabold tracking-[-0.03em]">
                Add a recipe to start
              </h1>
              <p className="rp-empty__lede mt-cp-2 text-ink-soft leading-relaxed">
                Paste a link, upload a photo, or paste the text. Every recipe becomes a page you
                can print — and a set of them can become a cookbook.
              </p>
            </div>

            <div ref={panelRef}>
              <ImportPanel
                // The empty studio is nothing but this panel — it must not fold
                // its options away the moment a parse starts. `items` still
                // goes through so the CookPilot picker can tell what's already
                // been added.
                expanded
                items={items}
                onAddUrl={onAddUrl}
                onAddImages={onAddImages}
                onAddText={onAddText}
                onAddCookPilotRecipes={onAddCookPilotRecipes}
                onRemoveRecipe={onRemoveRecipe}
              />
            </div>
          </div>
        </div>

        {/* The import in flight. Without this, submitting cleared the field and
            then nothing happened at all for the second or four that parsing
            takes — the one moment someone most needs to be told something is
            happening. The rail's own pending row, so the thing that appears
            here is the thing that ends up over there. */}
        {pending.length > 0 && (
          <div className="rp-empty__pending" ref={pendingRef}>
            <PendingImportRows
              items={pending}
              canRetry={canRetry}
              onRetry={onRetry}
              onRemove={onRemoveRecipe}
            />
          </div>
        )}
      </div>

      {configSlot && <aside className="recipe-config-panel rp-empty__config">{configSlot}</aside>}
    </main>
  );
}
