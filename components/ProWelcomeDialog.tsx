"use client";

import type { ReactNode } from "react";
import { Dialog } from "@/components/Dialog";
import { CrownIcon, ICON_SIZE, XIcon } from "@/components/icons";
import type { ProWelcome } from "@/lib/proWelcome";

function formatRenewal(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

/**
 * "You're on Pro": shown once when Pro starts, whichever way it started.
 *
 * The only date shown is a subscriber's new renewal date, and only as
 * RevenueCat reported it after the extension. Nothing here works a date out
 * itself: one calculated in the dialog could disagree with the account page.
 */
const COUNT_WORDS = ["", "A friend", "Two friends", "Three friends", "Four friends", "Five friends"];

/** "A friend", "Two friends" ... spelled out while it reads naturally, then digits. */
function friendsWho(friends = 1): string {
  return COUNT_WORDS[friends] ?? `${friends} friends`;
}

function copyFor(welcome: ProWelcome): { title: string; body: ReactNode } {
  switch (welcome.kind) {
  case "purchased":
    return {
      title: "You're on Pro",
      body: "Every theme, every card size, and printing several recipes at once are yours now.",
    };
  case "referral_welcome":
    return {
      title: `You're on Pro for ${welcome.days} days`,
      body: `A friend shared RecipePrinter with you, so you both get ${welcome.days} days of Pro. Every theme and card size is yours to try.`,
    };
  case "referral_earned": {
    const who = friendsWho(welcome.friends);
    if (welcome.fulfillment === "extension") {
      // A subscriber: say how much longer, and when they next pay, plainly.
      return {
        title: `Your Pro just got ${welcome.days} days longer!`,
        body: welcome.renewsAtMs ? (
          <>
            {who} joined using your link. Your next Pro payment is{" "}
            <strong className="text-ink">{formatRenewal(welcome.renewsAtMs)}</strong>.
          </>
        ) : (
          `${who} joined using your link. Your next Pro payment moves ${welcome.days} days later.`
        ),
      };
    }
    return {
      title: "Your Pro starts now",
      body: `${who} signed up with your link, so you have ${welcome.days} days of Pro, starting today.`,
    };
  }
  }
}

export function ProWelcomeDialog({ welcome, onClose }: { welcome: ProWelcome; onClose: () => void }) {
  const { title, body } = copyFor(welcome);
  return (
    <Dialog
      onClose={onClose}
      labelledBy="pro-welcome-title"
      portal
      className="no-print fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[400px] rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-cp-5 flex flex-col gap-cp-4 relative"
    >
      <button type="button" className="icon-close-btn absolute right-3 top-3" aria-label="Close" onClick={onClose}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      <div className="flex items-center gap-2 pr-8">
        <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
        <h2 id="pro-welcome-title" className="text-cp-dialog-title font-extrabold tracking-tight">
          {title}
        </h2>
      </div>
      <p className="text-cp-body text-ink-soft">{body}</p>
      <button type="button" className="btn btn-primary w-full" onClick={onClose}>
        Got it
      </button>
    </Dialog>
  );
}
