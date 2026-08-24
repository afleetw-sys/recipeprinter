"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { PrintQueue } from "@/components/PrintQueue";
import {
  ChevronDownIcon,
  ICON_SIZE,
  MoreVerticalIcon,
  PrintIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { createCurrentPrintJob, useQueue } from "@/lib/queue";
import { useProjectMeta } from "@/lib/project";
import { fileProjectLocally } from "@/lib/localProjects";
import { takePendingImport } from "@/lib/pendingImport";
import type { ImportMethod } from "@/types/recipe";

// The interactive heart of RecipePrinter: importing recipes and managing the
// print queue. Split out from the homepage so the page itself can stay a server
// component, all the marketing, FAQ, and structured-data content around this
// renders as static HTML for search engines and a fast first paint.
export function PrinterWorkspace({
  initialImportMode = "url",
  importSubmitLabel,
  consumePendingImport = false,
}: {
  initialImportMode?: ImportMethod;
  importSubmitLabel?: string;
  /**
   * When true, on mount (after the queue hydrates) pick up any recipe a visitor
   * started importing on an SEO landing page and finish it here — the capture →
   * app handoff. Enabled on the home page, which is the handoff target.
   */
  consumePendingImport?: boolean;
}) {
  const router = useRouter();
  const {
    items,
    focusedItemId,
    focusNonce,
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
  const { meta, hydrated: metaHydrated, startNewProject } = useProjectMeta();
  /**
   * "Clear all" means "I'm starting something else", so it releases the
   * project identity as well as the recipes. Clearing only the list left the
   * id pointing at whatever was last saved, and the next autosave wrote the
   * new recipes over that cookbook. The saved book is untouched — it keeps
   * its own id, document and purchase, and stays in the library.
   */
  function startOver() {
    clear();
    startNewProject();
  }
  const readyItems = items.filter((it) => it.status === "ready");
  const readyRecipeIds = readyItems.map((it) => it.id);
  const hasProject = hydrated && items.length > 0;
  const readyToPrintLabel =
    hydrated && readyItems.length > 0 ? `Ready to print (${readyItems.length})` : "Ready to print";

  const [menuOpen, setMenuOpen] = useState(false);
  /** The cookbook just filed on the way in, so the page can say where it went. */
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [hasShownEmptyState, setHasShownEmptyState] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const skipProjectIntro = hydratedWithItems && hasProject && !hasShownEmptyState;
  const hasAutoOpenedTrayRef = useRef(false);
  const prevItemsLengthRef = useRef<number | null>(null);
  const consumedPendingRef = useRef(false);
  const leftCookbookRef = useRef(false);

  useEffect(() => {
    if (hydrated && items.length === 0) setHasShownEmptyState(true);
  }, [hydrated, items.length]);

  /**
   * Coming home means you finished with what you were working on, so this page
   * starts clean — but the project gets FILED on the way out, not thrown away.
   *
   * This applies to card jobs now, not only cookbooks. Releasing the project id
   * as well as the list is the point: whatever gets imported next is a NEW
   * project rather than another edit of the last one. It also settles what home
   * is for — it used to show a cookbook's recipes under "Ready to print" with a
   * Preview button that walked straight back into the book, which was a second
   * door into one document and a bound book dressed up as loose cards.
   *
   * The cost is that the round trip home → preview → home no longer preserves
   * the queue, so you cannot come back here to add one more recipe to the job
   * you were just previewing. That is only acceptable because the workspace has
   * its own importer: adding another recipe to the SAME project happens there,
   * and coming home is unambiguously "I'm done with that one".
   *
   * This is the fallback path — the browser Back button, a bookmark, a fresh
   * tab. It files to the device only, because this page is deliberately free of
   * Firebase (it is the statically prerendered homepage) and loading an auth
   * SDK here to write one document would put it on every visitor's first paint.
   * A signed-in cook who clicks the logo is saved to their account by the
   * workspace itself before it navigates; one who arrives by any other route is
   * filed locally here and adopted into the account on the next save.
   *
   * What that release used to skip is the filing. It cleared the queue and the
   * meta — including the durable localStorage recovery mirror underneath both —
   * so for anyone whose book was not already in an account, "go back to add
   * another recipe" deleted the book. Signed out, autosave never runs (see
   * `autosaveEnabled` on the print page) and signed-out purchase is explicitly
   * supported, so that included books people had paid for. And because the
   * trigger is this page MOUNTING with `cookbookMode` set, not any click, it
   * also fired on a fresh tab: the recovery mirror would faithfully restore the
   * book, and then this would delete it.
   *
   * So write the document to the on-device shelf first (lib/localProjects), and
   * only release the working copy once it is filed. The homepage is just as
   * clean, "one place to manage the book" still holds — that place is
   * /projects, which now lists on-device books beside account ones — and
   * nothing is destroyed. A book already saved to the account is filed too and
   * swept on the next library load, which is cheaper than trying to work out
   * here whether the account has it.
   *
   * If the shelf cannot be written to at all (private mode, quota), keep the
   * working copy rather than release it: a slightly confusing homepage is a far
   * better failure than a deleted cookbook.
   *
   * Waits on both hydrations so the reset can't race the rehydrate and land on
   * a queue that is only momentarily empty.
   */
  useEffect(() => {
    if (!hydrated || !metaHydrated || leftCookbookRef.current) return;
    const hasPrintable = items.some((item) => item.status === "ready" && item.recipe);
    // A project with recipes is filed before it is released, and a shelf that
    // can't be written to (private mode, quota) means we keep the working copy
    // instead. `leftCookbookRef` is only raised once the release actually
    // happens — raising it before the attempt would turn one failed write, or
    // one render where the queue hadn't landed yet, into a project that is
    // never filed AND never released.
    //
    // An empty project has nothing to file and nothing to lose, so it just
    // releases.
    if (hasPrintable && !fileProjectLocally(items, meta)) return;
    leftCookbookRef.current = true;
    clear();
    startNewProject();
  }, [hydrated, metaHydrated, meta, items, clear, startNewProject]);

  // Capture → app handoff: a visitor who pasted a link, dropped a photo, or
  // pasted text on an SEO landing page arrives here mid-import. Wait for the
  // queue to hydrate first so seeding the pending item can't race the
  // sessionStorage rehydrate, then consume it exactly once.
  useEffect(() => {
    if (!consumePendingImport || !hydrated || consumedPendingRef.current) return;
    consumedPendingRef.current = true;
    let cancelled = false;
    void takePendingImport().then((pending) => {
      if (cancelled || !pending) return;
      if (pending.kind === "url") addUrl(pending.url);
      else if (pending.kind === "text") addText(pending.text);
      else if (pending.kind === "cookpilot") addCookPilotRecipes(pending.recipes);
      else if (pending.kind === "images") addImages(pending.images, pending.label);
    });
    return () => {
      cancelled = true;
    };
  }, [consumePendingImport, hydrated, addUrl, addText, addImages, addCookPilotRecipes]);

  useEffect(() => {
    if (!hasProject) setMobileQueueOpen(false);
  }, [hasProject]);

  // First-recipe nudge: pop the sticky tray open so mobile users discover
  // it's there and expandable, then leave it open. Only fires on a genuine
  // 0 -> 1 transition observed while mounted (not just "the queue happened
  // to be non-empty when this page loaded").
  useEffect(() => {
    if (!hydrated) return;
    const prevLength = prevItemsLengthRef.current;
    prevItemsLengthRef.current = items.length;
    if (prevLength !== 0 || items.length === 0 || hasAutoOpenedTrayRef.current) return;
    hasAutoOpenedTrayRef.current = true;
    setMobileQueueOpen(true);
  }, [hydrated, items.length]);

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
      {/* Nothing here announces the filing any more. Saying "X is saved in
          your projects" answered a question the cook had already been made to
          ask, on the page AFTER the one where the thing disappeared. The
          workspace now shows it going instead — the project flies into the
          profile as you leave (lib/flyIntoProfile) — which answers it before it
          is asked and teaches where saved work lives, which the sentence never
          did. */}

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
              {readyToPrintLabel}
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
                      className="mode-toggle-menu__item mode-toggle-menu__item--danger"
                      onClick={() => {
                        startOver();
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
              {readyRecipeIds.length > 0 ? `Preview (${readyRecipeIds.length})` : "Preview"}
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
            focusNonce={focusNonce}
          />
        ) : (
          <div className="h-24 rounded-2xl border border-dashed border-line-strong" />
        )}
      </section>

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
                  {readyToPrintLabel}
                </span>
                {readyItems.length === 0 && (
                  <span className="rp-mobile-print-tray__meta">
                    {items.length > 0 ? `${items.length} added` : "No recipes yet"}
                  </span>
                )}
              </span>
              <ChevronDownIcon size={ICON_SIZE.lg} className="rp-mobile-print-tray__chevron" />
            </button>

            <button
              type="button"
              className={`btn btn-primary btn-compact rp-mobile-print-tray__print ${
                readyRecipeIds.length > 0 ? "rp-mobile-print-tray__print--ready" : ""
              }`}
              disabled={readyRecipeIds.length === 0}
              onClick={() => handlePrint(readyRecipeIds)}
            >
              <PrintIcon size={ICON_SIZE.md} />
              {readyRecipeIds.length > 0 ? `Preview (${readyRecipeIds.length})` : "Preview"}
            </button>
          </div>

          <div id="rp-mobile-queue-content" className="rp-mobile-print-tray__content">
            {hasProject && (
              <div className="rp-mobile-print-tray__actions">
                <button
                  type="button"
                  className="btn-ghost btn-ghost--danger btn-compact"
                  onClick={startOver}
                >
                  <TrashIcon size={ICON_SIZE.md} />
                  Clear all
                </button>
              </div>
            )}
            {hydrated ? (
              <PrintQueue
                items={items}
                canRetry={canRetry}
                onRetry={retry}
                onRemove={remove}
                animateItems={!skipProjectIntro}
                focusedItemId={focusedItemId}
                focusNonce={focusNonce}
              />
            ) : (
              <div className="h-24 rounded-2xl border border-dashed border-line-strong" />
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
