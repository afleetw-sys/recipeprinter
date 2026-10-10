"use client";

import { useEffect, useRef } from "react";
import { markImportsUnlimited, rememberedImportUsage } from "@/lib/importMeter";
import { IMPORT_LIMIT_TRIGGER, proUpgradeCopy } from "@/lib/proUpgradeCopy";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";

/**
 * The Pro upgrade dialog for the free-import count on pages with no editor
 * (the homepage, the SEO pages): the same dialog and checkout `/print` opens,
 * through `useStandaloneProUpgrade`, so Upgrade never sends anyone off to a
 * different page. Mounted only once it is needed, so the banner costs nothing
 * until then; `openSignal` reopens it on each later press.
 *
 * `spent` is someone who is out of imports: they get the allowance's own
 * wording ("You've used your 10 free imports"), as on `/print`. Anyone else
 * pressed Upgrade and gets the plain Pro dialog.
 */
export function ImportBannerUpgrade({ openSignal, spent = false }: { openSignal: number; spent?: boolean }) {
  // Which wording this opening uses is decided when it opens and then left
  // alone. `spent` changes underneath an open dialog (a purchase clears the
  // count), and following it would swap the dialog's words, and its trigger,
  // mid-checkout.
  const opening = useRef({ signal: openSignal, spent });
  if (opening.current.signal !== openSignal) opening.current = { signal: openSignal, spent };
  const spentAtOpen = opening.current.spent;

  const { openProUpgrade, proUpgradeDialog, proMessage, proJustActivated } = useStandaloneProUpgrade(
    spentAtOpen ? IMPORT_LIMIT_TRIGGER : "import_banner",
    spentAtOpen ? proUpgradeCopy([], IMPORT_LIMIT_TRIGGER, rememberedImportUsage()) : undefined,
  );

  // Opens once per press, and only then. This used to list `openProUpgrade`
  // as a dependency, whose identity changes whenever the trigger does: when a
  // purchase cleared the count, the effect ran again and the dialog flashed
  // back up over a cook who had just paid.
  const open = useRef(openProUpgrade);
  open.current = openProUpgrade;
  useEffect(() => {
    open.current();
  }, [openSignal]);

  // Paid: the free count no longer applies, from this moment.
  useEffect(() => {
    if (proJustActivated) markImportsUnlimited();
  }, [proJustActivated]);

  return (
    <>
      {proUpgradeDialog}
      {proMessage && (
        <p className="mt-cp-1 text-cp-caption text-ink-soft" role="status">
          {proMessage}
        </p>
      )}
    </>
  );
}
