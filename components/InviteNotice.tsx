"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useSyncExternalStore } from "react";
import { onCookPilotSignedInChange, readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { readStoredOpen, referralVersion, subscribeReferral, type StoredOpen } from "@/lib/referral";

const CookPilotLoginDialog = dynamic(
  () => import("@/components/CookPilotAuth").then((m) => m.CookPilotLoginDialog),
  { ssr: false },
);

/**
 * One quiet line under the homepage headline for someone who arrived through a
 * friend's link and hasn't signed in: what's waiting, and how to start it.
 * Everything else on the page works exactly as it does for anyone, signed in
 * or not. Signing in claims it (components/ReferralHost).
 */
export function InviteNotice() {
  const version = useSyncExternalStore(subscribeReferral, referralVersion, () => 0);
  const [open, setOpen] = useState<StoredOpen | null>(null);
  const [signedIn, setSignedIn] = useState(true);
  const [signingIn, setSigningIn] = useState(false);

  // Read after mount (localStorage), and again whenever the stored link changes.
  useEffect(() => {
    setOpen(readStoredOpen());
  }, [version]);
  useEffect(() => {
    setSignedIn(readCookPilotWasSignedIn());
    return onCookPilotSignedInChange((next) => setSignedIn(next));
  }, []);

  if (!open || open.pendingVerification || signedIn) return null;
  return (
    <>
      <p className="mt-cp-3 text-cp-small text-ink-soft" role="status">
        A friend gave you {open.rewardDays} days of Pro.{" "}
        <button type="button" className="font-semibold underline underline-offset-2" onClick={() => setSigningIn(true)}>
          Sign in to start them
        </button>
      </p>
      {signingIn && (
        <CookPilotLoginDialog onClose={() => setSigningIn(false)} onAuthenticated={() => setSigningIn(false)} />
      )}
    </>
  );
}
