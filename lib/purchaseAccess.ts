export type PurchaseGate =
  | "unlock-cookbook"
  | "unlock-template"
  | "continue";

export function purchaseGate({
  cookbookLocked,
  templateLocked,
}: {
  cookbookLocked: boolean;
  templateLocked: boolean;
}): PurchaseGate {
  if (cookbookLocked) return "unlock-cookbook";
  if (templateLocked) return "unlock-template";
  return "continue";
}

export type PostPrintAction = "donate" | "protect-purchase" | "none";

export function postPrintPrompt(
  action: PostPrintAction,
  donationAlreadyShown: boolean,
): "donate" | "protect-purchase" | null {
  if (action === "protect-purchase") return "protect-purchase";
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
