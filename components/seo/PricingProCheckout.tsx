"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";

/**
 * The /pricing page's way into checkout: the same Pro upgrade dialog and
 * purchase flow the home page's Recipe apps picker uses (choose a plan, sign
 * in if needed, RevenueCat checkout), so this page never grows a second,
 * slightly different checkout of its own. Loaded by `PricingProButton` only
 * when it's needed, because it starts sign-in.
 */
export default function PricingProCheckout({ openOnMount }: { openOnMount: boolean }) {
  const { openProUpgrade, proUpgradeDialog, proMessage, proJustActivated } =
    useStandaloneProUpgrade("pricing_page");

  // The press that loaded this file opens the dialog once it's here.
  useEffect(() => {
    if (openOnMount) openProUpgrade();
    // Mount only: the press already happened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {proJustActivated ? (
        <Link href="/" className="btn btn-primary w-full">
          Pro is on. Start printing
        </Link>
      ) : (
        <button type="button" className="btn btn-primary w-full" onClick={openProUpgrade}>
          Get RecipePrinter Pro
        </button>
      )}
      {proMessage && (
        <p className="mt-cp-2 text-cp-small text-ink-soft" role="status">
          {proMessage}
        </p>
      )}
      {proUpgradeDialog}
    </div>
  );
}
