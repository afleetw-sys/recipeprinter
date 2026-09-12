"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { createCurrentPrintJob, seedSharedQueueItem } from "@/lib/queue";
import { writePrintSettings } from "@/lib/printSettings";
import type { SharedRecipeCard } from "@/types/sharedRecipeCard";

/**
 * Hands a shared recipe off to the real /print page rather than rendering a
 * second copy of its UI: seeds the recipe into the visitor's session queue
 * (exactly like importing one normally), applies the admin's saved print
 * settings, then redirects into /print?ids=...&shared=1. That's what keeps
 * the shared-link experience — including premium template gating, the
 * settings panel, and every future change to /print — in sync with the real
 * product instead of drifting as a separately hand-built clone.
 */
export function SharedRecipeCardRedirect({ card }: { card: SharedRecipeCard }) {
  const router = useRouter();

  useEffect(() => {
    // No view counter here any more.
    //
    // It was one Firestore write per visit against a single document, which is
    // the one shape Firestore is worst at — a share link that got any traction
    // would have pushed that doc past its sustained write ceiling and started
    // failing. And it was write-only: nothing ever read `viewCount` back, so
    // the number was never seen by anyone. PostHog already counts this page.
    //
    // Removing it takes the whole Firebase SDK off this route. Everything left
    // below is browser storage, so a shared link now hands off to /print
    // without loading app, auth, app-check and firestore — or running
    // reCAPTCHA — on a page whose entire job is to redirect.
    const id = seedSharedQueueItem(card.recipe, card.slug);
    createCurrentPrintJob([id]);
    writePrintSettings({
      cardSize: card.cardSize,
      template: card.template,
      doubleSided: card.doubleSided,
      showPhoto: card.showPhoto,
      showSourceUrl: card.showSourceUrl,
      showCutLines: card.showCutLines,
    });
    // `shared=1` is read by nothing in this app — deliberately. It rides along
    // as a dimension on the `$pageview` PostHog records for /print, which is
    // the only way to tell a visit that arrived through a share link from one
    // that started at the homepage. Keep it, or that split disappears; don't go
    // looking for the code that consumes it, because there isn't any.
    router.replace(`/print?ids=${id}&shared=1`);
    // Runs once on mount with the card this component was given; re-seeding
    // on any later re-render would duplicate the queue item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full flex flex-col">
      <SiteHeader compact sticky />
      <div className="flex-1 grid place-items-center text-ink-soft">Preparing…</div>
    </div>
  );
}
