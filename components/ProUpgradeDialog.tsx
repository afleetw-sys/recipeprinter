"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { Dialog } from "@/components/Dialog";
import { CookPilotLoginDialog } from "@/components/CookPilotAuth";
import { CheckIcon, ICON_SIZE, XIcon } from "@/components/icons";
import { track, type ProDeclineReason } from "@/lib/analytics";
import {
  loadProDeclineAskedOnAccount,
  markProDeclineAsked,
  markProPaywallSeen,
  proDeclineAskedOnDevice,
  proPaywallSeenBefore,
} from "@/lib/proDeclineAsked";
import { GENERIC_COPY, type ProDialogImage } from "@/lib/proUpgradeCopy";
import { ProDialogArt } from "@/components/ProDialogArt";
import {
  DEFAULT_PRO_CYCLE,
  PRO_PRICE_FALLBACKS,
  type ProBillingCycle,
} from "@/lib/proProduct";
import { useVisitorPrices } from "@/lib/visitorCurrency";
import {
  BLACK_FRIDAY_PRO_MONTHLY_MONTHS,
  BLACK_FRIDAY_PRO_MONTHLY_PRICE,
  isBlackFridayLive,
  proCycleToOpenOn,
} from "@/lib/blackFriday";
import { shareLink } from "@/lib/shareLink";
import { inviteShareText } from "@/lib/referral";

const PRO_CYCLE_LABEL: Record<ProBillingCycle, string> = {
  annual: "Annual",
  monthly: "Monthly",
};

// Display order of the plan tiles: the default plan first, the other under it
// (Amelia, 2026-11-16). The order stays put when the cook picks the other one.
const PRO_PLAN_CYCLES: ProBillingCycle[] =
  DEFAULT_PRO_CYCLE === "annual" ? ["annual", "monthly"] : ["monthly", "annual"];

/** The one-tap answers to "Not upgrading today?", in display order. */
const DECLINE_REASONS: { reason: ProDeclineReason; label: string }[] = [
  { reason: "too_expensive", label: "Too expensive" },
  { reason: "no_more_subscriptions", label: "I don't want another subscription" },
  { reason: "free_is_enough", label: "Free does what I need" },
  { reason: "not_used_enough", label: "I don't use it often enough" },
];

/**
 * The one Pro upsell screen in the app — one dialog, start to finish.
 *
 * Flow: choose a plan → sign in if needed → checkout. Picking a plan while
 * signed out replaces this dialog with the ordinary sign-in dialog
 * (`CookPilotLoginDialog`, worded for Pro), and succeeding there starts
 * checkout for the plan already chosen, with no second "confirm your plan"
 * step. A signed-in cook goes straight from plan choice to checkout.
 *
 * Closing from the plan step, before Continue was ever pressed, turns the
 * dialog into one question: why not upgrade today. A tap on an answer records it
 * and closes; closing again closes for real. It never follows the sign-in
 * step (that is sign-in friction, not a no to the price), it is never asked on
 * the first opening of this dialog on a browser, and it is asked once per
 * person ever (lib/proDeclineAsked.ts).
 */
export function ProUpgradeDialog({
  onClose,
  onChoose,
  onSignInRequired,
  busy,
  cookPilotUser,
  // The same words as `proUpgradeCopy`'s generic title, so the dialog reads
  // alike whether or not the caller passes copy of its own.
  title = "Upgrade to RecipePrinter Pro",
  body,
  highlights = GENERIC_COPY.highlights,
  ctaLabel = "Get Pro and continue",
  images = GENERIC_COPY.images,
  listHeading = GENERIC_COPY.listHeading,
  referralChoice,
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
  /** Shown under the title when the trigger has something to explain. */
  body?: string;
  /** Every benefit to list, led by what opened this (`proUpgradeCopy`). */
  highlights?: string[];
  ctaLabel?: string;
  /** The product picture beside the pitch (`proUpgradeCopy`); with several, arrows step through them. */
  images?: ProDialogImage[];
  /** Over the benefit list (`proUpgradeCopy`). */
  listHeading?: string;
  /** When referral Pro has just run out: open on a choice between subscribing
      and inviting a friend, side by side and equally weighted, before plans.
      Every other opening of this dialog is unchanged. */
  referralChoice?: { inviteUrl: string; rewardDays: number };
}) {
  const [step, setStep] = useState<"choice" | "plan" | "signin" | "decline">(referralChoice ? "choice" : "plan");
  const [invited, setInvited] = useState<"copy" | "native_share" | null>(null);
  const [showLink, setShowLink] = useState(false);
  // "Other" on the decline question: opens a box for the cook's own reason.
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState("");
  // Monthly during the sale (the deal "Claim offer" points at), else the default.
  const [selectedCycle, setSelectedCycle] = useState<ProBillingCycle>(proCycleToOpenOn);
  const [saleLive] = useState(() => isBlackFridayLive());
  const saleTitle = saleLive && title === GENERIC_COPY.title;
  const [pendingCycle, setPendingCycle] = useState<ProBillingCycle | null>(null);
  const uid = cookPilotUser?.uid ?? null;
  // Whether this account has been asked on any device. Null until read, and
  // the question waits for the answer: closing before it arrives just closes.
  const [askedOnAccount, setAskedOnAccount] = useState<{ uid: string | null; asked: boolean } | null>(null);
  // Read before this opening is recorded, so the first ever opening stays quiet.
  const [seenBefore] = useState(proPaywallSeenBefore);

  useEffect(() => {
    markProPaywallSeen();
  }, []);

  useEffect(() => {
    if (!uid) {
      setAskedOnAccount({ uid: null, asked: false });
      return;
    }
    let alive = true;
    loadProDeclineAskedOnAccount(uid)
      .then((asked) => {
        if (!alive) return;
        setAskedOnAccount({ uid, asked });
        // Asked here while signed out, now signed in: carry it to the account
        // so their other devices know.
        if (!asked && proDeclineAskedOnDevice()) void markProDeclineAsked(uid);
      })
      .catch(() => {
        if (alive) setAskedOnAccount({ uid, asked: true });
      });
    return () => {
      alive = false;
    };
  }, [uid]);

  function selectCycle(cycle: ProBillingCycle) {
    if (cycle === selectedCycle) return;
    setSelectedCycle(cycle);
    track("pro_plan_selected", { cycle });
  }

  function handleContinue(cycle: ProBillingCycle) {
    track("pro_continue_clicked", { cycle });
    setPendingCycle(cycle);
    if (cookPilotUser) {
      onChoose(cycle);
      return;
    }
    track("auth_started_from_upgrade", { trigger: title });
    onSignInRequired?.(cycle);
    setStep("signin");
  }

  function handleClose() {
    if (step === "choice") {
      if (!invited) track("referral_paywall_choice", { choice: "dismiss" });
      onClose();
      return;
    }
    const mayAsk =
      seenBefore &&
      askedOnAccount !== null &&
      askedOnAccount.uid === uid &&
      !askedOnAccount.asked &&
      !proDeclineAskedOnDevice();
    if (step === "plan" && !pendingCycle && !busy && mayAsk) {
      void markProDeclineAsked(uid);
      track("pro_decline_asked", {});
      setStep("decline");
      return;
    }
    onClose();
  }

  function answerDecline(reason: ProDeclineReason, detail?: string) {
    track("pro_decline_answered", detail ? { reason, detail } : { reason });
    onClose();
  }

  const closeDisabled = busy;
  const { label: price, annualPerMonth, annualTotal } = useVisitorPrices();
  // Annual reads as a monthly figure, so the two plans compare like for like,
  // and always says what it charges once a year right beside it.
  const billedYearly = `Billed yearly at ${annualTotal}`;
  // The plan cards add their own " / month", so the monthly price drops its "/mo".
  const monthlyAmount = price(PRO_PRICE_FALLBACKS.monthly).replace(/\s*\/\s*mo\.?$/i, "");
  // During the sale Monthly is $2.49 for its first 3 months (lib/blackFriday.ts).
  const saleMonthlyAmount = price(BLACK_FRIDAY_PRO_MONTHLY_PRICE);

  // Signing in is the ordinary sign-in dialog, the same one every other
  // door opens (Amelia, 2026-11-22), not a form inside this one beside the
  // picture. It says what it is for, and succeeding starts checkout for the
  // plan already chosen. Closing it closes the upgrade too; "Back to plans"
  // returns to the plan step.
  if (step === "signin") {
    return (
      <CookPilotLoginDialog
        onClose={handleClose}
        onAuthenticated={() => {
          if (pendingCycle) onChoose(pendingCycle);
        }}
        intro={{
          title: "Sign in to get Pro",
          body: "Pro stays with your account on every device.",
        }}
        footer={
          <button type="button" className="btn-ghost btn-compact w-full" onClick={() => setStep("plan")}>
            Back to plans
          </button>
        }
      />
    );
  }

  // Asking why is its own small dialog once the pitch has closed (Amelia,
  // 2026-11-22): left beside the product picture, it read as the pitch
  // still holding on after a no.
  if (step === "decline") {
    return (
      <Dialog
        onClose={onClose}
        labelledBy="pro-decline-title"
        className="fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
        panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[440px] max-h-[92dvh] overflow-y-auto rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:p-cp-6 flex flex-col gap-cp-4 relative"
        portal
      >
        <button type="button" className="icon-close-btn absolute right-3 top-3 z-10" aria-label="Close" onClick={onClose}>
          <XIcon size={ICON_SIZE.md} />
        </button>
        <div className="pr-8">
          <h2 id="pro-decline-title" className="text-cp-dialog-title font-extrabold tracking-tight">
            Not upgrading today?
          </h2>
          <p className="mt-1 text-cp-body text-ink-soft">Your feedback helps make RecipePrinter better.</p>
        </div>
        <div className="flex flex-col gap-cp-2">
          {DECLINE_REASONS.map(({ reason, label }) => (
            <button
              key={reason}
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => answerDecline(reason)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="btn btn-secondary w-full"
            aria-expanded={otherOpen}
            aria-controls="pro-decline-other-form"
            onClick={() => setOtherOpen((open) => !open)}
            style={
              otherOpen
                ? {
                    borderColor: "var(--cp-selected-border)",
                    background: "var(--cp-selected-fill)",
                    color: "var(--cp-selected-text)",
                  }
                : undefined
            }
          >
            Other
          </button>
          {otherOpen && (
            <form
              id="pro-decline-other-form"
              className="flex flex-col gap-cp-2"
              onSubmit={(event) => {
                event.preventDefault();
                const detail = otherText.trim().slice(0, 500);
                if (detail) answerDecline("other", detail);
              }}
            >
              <textarea
                className="field"
                aria-label="Your reason"
                placeholder="Your reason"
                rows={2}
                maxLength={500}
                value={otherText}
                onChange={(event) => setOtherText(event.target.value)}
                autoFocus
              />
              <button type="submit" className="btn btn-primary w-full" disabled={!otherText.trim()}>
                Send
              </button>
            </form>
          )}
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      onClose={handleClose}
      closeDisabled={closeDisabled}
      labelledBy="pro-upgrade-title"
      className="fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[820px] max-h-[92dvh] sm:max-h-[calc(100dvh-48px)] sm:h-auto rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-0 flex flex-col sm:flex-row relative overflow-y-auto sm:overflow-hidden"
      portal
    >
      {/* Centred by auto margins on the first and last of the text (after
          the close button), not justify-center: when the text is taller than
          a short or zoomed window, justify-center pushes the overflow out
          above as well as below, where scrolling can't reach, and the title
          was lost off the top. Auto margins collapse to nothing instead, so
          it starts at the top and scrolls. */}
      <div className="flex min-w-0 flex-1 flex-col gap-cp-4 p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:overflow-y-auto sm:p-cp-6 sm:[&>:nth-child(2)]:mt-auto sm:[&>:last-child]:mb-auto">
      <button
        type="button"
        className="icon-close-btn absolute right-3 top-3 z-10"
        aria-label="Close"
        disabled={closeDisabled}
        onClick={handleClose}
      >
        <XIcon size={ICON_SIZE.md} />
      </button>

      {step === "choice" && referralChoice ? (
        <>
          <div className="pr-8">
            <h2 id="pro-upgrade-title" className="text-cp-dialog-title font-extrabold tracking-tight">
              Your Pro days are up
            </h2>
            <p className="mt-1 text-cp-body text-ink-soft">Everything you made is still here. Two ways to keep Pro:</p>
          </div>
          {/* Two equal cards, same weight and the same button style, so
              neither reads as the one we want picked. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-cp-3">
            <div className="rounded-xl border border-line p-cp-4 flex flex-col gap-cp-2">
              <h3 className="text-cp-body font-extrabold">Subscribe to Pro</h3>
              <p className="text-cp-small text-ink-soft flex-1">
                {price(PRO_PRICE_FALLBACKS.monthly)}, or {price(PRO_PRICE_FALLBACKS.annual)}. Pro keeps going right away.
              </p>
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={() => {
                  track("referral_paywall_choice", { choice: "subscribe" });
                  setStep("plan");
                }}
              >
                Choose a plan
              </button>
            </div>
            <div className="rounded-xl border border-line p-cp-4 flex flex-col gap-cp-2">
              <h3 className="text-cp-body font-extrabold">Invite a friend</h3>
              <p className="text-cp-small text-ink-soft flex-1">
                You both get {referralChoice.rewardDays} days of Pro once they sign up. Sending the link doesn&rsquo;t add days on its own.
              </p>
              <button
                type="button"
                className="btn btn-secondary w-full"
                onClick={async () => {
                  const method = await shareLink(referralChoice.inviteUrl, inviteShareText(referralChoice.rewardDays));
                  if (!method) {
                    setShowLink(true);
                    return;
                  }
                  if (!invited) track("referral_paywall_choice", { choice: "invite" });
                  track("referral_link_shared", { placement: "expired_paywall", method });
                  setInvited(method);
                }}
              >
                {invited === "copy" ? "Link copied" : invited ? "Shared" : "Share invite link"}
              </button>
              {showLink && !invited && (
                <input
                  readOnly
                  autoFocus
                  value={referralChoice.inviteUrl}
                  aria-label="Your invite link"
                  className="field w-full min-w-0 text-cp-small"
                  onFocus={(event) => event.currentTarget.select()}
                />
              )}
            </div>
          </div>
        </>
      ) : step === "plan" ? (
        <>
          {/* No crown beside the title (Amelia, 2026-11-16): the picture
              and the title carry it. */}
          {/* During the sale (lib/blackFriday.ts) the plain upgrade pitch
              becomes the offer, said once in the title (Amelia, 2026-11-24,
              after Canva's): the plan cards and fine print don't repeat it.
              A dialog opened by a locked feature keeps its own title, with
              the badge. */}
          {saleLive && <span className="pro-sale-badge">Limited time offer</span>}
          <h2 id="pro-upgrade-title" className="pr-8 text-cp-dialog-title font-extrabold tracking-tight">
            {saleTitle ? (
              <>
                Get <span className="text-[var(--cp-accent-warm)]">50% off</span> your first{" "}
                {BLACK_FRIDAY_PRO_MONTHLY_MONTHS} months of RecipePrinter Pro
              </>
            ) : (
              title
            )}
          </h2>
          {body && !saleTitle && <p className="text-cp-body text-ink-soft">{body}</p>}

          {/* A long list kept quiet (Amelia, 2026-11-17): a soft lead-in
              rather than a bold heading, small type on an even pitch, and
              accent checks, so it reads as a column of reasons rather than
              a wall of headlines. */}
          <div className="flex flex-col gap-cp-2">
            <p className="text-cp-small text-ink-soft">{listHeading}</p>
            <ul className="flex flex-col gap-[6px]">
              {highlights.map((benefit) => (
                <li key={benefit} className="flex items-start gap-cp-2 text-cp-small text-ink">
                  <CheckIcon size={ICON_SIZE.sm} className="mt-[2px] shrink-0 text-brand" />
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          {/* Two plan cards side by side, Annual first and chosen
              (Amelia, 2026-11-17), each with its price as a monthly figure so
              they compare like for like. The button below commits the one
              selected. */}
          <div role="radiogroup" aria-label="Billing plan" className="pro-plan-options mt-cp-3">
            {PRO_PLAN_CYCLES.map((cycle) => {
              const selected = cycle === selectedCycle;
              return (
                <button
                  key={cycle}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className="pro-plan-option"
                  onClick={() => selectCycle(cycle)}
                >
                  <span className="pro-plan-option__radio" aria-hidden="true" />
                  <span className="pro-plan-option__name">
                    {PRO_CYCLE_LABEL[cycle]}
                    {cycle === "annual" && <span className="pro-plan-save-tag">Save more</span>}
                  </span>
                  <span className="pro-plan-option__price">
                    {cycle === "monthly" && saleLive && (
                      <>
                        <s className="pro-plan-option__was">
                          <span className="sr-only">Was </span>
                          {monthlyAmount}
                        </s>{" "}
                        <span className="sr-only">now </span>
                      </>
                    )}
                    <span className="pro-plan-option__now">
                      {cycle === "annual" ? annualPerMonth : saleLive ? saleMonthlyAmount : monthlyAmount}{" "}
                      <span className="pro-plan-option__per">/ month</span>
                    </span>
                  </span>
                  {/* Annual says what it charges once a year; Monthly's
                      "/ month" already says it all (Amelia, 2026-11-17). */}
                  {cycle === "annual" && <span className="pro-plan-option__note">{billedYearly}</span>}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy}
            onClick={() => handleContinue(selectedCycle)}
          >
            {saleLive && selectedCycle === "monthly" ? "Claim offer" : ctaLabel}
          </button>
          <p className="text-center text-cp-label text-ink-soft">
            {/* What the sale price turns into, said once, in the fine print. */}
            {saleLive && selectedCycle === "monthly"
              ? `Then ${monthlyAmount} a month. New members only. Cancel any time from Settings.`
              : "Cancel any time from Settings."}
          </p>
        </>
      ) : null}
      </div>
      {/* The picture (Amelia, 2026-11-16): the left half on a computer, for
          every step so the dialog never changes size. None on a phone
          (2026-11-17): at a phone's width it was a strip too small to show
          anything, and it made the sheet scroll. After the text in the page so
          the dialog's first focus lands there, not on an arrow; `order-first`
          still draws it first. */}
      <ProDialogArt images={images} className="hidden sm:order-first sm:block sm:w-[44%] sm:shrink-0" />
    </Dialog>
  );
}
