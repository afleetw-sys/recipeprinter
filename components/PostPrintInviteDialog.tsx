"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CookPilotLoginDialog } from "@/components/CookPilotAuth";
import { Dialog } from "@/components/Dialog";
import { GiftIcon, ICON_SIZE, SwapIcon, XIcon } from "@/components/icons";
import { track } from "@/lib/analytics";
import { inviteShareText, inviteUrl, loadReferralSummary } from "@/lib/referral";
import { shareLink } from "@/lib/shareLink";

/**
 * After a print, once per browser (lib/referral `shouldShowPostPrintInvite`):
 * "Give 3 days of Pro. Get 3 days of Pro." It takes the place the "Leave feedback" dialog had
 * after a print, once the program is live.
 *
 * Signed out, the button signs in first, since a link belongs to an account,
 * and then this dialog comes back with the link to share. Sharing needs the
 * person's own tap (a share sheet or the clipboard won't open from anything
 * else), so signing in never shares on its own.
 */
export function PostPrintInviteDialog({
  open,
  signedIn,
  rewardDays,
  onClose,
}: {
  open: boolean;
  signedIn: boolean;
  rewardDays: number;
  onClose: () => void;
}) {
  const [signingIn, setSigningIn] = useState(false);
  const [shared, setShared] = useState<"copy" | "native_share" | null>(null);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShared(null);
    setManualUrl(null);
    track("referral_prompt_viewed", { placement: "post_print", cap_reached: false });
  }, [open]);

  async function share() {
    setBusy(true);
    try {
      const summary = await loadReferralSummary("link");
      if (!summary.enabled || !summary.code) return;
      const url = inviteUrl(summary.code, window.location.origin);
      const method = await shareLink(url, inviteShareText(summary.rewardDays));
      if (!method) {
        // No share sheet and no clipboard access: show the link to copy by hand.
        setManualUrl(url);
        return;
      }
      track("referral_link_shared", { placement: "post_print", method });
      setShared(method);
    } catch (error) {
      console.warn("RecipePrinter: could not share the invite link", error);
    } finally {
      setBusy(false);
    }
  }

  if (signingIn) {
    return (
      <CookPilotLoginDialog
        onClose={() => setSigningIn(false)}
        onAuthenticated={() => setSigningIn(false)}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="post-print-invite-title"
      portal
      className="no-print fixed inset-0 z-[var(--z-dialog)] flex items-end sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal mobile-sheet-panel w-full sm:max-w-[440px] rounded-t-2xl rounded-b-none sm:rounded-2xl border-0 sm:border p-cp-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:pb-cp-5 flex flex-col gap-cp-4 relative text-center"
    >
      <button type="button" className="icon-close-btn absolute right-3 top-3" aria-label="Close" onClick={onClose}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      {/* The Pro colour (the crown's), so the reward reads as Pro at a glance. */}
      <div className="mt-cp-2 flex items-center justify-center gap-cp-3" aria-hidden>
        <GiftIcon size={44} className="text-[var(--cp-premium-bright)]" />
        <SwapIcon size={ICON_SIZE.lg} className="text-ink-soft" />
        <GiftIcon size={44} className="text-[var(--cp-premium-bright)]" />
      </div>
      <div>
        <h2 id="post-print-invite-title" className="text-cp-dialog-title font-extrabold tracking-tight">
          Give {rewardDays} days of Pro. Get {rewardDays} days of Pro.
        </h2>
        <p className="mt-cp-2 text-cp-body text-ink-soft">
          When a friend joins through your link, you both get every theme, 4×6 cards, and printing several
          recipes at once, free for {rewardDays} days.
        </p>
      </div>
      <button
        type="button"
        className="btn btn-primary w-full"
        disabled={busy}
        onClick={() => (signedIn ? void share() : setSigningIn(true))}
      >
        {!signedIn
          ? "Sign in to get your link"
          : shared === "copy"
            ? "Link copied"
            : shared
              ? "Shared"
              : "Share your link"}
      </button>
      {manualUrl && !shared && (
        <input
          readOnly
          autoFocus
          value={manualUrl}
          aria-label="Your invite link"
          className="field w-full min-w-0"
          onFocus={(event) => event.currentTarget.select()}
        />
      )}
      {signedIn ? (
        <Link href="/invites" className="text-cp-small text-ink-soft underline underline-offset-2" onClick={onClose}>
          See your invites
        </Link>
      ) : (
        <p className="text-cp-caption text-ink-soft">Sign in is required to track your referrals and rewards.</p>
      )}
    </Dialog>
  );
}
