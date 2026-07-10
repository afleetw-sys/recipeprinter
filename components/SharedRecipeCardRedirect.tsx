"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { createCurrentPrintJob, seedSharedQueueItem } from "@/lib/queue";
import { writePrintSettings } from "@/lib/printSettings";
import { incrementSharedRecipeCardViewCount } from "@/lib/sharedRecipeCards";
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
    // Rough visit count, not detailed analytics — best-effort, never blocks the handoff.
    incrementSharedRecipeCardViewCount(card.slug).catch(() => {});

    const id = seedSharedQueueItem(card.recipe, card.slug);
    createCurrentPrintJob([id]);
    writePrintSettings({
      cardSize: card.cardSize,
      template: card.template,
      doubleSided: card.doubleSided,
      showCutLines: card.showCutLines,
      showPhoto: card.showPhoto,
      showSourceUrl: card.showSourceUrl,
      cardsPerSheet: card.cardsPerSheet,
    });
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
