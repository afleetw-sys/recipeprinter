"use client";

import Link from "next/link";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";

/**
 * The /pricing page's way into checkout: the same Pro upgrade dialog and
 * purchase flow the home page's Recipe apps picker uses (choose a plan, sign
 * in if needed, RevenueCat checkout), so this page never grows a second,
 * slightly different checkout of its own.
 */
export function PricingProButton() {
  const { openProUpgrade, proUpgradeDialog, proMessage, proJustActivated } =
    useStandaloneProUpgrade("pricing_page");

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
