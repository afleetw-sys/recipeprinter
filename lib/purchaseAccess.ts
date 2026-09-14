export type PurchaseGate =
  | "unlock-cookbook"
  | "unlock-pro"
  | "continue";

/**
 * `proLocked` covers both a locked theme and a locked card size — both are
 * the same purchase now (RecipePrinter Pro), so both resolve to the same
 * `"unlock-pro"` gate. There is no `"unlock-template"` branch: a single
 * premium-template purchase is retired for new sales, so nothing reaches
 * this function locked on a theme it doesn't also consider Pro-unlockable
 * (see `hasTemplateOrProEntitlement` in lib/recipePrinterPurchases.ts) — an
 * already-owned legacy theme is simply not locked in the first place.
 */
export function purchaseGate({
  cookbookLocked,
  proLocked,
}: {
  cookbookLocked: boolean;
  proLocked: boolean;
}): PurchaseGate {
  if (cookbookLocked) return "unlock-cookbook";
  if (proLocked) return "unlock-pro";
  return "continue";
}

// "protect-purchase" (prompting a signed-out buyer to make an account right
// after printing) was retired along with the per-template purchase it
// existed for: a cookbook purchase uses its own persistent banner instead,
// and RecipePrinter Pro checkout requires signing in before it can even
// start (see `openProUpgradeDialog` in app/print/page.tsx), so there is no
// remaining signed-out purchase for this to protect.
export type PostPrintAction = "donate" | "none";

export function postPrintPrompt(
  action: PostPrintAction,
  donationAlreadyShown: boolean,
): "donate" | null {
  if (action === "none" || donationAlreadyShown) return null;
  return "donate";
}

export function revenueCatIdentityTransition(
  currentUserId: string | null,
  targetUserId: string,
): "identify" | "reuse" | "switch" {
  if (currentUserId === targetUserId) return "reuse";
  if (currentUserId?.startsWith("$RCAnonymousID:")) return "identify";
  return "switch";
}
