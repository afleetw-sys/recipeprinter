"use client";

import { useRouter } from "next/navigation";
import { LogoMark, Wordmark } from "@/components/Logo";
import { ImportPanel } from "@/components/ImportPanel";
import { PrintQueue } from "@/components/PrintQueue";
import { PrintIcon } from "@/components/icons";
import { useQueue } from "@/lib/queue";

export default function Home() {
  const router = useRouter();
  const {
    items,
    hydrated,
    addUrl,
    addImages,
    addText,
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

  function handlePreview(ids: string[]) {
    if (ids.length === 0) return;
    router.push(`/print?ids=${ids.join(",")}`);
  }

  function handlePrint(ids: string[]) {
    if (ids.length === 0) return;
    router.push(`/print?ids=${ids.join(",")}&print=1`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar — mirrors CookPilot's cp-topbar */}
      <header className="no-print flex items-center gap-cp-3 px-cp-6 min-h-[62px]">
        <LogoMark size={30} />
        <Wordmark className="text-[1.2rem]" />
      </header>

      <main className="flex-1 px-cp-6 pb-cp-7">
        <div className="max-w-queue mx-auto flex flex-col gap-cp-7 pt-cp-6 sm:pt-cp-7">
          {/* Hero header — mirrors CookPilot's section-header (eyebrow + h1) */}
          <div className="max-w-panel">
            <h1 className="text-[clamp(2rem,5vw,2.75rem)] font-extrabold tracking-[-0.04em] leading-[1.05]">
              Print any recipe
              <br />
              without the clutter.
            </h1>
            <p className="mt-cp-3 text-ink-soft text-[1.02rem] leading-relaxed">
              Paste a recipe URL, upload a photo, or paste recipe text. We&apos;ll turn it into a
              clean, letter-size recipe you can print in seconds.
            </p>
          </div>

          {/* Import panel */}
          <ImportPanel onAddUrl={addUrl} onAddImages={addImages} onAddText={addText} />

          {/* Recipes to print */}
          <section className="flex flex-col gap-cp-4">
            <div className="flex items-center justify-between gap-cp-4 flex-wrap">
              <h2 className="text-[1.24rem] font-extrabold tracking-[-0.025em]">Recipes to print</h2>
              <div className="flex items-center gap-cp-3">
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  disabled={selectedRecipeIds.length === 0}
                  onClick={() => handlePreview(selectedRecipeIds)}
                >
                  {selectedRecipeIds.length > 0
                    ? `Preview selected (${selectedRecipeIds.length})`
                    : "Preview selected"}
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  disabled={selectedRecipeIds.length === 0}
                  onClick={() => handlePrint(selectedRecipeIds)}
                >
                  <PrintIcon size={16} />
                  {selectedRecipeIds.length > 0
                    ? `Print selected (${selectedRecipeIds.length})`
                    : "Print selected"}
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
                onSetAllSelected={setAllSelected}
                onClear={clear}
              />
            ) : (
              <div className="h-24 rounded-2xl border border-dashed border-line-strong" />
            )}
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="no-print px-cp-6 py-cp-5 border-t border-line">
        <div className="max-w-content mx-auto w-full flex items-center justify-between text-[0.8rem] text-ink-soft">
          <span>
            RecipePrinter is a{" "}
            <a
              href="https://cookpilotapp.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand hover:underline font-semibold"
            >
              CookPilot
            </a>{" "}
            product · session-based, nothing is saved
          </span>
          <span>© {new Date().getFullYear()} CookPilot</span>
        </div>
      </footer>
    </div>
  );
}
