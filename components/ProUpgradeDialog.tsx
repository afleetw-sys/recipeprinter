"use client";

import { useState } from "react";
import type { User } from "firebase/auth";
import { Dialog } from "@/components/Dialog";
import { SelectTile } from "@/components/Controls";
import { CookPilotLoginForm } from "@/components/CookPilotAuth";
import { CheckIcon, CrownIcon, ICON_SIZE, XIcon } from "@/components/icons";
import { track } from "@/lib/analytics";
import {
  PRO_ANNUAL_PRICE_FALLBACK,
  PRO_MONTHLY_PRICE_FALLBACK,
  PRO_PRICE_FALLBACKS,
  proAnnualPriceAtMonthlyRate,
  proAnnualSavingsPercent,
  type ProBillingCycle,
} from "@/lib/proProduct";

// Every one of these is a real, implemented gate (see computeProLocks in
// lib/recipePrinterPurchases.ts) — a "20% off your first cookbook export"
// line used to sit here too, but no checkout path anywhere ever actually
// applied that discount; a Pro subscriber was charged the same $19.99 as
// anyone else. Don't add a benefit back here without wiring the real thing
// behind it first.
//
// Exported so `AccountProStatus` can show the same list to a Free account —
// one list, so a change here doesn't quietly leave the two surfaces
// disagreeing about what Pro actually includes.
export const PRO_BENEFITS = [
  "All premium themes",
  "4×6 recipe cards",
  "Print multiple recipes at once",
];

const PRO_CYCLE_LABEL: Record<ProBillingCycle, string> = {
  annual: "Annual",
  monthly: "Monthly",
};

/**
 * The one Pro upsell screen in the app — one dialog, start to finish.
 *
 * Flow: choose a plan → sign in if needed → checkout. Both steps live in
 * this same component/`Dialog` instance so a signed-out cook never sees a
 * second popup open — picking a plan while signed out swaps this dialog's
 * own content over to sign-in, and succeeding there starts checkout for the
 * plan already chosen, with no second "confirm your plan" step. A
 * signed-in cook skips straight from plan choice to checkout, same as
 * before.
 *
 * The sign-in step embeds `CookPilotLoginForm` (the same form
 * `CookPilotLoginDialog` uses) rather than reimplementing email/password/
 * Google/Apple sign-in here.
 */
export function ProUpgradeDialog({
  onClose,
  onChoose,
  onSignInRequired,
  busy,
  cookPilotUser,
  title = "RecipePrinter Pro",
  description = "Unlock every premium theme, every print size, and multi-recipe printing.",
}: {
  onClose: () => void;
  /** Starts checkout for `cycle` — called immediately for a signed-in cook,
      or right after sign-in succeeds for one who wasn't. Either way this is
      the only place checkout ever starts, so a plan is chosen at most once. */
  onChoose: (cycle: ProBillingCycle) => void;
  /** Fired the moment a signed-out cook picks a plan, before this dialog
      swaps to its sign-in step — lets the caller remember the choice
      somewhere that survives a phone's sign-in redirect (which reloads the
      page before `onChoose` could ever fire from here). */
  onSignInRequired?: (cycle: ProBillingCycle) => void;
  busy: boolean;
  cookPilotUser: User | null;
  title?: string;
  description?: string;
}) {
  const [step, setStep] = useState<"plan" | "signin">("plan");
  const [selectedCycle, setSelectedCycle] = useState<ProBillingCycle>("annual");
  const [pendingCycle, setPendingCycle] = useState<ProBillingCycle | null>(null);
  const [formBusy, setFormBusy] = useState(false);

  function handleContinue(cycle: ProBillingCycle) {
    track("pro_plan_selected", { cycle });
    setPendingCycle(cycle);
    if (cookPilotUser) {
      onChoose(cycle);
      return;
    }
    track("auth_started_from_upgrade", { trigger: title });
    onSignInRequired?.(cycle);
    setStep("signin");
  }

  const closeDisabled = busy || formBusy;
  const savingsPercent = proAnnualSavingsPercent();
  const annualAtMonthlyRate = proAnnualPriceAtMonthlyRate();

  return (
    <Dialog
      onClose={onClose}
      closeDisabled={closeDisabled}
      labelledBy="pro-upgrade-title"
      className="fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[440px] max-h-[88dvh] sm:max-h-none sm:h-auto rounded-t-2xl sm:rounded-2xl border-0 sm:border p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-cp-5 flex flex-col gap-cp-4 relative overflow-y-auto"
      portal
    >
      <button
        type="button"
        className="icon-close-btn absolute right-3 top-3"
        aria-label="Close"
        disabled={closeDisabled}
        onClick={onClose}
      >
        <XIcon size={ICON_SIZE.md} />
      </button>

      {step === "plan" ? (
        <>
          <div className="flex items-center gap-2 pr-8">
            <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
            <h2 id="pro-upgrade-title" className="text-cp-dialog-title font-extrabold tracking-tight">
              {title}
            </h2>
          </div>
          <p className="text-cp-body text-ink-soft">{description}</p>

          <ul className="flex flex-col gap-cp-1">
            {PRO_BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-start gap-cp-2 text-cp-body">
                <CheckIcon size={ICON_SIZE.sm} className="mt-[3px] shrink-0" />
                {benefit}
              </li>
            ))}
          </ul>

          <div className="flex flex-col gap-cp-2" role="radiogroup" aria-label="Billing plan">
            <SelectTile selected={selectedCycle === "monthly"} className="pro-plan-card">
              <input
                type="radio"
                name="pro-cycle"
                className="sr-only"
                checked={selectedCycle === "monthly"}
                onChange={() => setSelectedCycle("monthly")}
              />
              <div className="pro-plan-card__row">
                <span className="pro-plan-card__name">Monthly</span>
              </div>
              <p className="pro-plan-card__price">{PRO_MONTHLY_PRICE_FALLBACK}</p>
            </SelectTile>
            <SelectTile selected={selectedCycle === "annual"} className="pro-plan-card">
              <input
                type="radio"
                name="pro-cycle"
                className="sr-only"
                checked={selectedCycle === "annual"}
                onChange={() => setSelectedCycle("annual")}
              />
              <div className="pro-plan-card__row">
                <span className="pro-plan-card__name">Annual</span>
              </div>
              <p className="pro-plan-card__price">
                <span className="pro-plan-card__price--was">{annualAtMonthlyRate}</span>
                {PRO_ANNUAL_PRICE_FALLBACK}
              </p>
              <p className="pro-plan-card__note">Save {savingsPercent}% vs. monthly</p>
            </SelectTile>
          </div>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy}
            onClick={() => handleContinue(selectedCycle)}
          >
            Continue with {PRO_CYCLE_LABEL[selectedCycle]} ({PRO_PRICE_FALLBACKS[selectedCycle]})
          </button>
          <p className="text-cp-label text-ink-soft">
            Cancel anytime from your account. Cookbooks sold separately.
          </p>
        </>
      ) : (
        <>
          <div className="pr-8">
            <h2 id="pro-upgrade-title" className="text-cp-dialog-title font-extrabold tracking-tight">
              Sign in to continue
            </h2>
            <p className="mt-1 text-cp-body text-ink-soft">
              Sign in or create an account to keep your Pro membership and purchases in one place.
            </p>
            {pendingCycle && (
              <p className="mt-2 text-cp-label text-ink-soft font-semibold">
                {PRO_CYCLE_LABEL[pendingCycle]} · {PRO_PRICE_FALLBACKS[pendingCycle]}
              </p>
            )}
          </div>
          <CookPilotLoginForm
            autoFocus
            onBusyChange={setFormBusy}
            onAuthenticated={() => {
              if (pendingCycle) onChoose(pendingCycle);
            }}
          />
          <button
            type="button"
            className="btn-ghost btn-compact w-full"
            disabled={formBusy}
            onClick={() => setStep("plan")}
          >
            Back to plans
          </button>
        </>
      )}
    </Dialog>
  );
}
