export function friendlyAuthError(error: unknown, fallback = "We couldn't sign you in. Please try again."): string {
  const code = (error as { code?: string })?.code ?? "";
  const message = error instanceof Error ? error.message : String(error || "");

  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "That email or password didn't match an account.";
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
    return "We couldn't connect to CookPilot. Please try again in a moment.";
  }

  return fallback;
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
    return "We couldn't connect to the purchase service. Please try again in a moment.";
  }
  if (/cancel/i.test(message)) {
    return "Purchase cancelled. Your recipe cards are still here when you're ready.";
  }

  return "We couldn't unlock that template. Please try again.";
}
