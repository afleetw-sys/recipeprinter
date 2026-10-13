"use client";

import { useEffect, useRef, useState } from "react";
import { LinkIcon, ICON_SIZE } from "@/components/icons";
import { referralPromptsAllowed, track } from "@/lib/analytics";
import {
  capReached,
  daysRemaining,
  inviteShareText,
  inviteUrl,
  loadReferralSummary,
  type ReferralSummary,
} from "@/lib/referral";
import { shareLink } from "@/lib/shareLink";

/**
 * Settings: your invite link and what it has earned. Hidden while the program
 * is switched off on the server, and for anyone the `referral-program` flag
 * holds out.
 */
export function ReferralCard() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [shared, setShared] = useState<"copy" | "native_share" | "manual" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!referralPromptsAllowed()) return;
    let alive = true;
    // `link` makes the code the first time, so the card always has one to show.
    loadReferralSummary("link")
      .then((loaded) => {
        if (alive) setSummary(loaded);
      })
      .catch((error) => console.warn("RecipePrinter: could not load the invite link", error));
    return () => {
      alive = false;
    };
  }, []);

  const atCap = summary ? capReached(summary) : false;
  useEffect(() => {
    if (!summary?.enabled || !summary.code || viewedRef.current) return;
    viewedRef.current = true;
    track("referral_prompt_viewed", { placement: "account", cap_reached: atCap });
  }, [summary, atCap]);

  if (!summary) return null;
  if (!summary.enabled || !summary.code) {
    return <p className="text-cp-body text-ink-soft">Invites aren&rsquo;t open yet.</p>;
  }
  const url = inviteUrl(summary.code, window.location.origin);
  const friends = summary.successfulReferrals;
  const shareText = inviteShareText(summary.rewardDays);

  async function share() {
    const method = await shareLink(url, shareText);
    if (!method) {
      // No share sheet and no clipboard access: select the link so it can be copied by hand.
      inputRef.current?.focus();
      inputRef.current?.select();
      setShared("manual");
      return;
    }
    track("referral_link_shared", { placement: "account", method });
    setShared(method);
  }

  return (
    <section className="mb-cp-7 rounded-xl border border-line bg-card p-cp-5">
      <h2 className="text-cp-h2 font-extrabold text-ink">Your invite link</h2>
      <p className="mt-1 text-cp-body text-ink-soft">
        {atCap
          ? `You've earned the most Pro days you can from invites. Friends still get their ${summary.rewardDays}.`
          : `Give a friend ${summary.rewardDays} days of Pro. When they sign up, you get ${summary.rewardDays} days too.`}
      </p>

      <div className="mt-cp-4 flex flex-col gap-cp-2 sm:flex-row">
        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="Your invite link"
          className="field min-w-0 flex-1"
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" className="btn btn-secondary" onClick={() => void share()}>
          <LinkIcon size={ICON_SIZE.sm} />
          {shared === "copy" ? "Copied" : shared === "native_share" ? "Shared" : "Share link"}
        </button>
      </div>

      {shared === "manual" && (
        <p className="mt-cp-2 text-cp-small text-ink-soft" role="status">The link is selected. Copy it to share.</p>
      )}
      <p className="mt-cp-3 text-cp-small text-ink-soft">
        {friends === 1 ? "1 friend joined" : `${friends} friends joined`}
        {" · "}
        {summary.lifetimeDaysEarned} of {summary.lifetimeCapDays} days earned
        {!atCap && ` · ${daysRemaining(summary)} left to earn`}
      </p>
    </section>
  );
}
