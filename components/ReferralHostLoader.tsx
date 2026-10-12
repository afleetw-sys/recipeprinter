"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { onCookPilotSignedInChange, readCookPilotWasSignedIn } from "@/lib/cookPilotSession";
import { subscribeProWelcome, type ProWelcome } from "@/lib/proWelcome";
import { INVITE_COOKIE, REFERRALS_LIVE, readStoredOpen } from "@/lib/referral";

/**
 * Loads `ReferralHost` only when it has something to do, the same way
 * `AccountControl` loads the avatar: the root layout renders this on every
 * route, including the prerendered SEO pages, and the host reaches
 * `firebase/auth`. So nothing here touches Firebase.
 *
 * It is needed when a friend's link has just been opened or is waiting to be
 * claimed, when this browser has been signed in (rewards and expiry to tell
 * them about), or when something announces "You're on Pro" before it loaded.
 */
const ReferralHost = dynamic(() => import("@/components/ReferralHost").then((m) => m.ReferralHost), {
  ssr: false,
});

function hasWork(): boolean {
  if (typeof window === "undefined") return false;
  const path = window.location.pathname;
  // The PDF renderer's headless browser and our own print diagnostics.
  if (path.startsWith("/export") || path.startsWith("/print-check")) return false;
  return document.cookie.includes(`${INVITE_COOKIE}=`) || readStoredOpen() !== null ||
    (REFERRALS_LIVE && readCookPilotWasSignedIn());
}

export function ReferralHostLoader() {
  const [load, setLoad] = useState(false);
  const [early, setEarly] = useState<ProWelcome | null>(null);

  useEffect(() => {
    if (hasWork()) setLoad(true);
    const offSignIn = onCookPilotSignedInChange(() => {
      if (hasWork()) setLoad(true);
    });
    const offWelcome = subscribeProWelcome((welcome) => {
      setEarly((current) => current ?? welcome);
      setLoad(true);
    });
    return () => {
      offSignIn();
      offWelcome();
    };
  }, []);

  return load ? <ReferralHost initialWelcome={early} /> : null;
}
