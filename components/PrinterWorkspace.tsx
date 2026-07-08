"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { PrintQueue } from "@/components/PrintQueue";
import {
  ChevronDownIcon,
  ICON_SIZE,
  MoreVerticalIcon,
  PrintIcon,
  TrashIcon,
} from "@/components/icons";
import { createCurrentPrintJob, useQueue } from "@/lib/queue";
import type { ImportMethod } from "@/types/recipe";

// The interactive heart of RecipePrinter: importing recipes and managing the
// print queue. Split out from the homepage so the page itself can stay a server
// component, all the marketing, FAQ, and structured-data content around this
// renders as static HTML for search engines and a fast first paint.
export function PrinterWorkspace({
  initialImportMode = "url",
  importSubmitLabel,
}: {
  initialImportMode?: ImportMethod;
  importSubmitLabel?: string;
}) {
  const router = useRouter();
  const {
    items,
    focusedItemId,
    hydrated,
    hydratedWithItems,
    addUrl,
    addImages,
    addText,
    addCookPilotRecipes,
    retry,
    canRetry,
    remove,
    clear,
  } = useQueue();
  const readyItems = items.filter((it) => it.status === "ready");
  const readyRecipeIds = readyItems.map((it) => it.id);
  const hasProject = hydrated && items.length > 0;

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [hasShownEmptyState, setHasShownEmptyState] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const skipProjectIntro = hydratedWithItems && hasProject && !hasShownEmptyState;

  useEffect(() => {
    if (hydrated && items.length === 0) setHasShownEmptyState(true);
  }, [hydrated, items.length]);

  useEffect(() => {
    if (!hasProject) setMobileQueueOpen(false);
  }, [hasProject]);

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
          initialMode={initialImportMode}
          submitLabel={importSubmitLabel}
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
              className="text-cp-h2 font-extrabold tracking-[-0.02em]"
            >
              Ready to print{hydrated && readyItems.length > 0 ? ` (${readyItems.length})` : ""}
            </h2>
          </div>
          <div className="flex items-center gap-cp-2 ml-auto">
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
                  <MoreVerticalIcon size={ICON_SIZE.lg} />
                </button>

                {menuOpen && (
                  <div className="mode-toggle-menu mode-toggle-menu--compact" role="menu" aria-label="Recipe list actions">
                    <button
                      type="button"
                      role="menuitem"
                      className="mode-toggle-menu__item"
                      onClick={() => {
                        clear();
                        setMenuOpen(false);
                      }}
                    >
                      <TrashIcon size={ICON_SIZE.lg} />
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-compact"
              disabled={readyRecipeIds.length === 0}
              onClick={() => handlePrint(readyRecipeIds)}
            >
              <PrintIcon size={ICON_SIZE.md} />
              {readyRecipeIds.length > 0 ? `Print (${readyRecipeIds.length})` : "Print"}
            </button>
          </div>
        </div>

        {hydrated ? (
          <PrintQueue
            items={items}
            canRetry={canRetry}
            onRetry={retry}
            onRemove={remove}
            animateItems={!skipProjectIntro}
            focusedItemId={focusedItemId}
          />
        ) : (
          <div className="h-24 rounded-2xl border border-dashed border-line-strong" />
        )}
      </section>

      {hydrated && (
        <section
          className={`rp-mobile-print-tray ${mobileQueueOpen ? "is-open" : ""}`}
          aria-labelledby="rp-mobile-queue-heading"
        >
          <div className="rp-mobile-print-tray__panel">
            <div className="rp-mobile-print-tray__bar">
              <button
                type="button"
                className="rp-mobile-print-tray__toggle"
                aria-expanded={mobileQueueOpen}
                aria-controls="rp-mobile-queue-content"
                onClick={() => setMobileQueueOpen((open) => !open)}
              >
                <span>
                  <span id="rp-mobile-queue-heading" className="rp-mobile-print-tray__title">
                    Ready to print
                  </span>
                  <span className="rp-mobile-print-tray__meta">
                    {readyItems.length > 0
                      ? `${readyItems.length} ready`
                      : items.length > 0
                        ? `${items.length} added`
                        : "No recipes yet"}
                  </span>
                </span>
                <ChevronDownIcon size={ICON_SIZE.lg} className="rp-mobile-print-tray__chevron" />
              </button>

              <button
                type="button"
                className="btn btn-primary btn-compact rp-mobile-print-tray__print"
                disabled={readyRecipeIds.length === 0}
                onClick={() => handlePrint(readyRecipeIds)}
              >
                <PrintIcon size={ICON_SIZE.md} />
                {readyRecipeIds.length > 0 ? `Print (${readyRecipeIds.length})` : "Print"}
              </button>
            </div>

            <div id="rp-mobile-queue-content" className="rp-mobile-print-tray__content">
              {hasProject && (
                <div className="rp-mobile-print-tray__actions">
                  <button
                    type="button"
                    className="btn-ghost btn-compact"
                    onClick={clear}
                  >
                    <TrashIcon size={ICON_SIZE.md} />
                    Clear all
                  </button>
                </div>
              )}
              <PrintQueue
                items={items}
                canRetry={canRetry}
                onRetry={retry}
                onRemove={remove}
                animateItems={!skipProjectIntro}
                focusedItemId={focusedItemId}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
