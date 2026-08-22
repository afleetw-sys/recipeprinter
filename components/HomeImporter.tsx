"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { stashPendingImport } from "@/lib/pendingImport";
import { ensureWorkingProjectId } from "@/lib/project";
import { readQueue } from "@/lib/queue";
import { stashArrivingImporter } from "@/lib/studioHandoff";
import type { QueueItem } from "@/types/recipe";

/**
 * The homepage's importer — every method, and nothing after it.
 *
 * The homepage used to be a second copy of the app: the importer, the recipe
 * list, "Clear all", a duplicate list again in a mobile tray, and a Preview
 * button that walked you to the workspace. So one product had two front doors,
 * each with a different idea of what you could do with a recipe once you had
 * one — you could remove a recipe here but not open it, open it there but not
 * remove it from a list that didn't exist.
 *
 * That split is also where a real bug lived. The homepage had to *release* an
 * open cookbook so it wouldn't show a bound book as a stack of loose cards, and
 * releasing meant deleting.
 *
 * So the homepage keeps exactly the half that belongs on a marketing page —
 * saying what this is, and letting you start — and hands the rest to the studio.
 * It is the same shape the sixteen SEO landing pages have always had (see
 * components/seo/SeoCapture); the homepage was the one that never got the memo.
 * The difference here is the full four-mode panel rather than a single field,
 * because the root has no single intent the way "print a recipe from a URL" does.
 *
 * `items={[]}` is not a placeholder — there is no queue on this page, and it is
 * also what keeps all four import methods visible, since the panel only folds
 * the extras into an overflow menu once something has been added.
 */
export function HomeImporter() {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const prefetched = useRef(false);
  /**
   * Set the moment a hand-off starts, and never cleared — this page is on its
   * way out. Clicking Add used to clear the field and then do nothing visible
   * for the second it takes the studio to mount, which is the whole of the
   * feedback for the most important action on the page.
   */
  const [handingOff, setHandingOff] = useState(false);

  /**
   * Fetch the studio the moment someone touches this panel.
   *
   * Without it the hand-off suspends: the studio is a 256 KB route, and the
   * click to Add is the first time the browser has ever heard of it. Measured
   * on a production build, that put roughly a second of "Opening your project…"
   * between the two screens — a whole unrelated screen in the middle of a
   * movement, which is a cut rather than a slow transition, and the reason the
   * importer's travel read as not happening at all. Someone who has focused the
   * field is going to need this route; fetching it while they type means the
   * navigation has nothing left to wait for.
   *
   * Deliberately on first interaction rather than on mount. This page is
   * statically prerendered and carries the organic search traffic, and a
   * visitor who reads it and leaves should not be made to download the whole
   * editor — the same trade the header makes for the account menu.
   */
  const prefetchStudio = useCallback(() => {
    if (prefetched.current) return;
    prefetched.current = true;
    router.prefetch(`/projects/${encodeURIComponent(ensureWorkingProjectId())}`);
  }, [router]);

  /**
   * Stash, then go. Deliberately not "parse here, then go": waiting on a
   * marketing page with nothing to look at, and only then jumping, is the worst
   * of both. The studio shows the import in flight, and the recipe becomes a
   * page in front of you.
   *
   * The push happens even if stashing failed (private mode, quota) — landing in
   * the working tool with an empty importer beats being stranded here with a
   * form that appeared to do nothing.
   */
  const handoff = (payload: Parameters<typeof stashPendingImport>[0]) => {
    setHandingOff(true);
    stashArrivingImporter({
      // Where this panel is standing right now, so the studio's own panel can
      // travel from here rather than simply appearing somewhere else. Measured
      // before the navigation, because after it this page is gone.
      importPanel: panelRef.current?.getBoundingClientRect() ?? null,
      // Read here, synchronously, because this is the last moment anyone can
      // answer it cheaply. The studio's own answer costs a store hydration —
      // ~930ms in a production build — and it used to spend that time showing
      // a spinner in the middle of this hand-off. Nothing between this line
      // and the next paint can add a ready recipe, so it is still true on
      // arrival.
      studioIsEmpty: !readQueue().some((item) => item.status === "ready" && item.recipe),
    });
    // The id is read (and, first time, minted) here rather than in the studio,
    // because the destination has to exist before the navigation does. It is
    // the working copy's own id, so arriving there opens what is already in
    // this browser rather than fetching anything.
    const projectId = ensureWorkingProjectId();
    void stashPendingImport(payload).finally(() =>
      router.push(`/projects/${encodeURIComponent(projectId)}`),
    );
  };

  return (
    <div ref={panelRef} onFocusCapture={prefetchStudio} onPointerDownCapture={prefetchStudio}>
    <ImportPanel
      busy={handingOff}
      items={[]}
      onAddUrl={(url) => handoff({ kind: "url", url })}
      onAddText={(text) => handoff({ kind: "text", text })}
      onAddImages={(images, label) => handoff({ kind: "images", images, label })}
      onAddCookPilotRecipes={(recipes: QueueItem[]) => {
        handoff({ kind: "cookpilot", recipes });
        return recipes.length;
      }}
      // Nothing to remove — this page keeps no list.
      onRemoveRecipe={() => undefined}
    />
    </div>
  );
}
