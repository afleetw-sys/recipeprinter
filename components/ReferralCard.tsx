"use client";

import { useEffect, useRef, useState } from "react";
import { CheckIcon, GiftIcon, LinkIcon, ICON_SIZE } from "@/components/icons";
import { referralPromptsAllowed, track } from "@/lib/analytics";
import {
  capReached,
  inviteShareText,
  inviteUrl,
  loadReferralSummary,
  type ReferralSummary,
} from "@/lib/referral";
import { copyLink } from "@/lib/shareLink";

/**
 * Invites, signed in: the reward first, two ways to pass the link on, and how
 * far along the lifetime cap this account is. A utility card, not a landing
 * page: at most 640px wide, the link itself on show beside Copy and Share, and
 * one layout for every plan, with only the line under the headline changing.
 *
 * Hidden while the program is switched off on the server, and for anyone the
 * `referral-program` flag holds out.
 */
function rewardLine(summary: ReferralSummary): string {
  const days = summary.rewardDays;
  if (summary.proPaid) return `Every friend who signs up through your link pushes your next Pro payment back ${days} days.`;
  if (summary.proActive) return `Every friend who signs up through your link adds ${days} days to your Pro.`;
  return `Every friend who signs up through your link earns you ${days} days of Pro.`;
}

export function ReferralCard() {
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [copied, setCopied] = useState(false);
  /** No clipboard access: the link is selected to copy by hand. */
  const [manual, setManual] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [canShare, setCanShare] = useState(false);
  const viewedRef = useRef(false);

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
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
  const shareText = inviteShareText(summary.rewardDays);

  async function copy() {
    if (await copyLink(url)) {
      track("referral_link_shared", { placement: "account", method: "copy" });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      // No clipboard access: select the link so it can be copied by hand.
      inputRef.current?.focus();
      inputRef.current?.select();
      setManual(true);
    }
  }

  async function share() {
    try {
      await navigator.share({ url, text: shareText });
      track("referral_link_shared", { placement: "account", method: "native_share" });
    } catch {
      // Closed without sharing: nothing to do.
    }
  }

  // The lifetime cap, one tile per reward (15 days of 3 is five). Someone who
  // joined through a friend's link already has their welcome in it, so it
  // takes the first tile and the rest are friends.
  const tiles = Math.max(1, Math.ceil(summary.lifetimeCapDays / summary.rewardDays));
  const welcomeTiles = summary.referred ? 1 : 0;
  const friendSlots = tiles - welcomeTiles;
  const friends = summary.successfulReferrals;
  const friendsCounted = Math.min(friends, friendSlots);
  const earned = Math.min(summary.lifetimeDaysEarned, summary.lifetimeCapDays);
  const friendsLeft = Math.max(0, friendSlots - friendsCounted);

  return (
    <section className="mb-cp-7 max-w-[640px] rounded-xl border border-line bg-card p-cp-5">
      <h2 className="text-cp-h2 font-extrabold text-ink">Invite friends. Earn more Pro.</h2>
      <p className="mt-1 text-cp-body text-ink-soft">
        {atCap
          ? `You've earned the most Pro days you can from invites. Friends still get their ${summary.rewardDays}.`
          : rewardLine(summary)}
      </p>

      <div className="mt-cp-4 flex flex-col gap-cp-2 sm:flex-row">
        <input
          ref={inputRef}
          readOnly
          value={url}
          aria-label="Your invite link"
          className="field field--compact min-w-0 flex-1 font-normal"
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="flex gap-cp-2">
          <button type="button" className="btn btn-secondary btn-compact flex-1 sm:flex-none" onClick={() => void copy()}>
            <LinkIcon size={ICON_SIZE.sm} />
            {copied ? "Copied" : "Copy link"}
          </button>
          {canShare && (
            <button type="button" className="btn btn-secondary btn-compact flex-1 sm:flex-none" onClick={() => void share()}>
              Share
            </button>
          )}
        </div>
      </div>
      {manual && (
        <p className="mt-cp-2 text-cp-small text-ink-soft" role="status">The link is selected. Copy it to share.</p>
      )}

      <div className="mt-cp-5 border-t border-line pt-cp-4">
        <div className="flex items-baseline justify-between gap-cp-3">
          <h3 className="text-cp-body font-extrabold text-ink">Your referral rewards</h3>
          <span className="text-cp-small text-ink-soft">
            {friendsCounted} of {friendSlots} {friendSlots === 1 ? "friend" : "friends"}
          </span>
        </div>
        <ol className="mt-cp-3 grid gap-cp-2" style={{ gridTemplateColumns: `repeat(${tiles}, minmax(0, 1fr))` }}>
          {Array.from({ length: tiles }, (_, i) => {
            const isWelcome = i < welcomeTiles;
            const done = isWelcome || i - welcomeTiles < friendsCounted;
            return (
              <li
                key={i}
                className={`flex flex-col items-center gap-cp-1 rounded-lg border px-cp-1 py-cp-3 text-center ${
                  done ? "border-line bg-card" : "border-transparent bg-[var(--cp-surface-strong)]"
                }`}
              >
                {done ? (
                  <span className="grid h-6 w-6 place-items-center rounded-full border-[1.5px] border-[var(--cp-accent)] text-[var(--cp-accent)]">
                    <CheckIcon size={ICON_SIZE.sm} />
                  </span>
                ) : (
                  <GiftIcon size={ICON_SIZE.lg} className="h-6 text-ink-soft" />
                )}
                <span className={`text-cp-small font-semibold ${done ? "text-ink" : "text-ink-soft"}`}>
                  {isWelcome ? "Welcome" : `Friend ${i - welcomeTiles + 1}`}
                </span>
                <span className={`text-cp-small ${done ? "text-ink" : "text-ink-soft"}`}>+{summary.rewardDays} days</span>
              </li>
            );
          })}
        </ol>
        <p className="mt-cp-4 text-cp-h2 font-extrabold text-ink">
          {earned} {earned === 1 ? "day" : "days"} earned
        </p>
        <p className="mt-1 text-cp-body text-ink-soft">
          {atCap || friendsLeft === 0
            ? `You've earned all ${summary.lifetimeCapDays} days. Friends still get their ${summary.rewardDays}.`
            : `Invite ${friendsLeft} more ${friendsLeft === 1 ? "friend" : "friends"} to earn all ${summary.lifetimeCapDays} days.`}
        </p>
      </div>
    </section>
  );
}
