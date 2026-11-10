/**
 * When the header fetches the account menu (and with it Firebase Auth).
 *
 * The header is on every route, including the prerendered homepage and SEO
 * pages, so it does not load Firebase unless something needs it:
 *
 *  - "now": auth work is already waiting on this page, and nobody is going to
 *    press anything to start it. Without the menu nothing on these pages loads
 *    Firebase, so the work would sit there until the next press of the avatar.
 *  - "idle": this browser has an account behind it; have the avatar correct by
 *    the time anyone looks.
 *  - "on-click": a visitor with no account state to show. The press is replayed.
 */
export type AccountMenuLoad = "now" | "idle" | "on-click";

export function accountMenuLoadAtMount({
  pendingEmailCode,
  redirectPending,
  wasSignedIn,
}: {
  /** An emailed sign-in code waiting to be typed (the tab was reloaded or dropped). */
  pendingEmailCode: boolean;
  /** A Google/Apple redirect left this tab and this load may be its return. */
  redirectPending: boolean;
  /** This browser has been signed in before. */
  wasSignedIn: boolean;
}): AccountMenuLoad {
  if (pendingEmailCode || redirectPending) return "now";
  if (wasSignedIn) return "idle";
  return "on-click";
}
