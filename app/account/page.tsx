"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { AccountPersonalDetails } from "@/components/AccountPersonalDetails";
import { AccountProStatus } from "@/components/AccountProStatus";
import { AccountIcon, ICON_SIZE, SpinnerIcon } from "@/components/icons";

/**
 * Settings: personal details (email, editable name, sign out) and Plan/
 * billing — sign out lives on the identity card, not its own, since it
 * isn't substantial enough to be a third thing on this page and it isn't a
 * plan decision either. Separate from `/projects` — which reader would look
 * for a cookbook under "Account settings"? — even though both are one tap
 * away from the same header avatar (see
 * `components/AccountAvatarButton.tsx`'s dropdown).
 */
export default function AccountPage() {
  const { user, ready } = useCookPilotAuth();
  const [showLogin, setShowLogin] = useState(false);
  /**
   * Starts `true` on both server and client so the first render is identical
   * either way — `ready` itself comes from `useCookPilotAuth`'s module-level
   * auth state, which is seeded from a `localStorage` read that doesn't exist
   * during SSR, so branching the render directly on `ready` mismatched the
   * server HTML against the client's first paint (a React hydration error).
   * Flipped in an effect, which only ever runs after hydration, exactly the
   * `loading`-flag pattern `/projects` already uses for the same reason.
   */
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (ready) setLoading(false);
  }, [ready]);

  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-cp-6 py-cp-7">
        <header className="mb-cp-7 flex flex-wrap items-start justify-between gap-cp-4">
          <div>
            <h1 className="text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">Account</h1>
          </div>
        </header>

        {loading ? (
          <div className="recipe-loading-state min-h-48"><SpinnerIcon size={ICON_SIZE.lg} /><span>Loading…</span></div>
        ) : user ? (
          <>
            <AccountPersonalDetails user={user} />
            <AccountProStatus user={user} />
          </>
        ) : (
          /* Nothing here belongs to a signed-out visitor — no name, no email,
             no plan, no session to end — so this is a plain sign-in gate
             rather than the graceful local-shelf fallback `/projects` shows.
             Reachable only by a direct visit or a bookmark: the header avatar
             opens the sign-in dialog straight away for a signed-out click
             (see AccountAvatarButton), never routing here first. */
          <div className="flex flex-col items-center rounded-xl border border-line bg-card px-cp-6 py-cp-7 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cp-accent-warm)]">
              <AccountIcon size={28} className="text-[var(--cp-on-accent-warm)]" />
            </div>
            <h2 className="mt-cp-4 text-cp-h2 font-extrabold tracking-[-0.02em]">Sign in to see your account</h2>
            <p className="mt-cp-2 max-w-sm text-cp-body text-ink-soft leading-relaxed">
              Your name, plan, and settings are tied to your account. Sign in and they’ll be right here.
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
