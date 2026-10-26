"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportPanel } from "@/components/ImportPanel";
import { stashPendingImport } from "@/lib/pendingImport";
import { track } from "@/lib/analytics";
import type { ImportTab, QueueItem } from "@/types/recipe";
import { handoffDedupeInput, refuseImportIfSpent } from "@/lib/importMeter";

// The capture on every SEO landing page: the same Link / Recipe apps / Image /
// Text switch the homepage uses, opening on the source the page is about. On
// submit it stashes the payload and hands off to the print page, which
// finishes the import.
//
// Every page shows every source. Pages used to show only the one input their
// search phrase named, and visitors who landed on the link page holding a
// recipe to type out typed it into the link box, were told it wasn't a URL,
// and left. A page still opens on its own source and names that field its own
// way (see `fieldLabel`); the others are one tap away.
//
// It used to hand off to "/", and that was teaching the wrong thing in the first
// ten seconds someone ever spent here: a visitor who pasted one link was
// deposited on a page showing their recipe sitting in a list with a Clear all
// above it and a Preview button beside it, which reads as a cart. It is not a
// cart. That page empties itself on arrival by design, so the next time they
// came back to it for recipe two, the recipe was gone. Landing them where the
// printable card actually is skips the lesson and the round trip both.

/**
 * Hands a stashed payload to `/print`, which finishes the import — the same
 * shape PrinterWorkspace's own `handoff` uses for the homepage.
 */
function useHandoff() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [handoffError, setHandoffError] = useState<string | null>(null);

  async function handoff(payload: Parameters<typeof stashPendingImport>[0]) {
    // Out of free imports: the upgrade dialog opens on this page instead of
    // sending the cook to /print to be refused there. Recipe-app picks aren't
    // counted against the allowance.
    if (payload.kind !== "ready" && payload.kind !== "empty" && (await refuseImportIfSpent(handoffDedupeInput(payload))))
      return;
    setBusy(true);
    track("recipe_import_submitted", {
      surface: "capture",
      source:
        payload.kind === "images" || payload.kind === "imageFiles"
          ? "image"
          : payload.kind === "text"
            ? "text"
            : payload.kind === "ready"
              ? (payload.recipes[0]?.method ?? "manual")
              : "url",
    });
    setHandoffError(null);
    // Never navigate to an empty /print: it opens on "No recipes yet" and the
    // cook's photo is gone without a word. A storage refusal no longer lands
    // here (lib/pendingImport holds the payload in memory instead), so this is
    // only for a stash that truly could not be made.
    if (!(await stashPendingImport(payload))) {
      setBusy(false);
      setHandoffError("We couldn't open that recipe. Please try again.");
      return;
    }
    router.push("/print");
  }

  return { busy, handoff, handoffError };
}

export function SeoCapture({
  initialMode = "url",
  submitLabel = "Make it printable",
  fieldLabel,
  placeholder,
  uploadTitle,
}: {
  initialMode?: ImportTab;
  submitLabel?: string;
  /**
   * What the page's own source's field is called, when the page can say it
   * more precisely than the generic mode name. On the Instagram page "Recipe
   * link" is a box that could be for anything, and "Instagram link" is an
   * answer to the question the visitor arrived with. It also quietly rules a
   * source in: someone holding a Reel URL, unsure whether that counts as a
   * recipe link, can stop wondering. The other tabs keep their generic copy.
   */
  fieldLabel?: string;
  placeholder?: string;
  uploadTitle?: string;
}) {
  const { busy, handoff, handoffError } = useHandoff();

  return (
    // No reserved min-height here on purpose. That was the original fix for
    // the hero photo jumping as the mode changed height — it worked, but it
    // also left dead space below every shorter mode, pushing whatever comes
    // after this (the reassurance line) down with it. The real fix is the
    // page passing `asideAlign: "center-once"` to LandingHero (see
    // HeroSplitRow): the photo's position is measured once after mount and
    // frozen, so it doesn't depend on this column's height after that, and
    // there's nothing left to reserve against.
    <>
      <ImportPanel
        // Always empty, and that is the point: this page holds no print list,
        // so nothing can be marked as already added and every source stays on
        // show — see PrinterWorkspace, which does the same.
        items={[]}
        workspace
        initialMode={initialMode}
        fieldCopy={{ mode: initialMode, label: fieldLabel, placeholder, uploadTitle }}
        submitLabel={submitLabel}
        submitBusy={busy}
        autoFocusUrl={false}
        onAddUrl={(url) => void handoff({ kind: "url", url })}
        onAddText={(text) => void handoff({ kind: "text", text })}
        onAddImageFiles={(files, label) => void handoff({ kind: "imageFiles", files, label })}
        onAddReadyRecipes={(recipes: QueueItem[]) => {
          if (recipes.length === 0) return 0;
          void handoff({ kind: "ready", recipes });
          return recipes.length;
        }}
      />
      {handoffError && <p className="field-error" role="alert">{handoffError}</p>}
    </>
  );
}
