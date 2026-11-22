"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { useQueue } from "@/lib/queue";
import { useProjectMeta } from "@/lib/project";
import { releaseWorkingProject } from "@/lib/releaseWorkingProject";
import { clearPendingImport, hasPendingImport } from "@/lib/pendingImport";
import { sessionStore } from "@/lib/storage";
import type { FieldSwitches } from "@/lib/recipeFields";
import { BOOK_FROM_CARDS_KEY, CARDS_FROM_COOKBOOK_KEY } from "@/lib/linkedRecipes";

/**
 * "Print as recipe cards" from a cookbook lands here on its way to /print.
 *
 * The cards are a new job, so the book has to be set aside first, the same way
 * "New recipe cards" in Projects does it (`releaseWorkingProject`, then a new
 * project id). That cannot happen on /print itself: clearing the page you are
 * looking at puts an empty workspace on screen until the next one arrives,
 * which is the flash /print learned never to do (see `handleNavigateHome`).
 * So the clean-up happens here, on the destination, behind the same
 * "Preparing…" /print shows while it loads, and /print then picks the recipes
 * up from the pending import the book left (lib/pendingImport), like any other
 * hand-off.
 *
 * The new job is `cardsFromCookbook`: a signed-in cook's cards are saved to
 * Projects straight away, like a new cookbook (see `keepsItself`).
 */
export default function PrintCardsPage() {
  const router = useRouter();
  const { items, hydrated, clear } = useQueue();
  const { meta, hydrated: metaHydrated, startNewProject } = useProjectMeta();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !hydrated || !metaHydrated) return;
    done.current = true;
    // Reached without the recipes (a reload of this address, Back): there is
    // nothing to print, so the book is left exactly as it was.
    if (!hasPendingImport()) {
      router.replace("/print");
      return;
    }
    if (!releaseWorkingProject(items, meta, clear)) {
      // The shelf refused the book (private mode, a full quota). Losing the
      // book is worse than not opening the cards, and the recipes must not
      // land in the book instead, so they are dropped.
      clearPendingImport();
      router.replace("/print");
      return;
    }
    // "Make a cookbook" from recipe cards: a new book, which opens with the
    // cookbook welcome like every new book, and knows where any recipes that
    // didn't fit the free book are waiting.
    const bookFromCards = sessionStore.getJson<{ projectId: string | null; waiting: number }>(BOOK_FROM_CARDS_KEY);
    sessionStore.remove(BOOK_FROM_CARDS_KEY);
    if (bookFromCards) {
      sessionStore.remove(CARDS_FROM_COOKBOOK_KEY);
      startNewProject({ cookbook: true, fillFrom: bookFromCards });
      router.replace("/print");
      return;
    }
    const fieldSwitches = sessionStore.getJson<FieldSwitches>(CARDS_FROM_COOKBOOK_KEY) ?? undefined;
    sessionStore.remove(CARDS_FROM_COOKBOOK_KEY);
    startNewProject({ cardsFromCookbook: true, fieldSwitches });
    router.replace("/print");
  }, [hydrated, metaHydrated, items, meta, clear, startNewProject, router]);

  return (
    <div className="h-full flex flex-col">
      <SiteHeader sticky chrome />
      <RecipeLoadingState className="flex-1" label="Preparing…" />
    </div>
  );
}
