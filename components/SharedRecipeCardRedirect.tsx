"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { createCurrentPrintJob, seedSharedQueueItem } from "@/lib/queue";
import { writePrintSettings } from "@/lib/printSettings";
import { ensureWorkingProjectId } from "@/lib/project";
import { incrementSharedRecipeCardViewCount } from "@/lib/sharedRecipeCards";
import type { SharedRecipeCard } from "@/types/sharedRecipeCard";

/**
 * Hands a shared recipe off to the real studio rather than rendering a second
 * copy of its UI: seeds the recipe into the visitor's session queue (exactly
 * like importing one normally), applies the admin's saved print settings, then
 * opens it at `/projects/<id>?ids=...&shared=1`. That's what keeps the
 * shared-link experience — including premium template gating, the settings
 * panel, and every future change to the studio — in sync with the real product
 * instead of drifting as a separately hand-built clone.
 *
 * The project is the visitor's own working copy, not the sharer's: what they
 * received is one recipe card, and it lands in their workspace beside anything
 * else they have. Nothing about the share grants access to a project.
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
      showPhoto: card.showPhoto,
      showSourceUrl: card.showSourceUrl,
      showCutLines: card.showCutLines,
    });
    router.replace(
      `/projects/${encodeURIComponent(ensureWorkingProjectId())}?ids=${id}&shared=1`,
    );
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
