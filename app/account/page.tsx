"use client";

import { useEffect, useState } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import { AccountPersonalDetails } from "@/components/AccountPersonalDetails";
import { AccountProStatus } from "@/components/AccountProStatus";
import { FreePlanCards } from "@/components/FreePlanCards";
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
  /** The sign-in dialog, and whether Upgrade is what asked for it. */
  const [login, setLogin] = useState<"account" | "upgrade" | null>(null);
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
  // A link to a section (the referral invite's "Pro" goes to #plan) arrives
  // before the section exists, while this page is still loading, so the
  // browser's own jump finds nothing. Jump once it's there.
  useEffect(() => {
    if (loading || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loading]);

  return (
    <div className="min-h-screen bg-page text-ink">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-cp-4 py-cp-5 sm:px-cp-6 sm:py-cp-7">
        <header className="mb-cp-7 flex flex-wrap items-start justify-between gap-cp-4">
          <div>
            <h1 className="text-cp-hero-sm font-extrabold tracking-[-0.04em] leading-[1.08]">Settings</h1>
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
             no plan, no session to end — so the top of the page is the way to
             sign in, where the personal details would be. The account menu's
             Settings row lands here signed out too (see AccountAvatarButton). */
          <>
          <div className="mb-cp-7 flex flex-col items-center rounded-xl border border-line bg-card px-cp-4 py-cp-5 text-center sm:px-cp-6 sm:py-cp-7">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cp-accent-warm)]">
              <AccountIcon size={28} className="text-[var(--cp-on-accent-warm)]" />
            </div>
            <h2 className="mt-cp-4 text-cp-h2 font-extrabold tracking-[-0.02em]">Sign in to see your account</h2>
            <p className="mt-cp-2 max-w-sm text-cp-body text-ink-soft leading-relaxed">
              Your name, plan, and settings are tied to your account. Sign in and they’ll be right here.
            </p>
            <button type="button" className="btn btn-primary mt-cp-5" onClick={() => setLogin("account")}>
              Sign in
            </button>
          </div>
          {/* The plans are no secret, so they show signed out too. Upgrade
              asks for sign-in and stops there: the account that signs in may
              already have Pro, and its own Plan section says which. */}
          <section id="plan" className="mb-cp-7 scroll-mt-cp-6 rounded-xl border border-line bg-card p-cp-5">
            <h2 className="border-b border-line pb-cp-3 text-cp-h2 font-extrabold text-ink sm:border-b-0 sm:pb-0">Plan</h2>
            <FreePlanCards onUpgrade={() => setLogin("upgrade")} />
          </section>
          </>
        )}
      </main>

      <SiteFooter />

      {login && !user && (
        <CookPilotLoginDialog
          onClose={() => setLogin(null)}
          intro={
            login === "upgrade"
              ? {
                  title: "Sign in to upgrade",
                  body: "Pro is kept with your account, so it's there on this device or another one.",
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
