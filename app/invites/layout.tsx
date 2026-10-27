import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { REFERRALS_LIVE } from "@/lib/referral";

// Per-person, so never indexed (see app/account/layout.tsx for why the layout).
export const metadata: Metadata = {
  title: "Invites",
  robots: { index: false, follow: true },
};

export default function InvitesLayout({ children }: { children: React.ReactNode }) {
  // Hidden with the rest of the program (lib/referral.ts).
  if (!REFERRALS_LIVE) notFound();
  return children;
}
