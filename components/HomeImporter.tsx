"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { stashPendingImport } from "@/lib/pendingImport";
import { ensureWorkingProjectId } from "@/lib/project";
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
    // Where this panel is standing right now, so the studio's own panel can
    // travel from here rather than simply appearing somewhere else. Measured
    // before the navigation, because after it this page is gone.
    stashArrivingImporter(panelRef.current?.getBoundingClientRect() ?? null);
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
    <div ref={panelRef}>
    <ImportPanel
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
