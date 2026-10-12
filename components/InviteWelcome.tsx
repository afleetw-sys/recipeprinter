"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Dialog } from "@/components/Dialog";
import { CrownIcon, ICON_SIZE, XIcon } from "@/components/icons";
import { readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { readStoredOpen, referralVersion, storeOpen, subscribeReferral, type StoredOpen } from "@/lib/referral";

const CookPilotLoginDialog = dynamic(
  () => import("@/components/CookPilotAuth").then((m) => m.CookPilotLoginDialog),
  { ssr: false },
);

/**
 * Someone arrived through a friend's link and isn't signed in: tell them, once,
 * what's waiting. "Maybe later" closes it for good; the days are still theirs
 * whenever they sign in (components/ReferralHost claims them), and everything
 * else on the page works exactly as it does for anyone.
 */
export function InviteWelcome() {
  const version = useSyncExternalStore(subscribeReferral, referralVersion, () => 0);
  const [open, setOpen] = useState<StoredOpen | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    const stored = readStoredOpen();
    if (stored && !stored.introShown && !stored.pendingVerification && !readCookPilotWasSignedIn()) {
      setOpen(stored);
      storeOpen({ ...stored, introShown: true });
    }
  }, [version]);

  if (signingIn) {
    return <CookPilotLoginDialog onClose={() => setSigningIn(false)} onAuthenticated={() => setSigningIn(false)} />;
  }
  if (!open) return null;
  const close = () => setOpen(null);
  return (
    <Dialog
      onClose={close}
      labelledBy="invite-welcome-title"
      portal
      className="no-print fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[400px] rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-cp-5 flex flex-col gap-cp-4 relative text-center"
    >
      <button type="button" className="icon-close-btn absolute right-3 top-3" aria-label="Close" onClick={close}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      <CrownIcon size={40} className="mx-auto mt-cp-2 text-[var(--cp-premium-bright)]" />
      <div>
        <h2 id="invite-welcome-title" className="text-cp-dialog-title font-extrabold tracking-tight">
          A friend gave you {open.rewardDays} days of Pro
        </h2>
        <p className="mt-cp-2 text-cp-body text-ink-soft">
          Every theme, 4×6 cards, and printing several recipes at once. Sign in and your days start right away.
        </p>
      </div>
      <div className="flex flex-col gap-cp-2">
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => {
            close();
            setSigningIn(true);
          }}
        >
          Sign in to start them
        </button>
        <button type="button" className="btn-ghost btn-compact w-full" onClick={close}>
          Maybe later
        </button>
      </div>
    </Dialog>
  );
}
