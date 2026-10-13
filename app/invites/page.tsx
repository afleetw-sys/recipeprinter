"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { ReferralCard } from "@/components/ReferralCard";
import { GiftIcon, ICON_SIZE, SpinnerIcon } from "@/components/icons";

/**
 * Invites: your link and what it has earned, reached from the profile menu.
 * Same shape as /account: a sign-in gate when signed out, since a link and its
 * rewards belong to an account.
 */
export default function InvitesPage() {
  const { user, ready } = useCookPilotAuth();
  const [showLogin, setShowLogin] = useState(false);
  // See app/account/page.tsx: starts true on server and client alike.
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (ready) setLoading(false);
  }, [ready]);

  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-cp-4 py-cp-5 sm:px-cp-6 sm:py-cp-7">
        <header className="mb-cp-7">
          <h1 className="text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">Invites</h1>
        </header>

        {loading ? (
          <div className="recipe-loading-state min-h-48"><SpinnerIcon size={ICON_SIZE.lg} /><span>Loading…</span></div>
        ) : user ? (
          <ReferralCard />
        ) : (
          <div className="flex flex-col items-center rounded-xl border border-line bg-card px-cp-4 py-cp-5 text-center sm:px-cp-6 sm:py-cp-7">
            <GiftIcon size={32} className="text-ink-soft" />
            <h2 className="mt-cp-4 text-cp-h2 font-extrabold tracking-[-0.02em]">Sign in to get your link</h2>
            <p className="mt-cp-2 max-w-sm text-cp-body text-ink-soft leading-relaxed">
              Sign in is required to track your referrals and rewards.
            </p>
            <button type="button" className="btn btn-primary mt-cp-5" onClick={() => setShowLogin(true)}>
              Sign in
            </button>
          </div>
        )}
      </main>

      <SiteFooter />

      {showLogin && !user && <CookPilotLoginDialog onClose={() => setShowLogin(false)} onAuthenticated={() => setShowLogin(false)} />}
    </div>
  );
}
