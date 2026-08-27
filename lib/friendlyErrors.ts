export function friendlyAuthError(error: unknown, fallback = "We couldn't sign you in. Please try again."): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = error instanceof Error ? error.message : String(error || "");

  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "That email or password didn't match an account.";
  }
  if (code.includes("weak-password")) {
    return "Choose a stronger password with at least 6 characters.";
  }
  if (code.includes("email-already-in-use")) {
    return "An account already uses that email. Go back and sign in instead.";
  }
  if (code.includes("popup-closed") || code.includes("cancelled")) {
    return "Sign-in was cancelled.";
  }
  if (code.includes("popup-blocked")) {
    return "Your browser blocked the sign-in window. Allow popups and try again.";
  }
  if (code.includes("too-many-requests")) {
    return "Too many attempts. Please wait a bit and try again.";
  }
  if (code.includes("network") || /network/i.test(message)) {
    return "We couldn't connect. Check your internet connection and try again.";
  }
  if (code.includes("invalid-action-code") || code.includes("expired-action-code")) {
    return "That sign-in link expired. Send yourself a new one and try again.";
  }

  return fallback;
}

export function friendlyRecipeLibraryError(
  error: unknown,
  fallback = "We couldn't load your CookPilot recipes. Please try again.",
): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = error instanceof Error ? error.message : String(error || "");

  if (code.includes("permission-denied") || code.includes("unauthenticated")) {
    return "Please sign in again to use your CookPilot recipes.";
  }
  if (code.includes("deadline-exceeded") || code.includes("unavailable") || /network|timeout/i.test(message)) {
    return "We couldn't reach your recipe library. Check your connection and try again.";
  }

  return fallback;
}

export function friendlyClaimError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = error instanceof Error ? error.message : String(error || "");

  if (code.includes("already-exists")) {
    return "You've already claimed your free template.";
  }
  if (code.includes("failed-precondition")) {
    return "An active CookPilot subscription is required to claim a free template.";
  }
  if (code.includes("unauthenticated")) {
    return "Please sign in with your CookPilot account to claim a free template.";
  }
  if (code.includes("deadline-exceeded") || code.includes("unavailable") || /network|timeout/i.test(message)) {
    return "We couldn't finish claiming your template. Check your connection and try again.";
  }

  return "We couldn't claim that template right now. Please try again.";
}

export function friendlyPhotoUploadError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = error instanceof Error ? error.message : String(error || "");

  // Thrown by lib/coverPhoto.ts when the browser can't decode the file — most
  // often a HEIC or a corrupt image picked past the `accept="image/*"` filter.
  if (/unable to load image|could not encode|canvas unavailable/i.test(message)) {
    return "We couldn't read that image. Try a different photo — a JPG or PNG works best.";
  }
  // Firebase Storage error codes are `storage/unauthorized`, `storage/canceled`,
  // `storage/quota-exceeded`, `storage/retry-limit-exceeded`, etc.
  if (code.includes("unauthorized") || code.includes("unauthenticated") || code.includes("permission")) {
    return "We couldn't save that photo. Please try again.";
  }
  if (code.includes("quota") || code.includes("retry-limit")) {
    return "We couldn't save that photo right now. Please try again in a moment.";
  }
  if (code.includes("cancel")) {
    return "That photo upload was cancelled.";
  }
  if (code.includes("network") || /network|timeout|failed to fetch|temporarily unavailable/i.test(message)) {
    return "We couldn't connect to save that photo. Check your connection and try again.";
  }

  return "We couldn't add that photo. Please try again.";
}

export function friendlyPurchaseSetupError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");

  if (/purchase option|package|offering|revenuecat/i.test(message)) {
    return "This template isn't ready to buy yet. Please try another template or check back soon.";
  }
  if (/temporarily unavailable|api key|configured/i.test(message)) {
    return "Premium templates are temporarily unavailable. Please try again later.";
  }
  if (/network|timeout|failed to fetch/i.test(message)) {
    return "We couldn't start the purchase. Check your connection and try again.";
  }
  if (/cancel/i.test(message)) {
    return "Purchase cancelled. Your recipe cards are still here when you're ready.";
  }

  return "We couldn't unlock that template. Please try again.";
}

export function friendlyShareLinkError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = error instanceof Error ? error.message : String(error || "");

  if (/already taken/i.test(message) || code.includes("already-exists")) {
    return "That link name is already in use. Try a different one.";
  }
  if (code.includes("permission-denied") || code.includes("unauthenticated")) {
    return "Your sign-in has expired. Sign in again, then try creating the link.";
  }
  if (code.includes("network") || code.includes("unavailable") || /network|timeout|failed to fetch/i.test(message)) {
    return "We couldn't create the link. Check your connection and try again.";
  }

  return "We couldn't create that link right now. Please try again.";
}

/**
 * RFC 2606 reserves these names for documentation, so none of them is ever a
 * real site. Someone pasting one is trying the box out rather than importing
 * anything, and "We couldn't find that page. Check the link and try again."
 * answers them as though they made a mistake with a real link.
 */
const PLACEHOLDER_HOSTS = new Set(["example.com", "example.org", "example.net", "example.edu"]);

/** The reply for a placeholder domain, or null for a host worth parsing. */
export function placeholderHostMessage(hostname: string): string | null {
  const host = hostname.trim().toLowerCase().replace(/^www\./, "");
  if (!PLACEHOLDER_HOSTS.has(host)) return null;
  return `${host} is the internet's placeholder address. Nobody has ever cooked anything there, so try a real recipe link.`;
}
