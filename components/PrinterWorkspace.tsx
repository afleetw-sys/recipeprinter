"use client";

import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { PrintQueue } from "@/components/PrintQueue";
import { PrintIcon } from "@/components/icons";
import { useQueue } from "@/lib/queue";

// The interactive heart of RecipePrinter: importing recipes and managing the
// print queue. Split out from the homepage so the page itself can stay a server
// component, all the marketing, FAQ, and structured-data content around this
// renders as static HTML for search engines and a fast first paint.
export function PrinterWorkspace() {
  const router = useRouter();
  const {
    items,
    hydrated,
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
  const selectedRecipeIds = items
    .filter((it) => it.status === "ready" && it.selected)
    .map((it) => it.id);
  const hasProject = hydrated && items.length > 0;

  function handlePreview(ids: string[]) {
    if (ids.length === 0) return;
    router.push(`/print?ids=${ids.join(",")}`);
  }

  function handlePrint(ids: string[]) {
    if (ids.length === 0) return;
    router.push(`/print?ids=${ids.join(",")}&print=1`);
  }

  return (
    <div
      className={`rp-printer-workspace ${
        hasProject ? "rp-printer-workspace--active" : "rp-printer-workspace--landing"
      }`}
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
              className="text-[1.24rem] font-extrabold tracking-[-0.025em]"
            >
              Recipes to print{hydrated && items.length > 0 ? ` (${items.length})` : ""}
            </h2>
          </div>
          {hasProject && (
            <div className="flex items-center gap-cp-3 flex-wrap">
              <button
                type="button"
                className="btn btn-primary btn-compact"
                disabled={selectedRecipeIds.length === 0}
                onClick={() => handlePreview(selectedRecipeIds)}
              >
                {selectedRecipeIds.length > 0 ? `Preview (${selectedRecipeIds.length})` : "Preview"}
              </button>
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
          )}
        </div>

        {hydrated ? (
          <PrintQueue
            items={items}
            canRetry={canRetry}
            onToggle={toggleSelected}
            onRetry={retry}
            onRemove={remove}
            onSetAllSelected={setAllSelected}
            onClear={clear}
          />
        ) : (
          <div className="h-24 rounded-2xl border border-dashed border-line-strong" />
        )}
      </section>
    </div>
  );
}
