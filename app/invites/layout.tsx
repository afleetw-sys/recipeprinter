import type { Metadata } from "next";

// Per-person, so never indexed (see app/account/layout.tsx for why the layout).
export const metadata: Metadata = {
  title: "Invites",
  robots: { index: false, follow: true },
};

export default function InvitesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
