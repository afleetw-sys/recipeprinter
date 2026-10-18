"use client";

import { useEffect, useRef, useState } from "react";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { ProWelcomeDialog } from "@/components/ProWelcomeDialog";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { referralPromptsAllowed, registerMembershipStatus, track } from "@/lib/analytics";
import { announceProChanged, announceProWelcome, subscribeProWelcome, type ProWelcome } from "@/lib/proWelcome";
import {
  INVITE_COOKIE,
  REFERRALS_LIVE,
  REFERRAL_SURFACE_EVENT,
  activateBankedRewards,
  readyToActivate,
  referralSurface,
  capReached,
  claimStoredOpen,
  expiredReferralToShow,
  inviteUrl,
  loadReferralSummary,
  markExpirySeen,
  markGrantSeen,
  membershipStatus,
  readStoredOpen,
  recordInviteFromCookie,
  unseenGrant,
  type ReferralSummary,
} from "@/lib/referral";
import { clearImportsUnlimited } from "@/lib/importMeter";
import { sessionStore } from "@/lib/storage";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";

/**
 * Everything the referral program does that isn't on a particular page,
 * mounted once in the root layout:
 *
 *   - records a friend's link the invite route left in a cookie;
 *   - claims it when someone signs in (on a phone, after the sign-in
 *     redirect, which is why the open is kept in localStorage);
 *   - when the claim needs a verified email, says so inside the sign-in
 *     dialog, and claims again once it is verified;
 *   - shows "You're on Pro" for a purchase, a welcome, or a friend joining;
 *   - when referral Pro has run out, offers subscribing or inviting, side by
 *     side, once per end date per device.
 *
 * The server's summary is read at most once per tab session for a signed-in
 * account, on idle, and never for a signed-out visitor.
 */
const SUMMARY_SESSION_KEY = (uid: string) => `recipeprinter:referral-summary-read:${uid}`;
const SUMMARY_RECHECK_MS = 60_000;

function whenIdle(run: () => void): void {
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 4_000 });
  else window.setTimeout(run, 1_500);
}

export function ReferralHost({ initialWelcome = null }: { initialWelcome?: ProWelcome | null }) {
  const { user, ready } = useCookPilotAuth();
  const uid = user?.uid ?? null;
  const [welcome, setWelcome] = useState<ProWelcome | null>(initialWelcome);
  const [verifying, setVerifying] = useState(false);
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [expiredEnd, setExpiredEnd] = useState<number | null>(null);
  const [bankedDays, setBankedDays] = useState(0);
  const claimingRef = useRef(false);

  useEffect(() => subscribeProWelcome(setWelcome), []);

  // A friend's link, left by app/invite/[code]/route.ts.
  useEffect(() => {
    if (!ready || !document.cookie.includes(`${INVITE_COOKIE}=`)) return;
    recordInviteFromCookie(document.cookie)
      .then((outcome) => {
        if (!outcome) return;
        track("referral_link_opened", {
          first_touch: outcome.recorded,
          signed_in: Boolean(getFirebaseAuth().currentUser && !getFirebaseAuth().currentUser?.isAnonymous),
        });
      })
      .catch((error) => console.warn("RecipePrinter: could not record the invite", error));
  }, [ready]);

  // Claiming, once there is an account.
  async function claim() {
    if (claimingRef.current || !readStoredOpen()) return;
    claimingRef.current = true;
    try {
      const result = await claimStoredOpen();
      if (!result) return;
      if (result.status === "granted") {
        setVerifying(false);
        if (result.days > 0) announceProWelcome({ kind: "referral_welcome", days: result.days });
        const uidNow = getFirebaseAuth().currentUser?.uid;
        // Celebrated here, so the summary's copy of the same grant isn't shown again.
        if (uidNow) markGrantSeen(uidNow, Date.now());
      } else if (result.status === "pending_verification") {
        setVerifying(true);
      } else {
        setVerifying(false);
      }
    } catch (error) {
      console.warn("RecipePrinter: could not claim the invite", error);
    } finally {
      claimingRef.current = false;
    }
  }

  useEffect(() => {
    if (!ready || !uid) return;
    void claim();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid]);

  // Waiting on a verified email: check again whenever they come back to the tab.
  // Codes confirm it in the dialog; this is for a link emailed before codes.
  useEffect(() => {
    if (!uid || !readStoredOpen()?.pendingVerification) return;
    const onFocus = async () => {
      const current = getFirebaseAuth().currentUser;
      if (!current) return;
      await current.reload().catch(() => undefined);
      if (current.emailVerified) {
        await current.getIdToken(true).catch(() => undefined);
        void claim();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, verifying]);

  // What happened while they were away: a friend joined, a welcome confirmed
  // on another device, or referral Pro that has run out.
  useEffect(() => {
    if (!REFERRALS_LIVE || !ready || !uid) return;
    // At most once a minute, so a reload (or coming back later in the same
    // tab) still finds a friend who joined meanwhile. It used to be once per
    // tab, which hid a friend's reward until a new tab.
    if (Date.now() - Number(sessionStore.get(SUMMARY_SESSION_KEY(uid)) ?? 0) < SUMMARY_RECHECK_MS) return;
    let alive = true;
    whenIdle(() => {
      loadReferralSummary("status")
        .then((loaded) => {
          if (!alive) return;
          sessionStore.set(SUMMARY_SESSION_KEY(uid), String(Date.now()));
          setSummary(loaded);
          // Days already earned still start if the program has since been switched off.
          if (loaded.bankedDays > 0) setBankedDays(loaded.bankedDays);
          if (!loaded.enabled) return;
          registerMembershipStatus(membershipStatus(loaded));
          const grant = unseenGrant(uid, loaded);
          if (grant) {
            markGrantSeen(uid, grant.atMs);
            announceProWelcome(
              grant.role === "welcome"
                ? { kind: "referral_welcome", days: grant.days }
                : {
                  kind: "referral_earned",
                  days: grant.days,
                  fulfillment: grant.fulfillment,
                  renewsAtMs: grant.renewsAtMs,
                  friends: Math.max(1, Math.round(grant.days / Math.max(1, loaded.rewardDays))),
                },
            );
            return;
          }
          if (loaded.bankedDays > 0) return;
          const ended = expiredReferralToShow(uid, loaded);
          // Not inside the Cookbook Builder: it waits for a card-printer visit.
          // Referral Pro has run out and nothing paid replaced it: this browser
          // stops treating them as Pro, so "Upgrade to Pro" and the count return.
          if (ended !== null && !loaded.proActive) clearImportsUnlimited();
          if (ended !== null && referralPromptsAllowed() && referralSurface() !== "cookbook") {
            markExpirySeen(uid, ended);
            // The invite half needs a link; someone who joined through a
            // friend may never have made one.
            if (!loaded.code && !capReached(loaded)) {
              return loadReferralSummary("link").then((linked) => {
                if (!alive) return;
                setSummary(linked);
                setExpiredEnd(ended);
              });
            }
            setExpiredEnd(ended);
          }
        })
        .catch((error) => console.warn("RecipePrinter: could not load referral status", error));
    });
    return () => {
      alive = false;
    };
  }, [ready, uid]);

  // A friend signed up while they were away: their days start now, on this
  // visit, by themselves. Only in a tab that's showing, and not inside the
  // Cookbook Builder (they wait for the next card-printer page there).
  useEffect(() => {
    if (!uid || bankedDays <= 0) return;
    let done = false;
    const tryNow = () => {
      if (done) return;
      if (!readyToActivate({
        bankedDays,
        visible: document.visibilityState === "visible",
        surface: referralSurface(),
      })) return;
      done = true;
      setBankedDays(0);
      activateBankedRewards()
        .then((result) => {
          if (result.days <= 0 || !result.fulfillment) return;
          markGrantSeen(uid, Date.now());
          announceProWelcome({
            kind: "referral_earned",
            days: result.days,
            fulfillment: result.fulfillment,
            renewsAtMs: result.renewsAtMs,
            friends: result.friends,
          });
        })
        // Nothing earned is lost: the server keeps it, and the next visit tries again.
        .catch((error) => console.warn("RecipePrinter: could not start earned Pro days", error));
    };
    tryNow();
    document.addEventListener("visibilitychange", tryNow);
    window.addEventListener(REFERRAL_SURFACE_EVENT, tryNow);
    return () => {
      document.removeEventListener("visibilitychange", tryNow);
      window.removeEventListener(REFERRAL_SURFACE_EVENT, tryNow);
    };
  }, [uid, bankedDays]);

  return (
    <>
      {verifying && uid && (
        <CookPilotLoginDialog
          reason="verify_referral"
          onClose={() => setVerifying(false)}
          // Same account, now confirmed: the uid doesn't change, so the claim
          // effect above won't run again by itself.
          onAuthenticated={() => {
            setVerifying(false);
            void claim();
          }}
        />
      )}
      {welcome && (
        <ProWelcomeDialog
          welcome={welcome}
          onClose={() => {
            setWelcome(null);
            announceProChanged();
          }}
        />
      )}
      {expiredEnd !== null && summary && (
        <ExpiredReferralChoice summary={summary} onDone={() => setExpiredEnd(null)} />
      )}
    </>
  );
}

/**
 * Referral Pro has run out: subscribe, or invite a friend, side by side. At the
 * lifetime cap there is nothing more to earn, so it is the ordinary plans
 * dialog instead, with no promise of more days. Mounted only when needed, so
 * the purchase flow's own RevenueCat read happens only then.
 */
function ExpiredReferralChoice({ summary, onDone }: { summary: ReferralSummary; onDone: () => void }) {
  const offerInvite = Boolean(summary.code) && !capReached(summary);
  const { openProUpgrade, proUpgradeDialog } = useStandaloneProUpgrade(
    "referral_expired",
    offerInvite && summary.code
      ? {
        referralChoice: {
          inviteUrl: inviteUrl(summary.code, window.location.origin),
          rewardDays: summary.rewardDays,
        },
      }
      : undefined,
  );
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    if (offerInvite) track("referral_prompt_viewed", { placement: "expired_paywall", cap_reached: false });
    openProUpgrade();
  }, [offerInvite, openProUpgrade]);
  // The hook's dialog closes itself; once it has been seen open and then
  // closed, this is done.
  const sawOpenRef = useRef(false);
  useEffect(() => {
    if (proUpgradeDialog) sawOpenRef.current = true;
    else if (sawOpenRef.current) onDone();
  }, [proUpgradeDialog, onDone]);
  return <>{proUpgradeDialog}</>;
}
