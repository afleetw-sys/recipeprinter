"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { PrintQueue } from "@/components/PrintQueue";
import { MoreVerticalIcon, PrintIcon } from "@/components/icons";
import { createCurrentPrintJob, useQueue } from "@/lib/queue";

// The interactive heart of RecipePrinter: importing recipes and managing the
// print queue. Split out from the homepage so the page itself can stay a server
// component, all the marketing, FAQ, and structured-data content around this
// renders as static HTML for search engines and a fast first paint.
export function PrinterWorkspace() {
  const router = useRouter();
  const {
    items,
    hydrated,
    hydratedWithItems,
    addUrl,
    addImages,
    addText,
    addCookPilotRecipes,
    retry,
    canRetry,
    remove,
    toggleSelected,
    setAllSelected,
    clear,
  } = useQueue();
  const readyItems = items.filter((it) => it.status === "ready");
  const selectedRecipeIds = readyItems.filter((it) => it.selected).map((it) => it.id);
  const hasProject = hydrated && items.length > 0;
  const skipProjectIntro = hydratedWithItems;
  const allSelected =
    readyItems.length > 0 && selectedRecipeIds.length === readyItems.length;

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // Print takes them to the print preview, where they can review the layout and
  // trigger the actual print from the browser dialog.
  function handlePrint(ids: string[]) {
    if (ids.length === 0) return;
    if (createCurrentPrintJob(ids)) {
      router.push("/print");
    } else {
      router.push(`/print?ids=${ids.join(",")}`);
    }
  }

  return (
    <div
      className={`rp-printer-workspace ${
        hasProject ? "rp-printer-workspace--active" : "rp-printer-workspace--landing"
      } ${skipProjectIntro ? "rp-printer-workspace--no-intro" : ""}`}
    >
      {/* Import panel */}
      <div className="rp-workspace-import">
        <ImportPanel
          items={items}
          workspace
          onAddUrl={addUrl}
          onAddImages={addImages}
          onAddText={addText}
          onAddCookPilotRecipes={addCookPilotRecipes}
          onRemoveRecipe={remove}
        />
      </div>

      {/* Recipes to print */}
      <section
        className="rp-workspace-project flex flex-col gap-cp-4"
        aria-labelledby="rp-queue-heading"
      >
        <div className="flex items-start justify-between gap-cp-4 flex-wrap">
          <div>
            <h2
              id="rp-queue-heading"
              className="text-[1.06rem] font-extrabold tracking-[-0.02em]"
            >
              Recipes to print{hydrated && items.length > 0 ? ` (${items.length})` : ""}
            </h2>
          </div>
          <div className="flex items-center gap-cp-2">
            {hasProject && (
              <div ref={menuRef} className="relative">
                <button
                  type="button"
                  aria-label="More list actions"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="btn-ghost btn-compact"
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  <MoreVerticalIcon size={18} />
                </button>

                {menuOpen && (
                  <div className="mode-toggle-menu" role="menu" aria-label="Recipe list actions">
                    <button
                      type="button"
                      role="menuitem"
                      className="mode-toggle-menu__item"
                      onClick={() => {
                        setAllSelected(!allSelected);
                        setMenuOpen(false);
                      }}
                    >
                      {allSelected ? "Deselect all" : "Select all"}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="mode-toggle-menu__item"
                      onClick={() => {
                        clear();
                        setMenuOpen(false);
                      }}
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-compact"
              disabled={selectedRecipeIds.length === 0}
              onClick={() => handlePrint(selectedRecipeIds)}
            >
              <PrintIcon size={16} />
              {selectedRecipeIds.length > 0 ? `Print (${selectedRecipeIds.length})` : "Print"}
            </button>
          </div>
        </div>

        {hydrated ? (
          <PrintQueue
            items={items}
            canRetry={canRetry}
            onToggle={toggleSelected}
            onRetry={retry}
            onRemove={remove}
            animateItems={!skipProjectIntro}
          />
        ) : (
          <div className="h-24 rounded-2xl border border-dashed border-line-strong" />
        )}
      </section>
    </div>
  );
}
