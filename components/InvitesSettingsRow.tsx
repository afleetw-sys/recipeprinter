"use client";

import Link from "next/link";
import { ChevronRightIcon, GiftIcon, ICON_SIZE } from "@/components/icons";
import { REFERRALS_LIVE } from "@/lib/referral";

/** Settings' way in to Invites (the full page is /invites, also in the profile menu). */
export function InvitesSettingsRow() {
  if (!REFERRALS_LIVE) return null;
  return (
    <Link
      href="/invites"
      className="mb-cp-7 flex items-center gap-cp-3 rounded-xl border border-line bg-card p-cp-5 hover:bg-page"
    >
      <GiftIcon size={ICON_SIZE.lg} className="shrink-0 text-ink-soft" />
      <span className="flex-1">
        <span className="block text-cp-h2 font-extrabold text-ink">Invites</span>
        <span className="block text-cp-small text-ink-soft">Share your link and earn days of Pro.</span>
      </span>
      <ChevronRightIcon size={ICON_SIZE.md} className="shrink-0 text-ink-soft" />
    </Link>
  );
}
