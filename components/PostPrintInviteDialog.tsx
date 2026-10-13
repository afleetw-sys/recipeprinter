"use client";

import { useEffect, useState } from "react";
import { CookPilotLoginDialog } from "@/components/CookPilotAuth";
import { Dialog } from "@/components/Dialog";
import { ICON_SIZE, XIcon } from "@/components/icons";
import { track } from "@/lib/analytics";
import { inviteShareText, inviteUrl, loadReferralSummary } from "@/lib/referral";
import { shareLink } from "@/lib/shareLink";

/**
 * After a print, now and then (lib/referral `shouldOfferReferralAfterPrint`):
 * invite a friend. Same panel as the first-print "Ready for your counter"
 * dialog, which it never replaces. Signed out, the button signs in first,
 * since a link belongs to an account.
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
  const [busy, setBusy] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setShared(null);
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
        onAuthenticated={() => {
          setSigningIn(false);
          void share();
        }}
      />
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="post-print-invite-title"
      className="print-success-dialog no-print"
      backdropClassName="print-success-dialog__backdrop"
      panelClassName="print-success-dialog__panel"
    >
      <button type="button" className="print-success-dialog__close icon-close-btn" aria-label="Close" onClick={onClose}>
        <XIcon size={ICON_SIZE.md} />
      </button>
      <h2 id="post-print-invite-title">Know someone who&rsquo;d use this?</h2>
      <p>Send them your link. When they sign up, you both get {rewardDays} days of Pro.</p>
      <div className="print-success-dialog__actions">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => (signedIn ? void share() : setSigningIn(true))}
        >
          {shared === "copy" ? "Link copied" : shared ? "Shared" : signedIn ? "Share invite link" : "Get my invite link"}
        </button>
      </div>
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
    </Dialog>
  );
}
