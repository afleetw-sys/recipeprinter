"use client";

import { useEffect, useRef } from "react";
import { markImportsUnlimited, rememberedImportUsage } from "@/lib/importMeter";
import { IMPORT_LIMIT_TRIGGER, proUpgradeCopy } from "@/lib/proUpgradeCopy";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";

/**
 * The Pro upgrade dialog on pages with no editor (the homepage, the SEO
 * pages): the same dialog and checkout `/print` opens, through
 * `useStandaloneProUpgrade`, so Upgrade never sends anyone off to a different
 * page. Mounted only once it is needed (see `FrontDoorUpgrade`), so it costs
 * nothing until then; `openSignal` reopens it on each later press.
 *
 * `spent` is someone who is out of imports: they get the allowance's own
 * wording ("You've used your 10 free imports"), as on `/print`. Anyone else
 * pressed Upgrade and gets the plain Pro dialog, under `trigger`.
 */
export function FrontDoorUpgradeDialog({
  openSignal,
  trigger,
  spent = false,
}: {
  openSignal: number;
  trigger: string;
  spent?: boolean;
}) {
  // Which wording this opening uses is decided when it opens and then left
  // alone. `spent` changes underneath an open dialog (a purchase clears the
  // count), and following it would swap the dialog's words, and its trigger,
  // mid-checkout.
  const opening = useRef({ signal: openSignal, trigger, spent });
  if (opening.current.signal !== openSignal) opening.current = { signal: openSignal, trigger, spent };
  const { trigger: triggerAtOpen, spent: spentAtOpen } = opening.current;

  const { openProUpgrade, proUpgradeDialog, proMessage, proJustActivated } = useStandaloneProUpgrade(
    spentAtOpen ? IMPORT_LIMIT_TRIGGER : triggerAtOpen,
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
      {/* A cancelled or failed checkout. Whatever opened the dialog sits in
          the header, with no room under it, so the note floats at the foot of
          the page. */}
      {proMessage && (
        <p
          className="fixed inset-x-0 bottom-cp-5 z-[var(--z-toast)] mx-auto w-fit max-w-[calc(100%-32px)] rounded border border-line bg-card px-cp-4 py-cp-2 text-cp-small text-ink"
          role="status"
        >
          {proMessage}
        </p>
      )}
    </>
  );
}
