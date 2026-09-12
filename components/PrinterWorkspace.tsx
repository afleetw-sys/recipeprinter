"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { useQueue } from "@/lib/queue";
import { useProjectMeta } from "@/lib/project";
import { fileProjectLocally } from "@/lib/localProjects";
import { stashPendingImport, type PendingImport } from "@/lib/pendingImport";
import { imageLabel, validateImageFiles } from "@/lib/imageImport";
import { track } from "@/lib/analytics";
import { nextPaint } from "@/lib/nextPaint";
import type { ImportMethod, ImportTab, QueueItem } from "@/types/recipe";

/**
 * The front door: the box you put a recipe into, and nothing else.
 *
 * It used to be the box AND the print list, with a count over it, a Clear all
 * in a menu beside it, a remove on every row and a fixed tray on mobile. Every
 * one of those said the same thing — this page holds your stuff, it waits for
 * you — and the code meant the opposite. Arriving here FILES the project and
 * releases it (see the effect below), deliberately, so a page advertising a
 * queue it is about to put away could not be made to read straight. Two groups
 * of cooks were reading it two ways, and the ones who read "cart" pressed Back
 * for recipe two and found an empty page.
 *
 * The clear stays. What goes is the cart around it, and once the cart is gone
 * the clear stops being perceptible at all: a front door being empty is just
 * what front doors are.
 *
 * The other half is where an import lands. Adding used to happen here and
 * looking at the result happened on /print, so verifying each recipe — which is
 * what people actually do, one at a time, after each import — cost a round trip
 * per recipe. So this hands off: whatever gets pasted, dropped or picked here is
 * stashed and finished on /print, where the printable card is, and /print grew
 * a paste field at the end of its rail so recipe two never has to come back.
 *
 * Handing the payload over rather than importing it here is also what keeps
 * this safe. `useQueue` is per-instance React state with no cross-instance sync
 * (see `isOursToAwait` on the print page), so a parse STARTED here would finish
 * inside this unmounted hook's closure and /print's copy would never hear about
 * it. Nothing here starts one. The stash is the same carrier the SEO landing
 * pages have always used, so this is one mechanism, not a second.
 *
 * Split out from the homepage so the page itself can stay a server component:
 * all the marketing, FAQ and structured-data content around this renders as
 * static HTML for search engines and a fast first paint. This file is
 * deliberately free of Firebase for the same reason.
 */
export function PrinterWorkspace({
  initialImportMode = "url",
  importSubmitLabel = "Start printing",
}: {
  initialImportMode?: ImportTab;
  /**
   * The submit button's words. Same as the SEO capture blocks use, because it
   * is the same act on a different doorstep.
   *
   * "Add" was the question the cart model answered wrong: add to WHAT? But
   * naming the thing you get is harder than it looks, because this one button
   * serves four sources and every noun is wrong for some of them. "Cards"
   * promises 4x6 and hands over a Letter page, which is the default size.
   * "Recipes", plural, is what a library pick produces and not what a pasted
   * link does. Naming the ACT instead is true of one recipe and forty, at
   * either size, and in a cookbook.
   */
  importSubmitLabel?: string;
}) {
  const router = useRouter();
  const { items, hydrated, clear } = useQueue();
  const { meta, hydrated: metaHydrated, startNewProject } = useProjectMeta();
  const [handoffError, setHandoffError] = useState<string | null>(null);
  /** A handoff is on its way to /print, so the submit wears a spinner instead
      of its arrow. Stays true for the rest of this page's life — see `handoff`. */
  const [opening, setOpening] = useState(false);
  const leftCookbookRef = useRef(false);
  const warmedRef = useRef(false);

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
   * The cost used to be that the round trip home → preview → home did not
   * preserve the queue, so you could not come back here to add one more recipe
   * to the job you were just previewing. That cost is gone rather than
   * accepted: there is no round trip to make any more, because adding happens
   * on /print now, at the end of the rail.
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

  /**
   * Start fetching the print page the moment someone touches the importer.
   *
   * The one real cost of handing off is that /print is the heavier page: this
   * one is statically prerendered and free of Firebase, and that one is
   * neither. Warming it on first interaction spends the download while the cook
   * is still typing rather than after they press the button. On interaction
   * rather than on mount, because plenty of people who load the home page never
   * import anything, and pre-loading the whole app for all of them to save a
   * second for some of them is the wrong trade.
   */
  function warmWorkspace() {
    if (warmedRef.current) return;
    warmedRef.current = true;
    router.prefetch("/print");
  }

  /**
   * Hand the payload to /print and go there.
   *
   * Unlike the SEO capture blocks, a failed stash does NOT navigate anyway.
   * There the alternative was stranding someone on a marketing page; here it
   * would mean walking them to an empty print page having quietly dropped the
   * link they just pasted. Staying put, with a sentence saying so, is the
   * better failure.
   */
  async function handoff(payload: PendingImport) {
    setHandoffError(null);
    setOpening(true);
    // Counted here rather than where the parse starts: by then every import in
    // the product looks like it happened on /print. See `recipe_import_submitted`.
    track("recipe_import_submitted", { surface: "home", source: sourceOf(payload) });
    if (!(await stashPendingImport(payload))) {
      setOpening(false);
      setHandoffError("We couldn't open that recipe. Please try again.");
      return;
    }
    // Let the button's spinner reach the screen before the navigation takes the
    // thread. Measured on a production build: from this click to a recipe card
    // on /print, the browser painted ZERO frames — React committed, Next
    // resolved the route and the whole tree mounted in one unbroken run of the
    // main thread. So the button could not look pressed however it was styled,
    // and every millisecond of that gap read as a dead button rather than as
    // work happening. One frame is the whole fix, and one frame is what it
    // costs.
    await nextPaint();
    router.push("/print");
    // Deliberately not cleared. `router.push` is a client navigation, so this
    // component stays mounted and visible until /print has rendered — turning
    // the spinner off here would put the arrow back under the cursor for the
    // rest of the wait, which is the state this exists to replace.
  }

  /** The payload's import method, for the handoff event above. */
  function sourceOf(payload: PendingImport): ImportMethod {
    if (payload.kind === "url") return "url";
    if (payload.kind === "text") return "text";
    if (payload.kind === "images" || payload.kind === "imageFiles") return "image";
    // A library pick is whatever library it came from, and a batch is never
    // mixed: the picker that produced it only reads one source.
    return payload.recipes[0]?.method ?? "manual";
  }

  function handleAddUrl(url: string) {
    void handoff({ kind: "url", url });
  }

  function handleAddText(text: string) {
    void handoff({ kind: "text", text });
  }

  /** Already-parsed recipes from a library picker: CookPilot, a Paprika file. */
  function handleAddReadyRecipes(recipes: QueueItem[]): number {
    if (recipes.length === 0) return 0;
    void handoff({ kind: "ready", recipes });
    return recipes.length;
  }

  /**
   * Photos are decoded here and handed over as data URLs, the way the SEO
   * capture blocks do it. The queue's own `addImageFiles` would start the read
   * AND the parse inside this hook, and the parse is the half that must not
   * begin on a page that is about to unmount.
   */
  function handleAddImageFiles(files: File[], label: string) {
    setHandoffError(null);
    setOpening(true);
    /**
     * Check, then go. The decode does not happen here any more.
     *
     * It used to: `prepareImageDataUrls` downscaled every file and ran libheif
     * over any HEIC, and only then was the navigation allowed to start. So the
     * slowest handoff in the product was spent entirely on the page the cook
     * was leaving, showing a spinner on a button and nothing else — no photo
     * names, no per-file progress, no workspace. /print has all of that and was
     * kept waiting for it.
     *
     * What has to happen before leaving is the DETERMINATION, not the work:
     * `validateImageFiles` answers format, count, zero-byte, per-file and total
     * size synchronously, which is everything that could send the cook back to
     * this box to choose different files. Anything it passes is importable, so
     * the files go over as they are and `addImageFiles` on /print does the
     * decoding where it can be watched.
     *
     * The post-decode size check (a photo still too large after resizing) moves
     * with the decode, and lands as a normal import failure on the recipe's own
     * row rather than as a sentence under a button on a page nobody is on.
     */
    const validationError = validateImageFiles(files);
    if (validationError) {
      setOpening(false);
      setHandoffError(validationError.message);
      return;
    }
    void handoff({ kind: "imageFiles", files, label: label || imageLabel(files) });
  }

  return (
    <div className="rp-printer-workspace rp-printer-workspace--landing">
      {/* Warmed on the first touch anywhere in the panel, which covers typing,
          dropping a photo and opening a library alike — see `warmWorkspace`. */}
      <div
        className="rp-workspace-import"
        onPointerDownCapture={warmWorkspace}
        onFocusCapture={warmWorkspace}
      >
        <ImportPanel
          /* Always empty, and that is the point: this page holds no print list,
             so nothing can be marked as already added and every import source
             stays on show. */
          items={[]}
          workspace
          initialMode={initialImportMode}
          submitLabel={importSubmitLabel}
          submitBusy={opening}
          onAddUrl={handleAddUrl}
          onAddImageFiles={(files, label) => void handleAddImageFiles(files, label)}
          onAddText={handleAddText}
          onAddReadyRecipes={handleAddReadyRecipes}
        />
        {handoffError && (
          <p className="field-error mt-cp-3" role="alert">
            {handoffError}
          </p>
        )}
      </div>
    </div>
  );
}
