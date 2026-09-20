import { normalizeHost } from "@/lib/url";

/**
 * The two things every mapper below reads: the thrown value's `code` (Firebase
 * and Firestore both carry one; a plain Error does not) and its message.
 *
 * One shape, five copies, until this — which mattered less than the next
 * function does. Exported for `lib/parser.ts`, which was a sixth copy; see
 * `isNetworkFailure` for the part parser deliberately does NOT share.
 */
export function errorParts(error: unknown): { code: string; message: string } {
  return {
    code: (error as { code?: string })?.code ?? "",
    message: error instanceof Error ? error.message : String(error || ""),
  };
}

/**
 * Is this a connection problem rather than a refusal?
 *
 * Five of the mappers below asked this, each with its own list, and the lists
 * had drifted into disagreeing about the same failure. `deadline-exceeded`
 * during sign-in fell through to the generic fallback while the identical
 * failure creating a share link got the right sentence; `failed to fetch` was
 * recognised in three of the five. There is no reason a dropped connection
 * should be a different KIND of problem depending on which screen you are on —
 * the wording per screen is a deliberate choice, the detection is not.
 *
 * The union of what the five checked, so this recognises strictly more than any
 * of them did and nothing that was previously matched is now missed.
 *
 * NOT for `lib/parser.ts`, and that is a deliberate exception rather than the
 * one module nobody got round to. Every mapper here answers with a SENTENCE, so
 * flattening a dropped connection into one bucket is exactly right. Parser
 * answers with an `ImportFailureCode`, which is the vocabulary the import
 * dashboards are counted in, and it has to tell these apart: `deadline-exceeded`
 * is `timeout`, `unavailable` carrying a no-recipe message is `no_recipe`, and
 * `resource-exhausted` splits again into `rate_limited` and `too_large`. Calling
 * this there would collapse four buckets into one and make the number we tune
 * the parser against stop meaning anything. Parser shares `errorParts` and
 * nothing else, on purpose.
 */
function isNetworkFailure(code: string, message: string): boolean {
  return (
    code.includes("network") ||
    code.includes("unavailable") ||
    code.includes("deadline-exceeded") ||
    /network|timeout|failed to fetch|temporarily unavailable/i.test(message)
  );
}

/**
 * The Firebase error code, in a form safe to send as an analytics property.
 *
 * Only ever a code (`auth/invalid-credential`, `functions/unavailable`), never a
 * message: messages can carry the address that was typed. Anything that does not
 * look like a code is reported as `unknown` rather than passed through.
 */
export function authFailureCode(error: unknown): string {
  const { code } = errorParts(error);
  return /^[a-z][a-z0-9-]*\/[a-z0-9-]+$/i.test(code) ? code.slice(0, 64) : "unknown";
}

export function friendlyAuthError(error: unknown, fallback = "We couldn't sign you in. Please try again."): string {
  const { code, message } = errorParts(error);

  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "That email or password didn't match an account.";
  }
  if (code.includes("weak-password") || code.includes("password-does-not-meet-requirements")) {
    return "Choose a stronger password with at least 6 characters.";
  }
  if (code.includes("account-exists-with-different-credential")) {
    // Google or Apple was chosen for an email that already signs in another way.
    // Which way is not something the error tells us, so say the true, useful thing.
    return "That email already has an account that signs in a different way. Try Google, Apple, or your email and password.";
  }
  if (code.includes("invalid-email")) {
    return "Check the email address and try again.";
  }
  if (code.includes("user-disabled")) {
    return "That account has been turned off. Please contact us and we'll sort it out.";
  }
  if (code.includes("requires-recent-login")) {
    return "For your security, please sign in again and then retry that.";
  }
  if (
    code.includes("web-storage-unsupported") ||
    code.includes("operation-not-supported-in-this-environment")
  ) {
    return "This browser is blocking sign-in. Opening recipeprinter.com in Safari or Chrome will fix it.";
  }
  if (
    code.includes("operation-not-allowed") ||
    code.includes("unauthorized-domain") ||
    code.includes("internal-error") ||
    code.includes("app-not-authorized")
  ) {
    return "Sign-in isn't available right now. Please try again in a little while.";
  }
  if (code.includes("email-already-in-use")) {
    return "That email already has an account. Enter its password to sign in.";
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
  if (isNetworkFailure(code, message)) {
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
  const { code, message } = errorParts(error);

  if (code.includes("permission-denied") || code.includes("unauthenticated")) {
    return "Please sign in again to use your CookPilot recipes.";
  }
  if (isNetworkFailure(code, message)) {
    return "We couldn't reach your recipe library. Check your connection and try again.";
  }

  return fallback;
}

export function friendlyPhotoUploadError(error: unknown): string {
  const { code, message } = errorParts(error);

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
  if (isNetworkFailure(code, message)) {
    return "We couldn't connect to save that photo. Check your connection and try again.";
  }

  return "We couldn't add that photo. Please try again.";
}

/**
 * Deliberately does NOT use `isNetworkFailure`. RevenueCat throws a numeric
 * `errorCode`, not the string `code` that predicate reads, so it would be
 * matching on the message alone anyway — and "temporarily unavailable" means
 * something different here (the SDK has no usable key or offering) than it does
 * on a Firestore call, which is why that phrase is caught by its own branch
 * above and answered differently.
 */
export function friendlyPurchaseSetupError(error: unknown): string {
  const { message } = errorParts(error);

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

/**
 * RFC 2606 reserves these names for documentation, so none of them is ever a
 * real site. Someone pasting one is trying the box out rather than importing
 * anything, and "We couldn't find that page. Check the link and try again."
 * answers them as though they made a mistake with a real link.
 */
const PLACEHOLDER_HOSTS = new Set(["example.com", "example.org", "example.net", "example.edu"]);

/** A machine talking to itself. Reachable, but never a recipe on the web. */
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"]);

/**
 * RFC 6761 reserves these at the top level, so EVERYTHING under them is a
 * placeholder: `foo.test`, `staging.localhost` and `anything.invalid` are
 * reserved by definition, not by a list we would have to keep current.
 */
const RESERVED_TLDS = new Set(["test", "invalid", "localhost", "example"]);

/**
 * True for a host that is reserved by definition and can never hold a recipe.
 *
 * The `example.*` set is an EXACT match on purpose, so `myexample.com` and
 * `example.com.recipes.io` are still real sites worth parsing. The reserved
 * TLDs match on the last label, because reservation there covers the whole
 * tree beneath them.
 */
export function isPlaceholderHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (!host) return false;
  if (PLACEHOLDER_HOSTS.has(host) || LOOPBACK_HOSTS.has(host)) return true;
  return RESERVED_TLDS.has(host.split(".").pop() ?? "");
}

/** The reply for a placeholder domain, or null for a host worth parsing. */
export function placeholderHostMessage(hostname: string): string | null {
  const host = normalizeHost(hostname);
  if (!isPlaceholderHost(host)) return null;
  if (PLACEHOLDER_HOSTS.has(host)) {
    return `${host} is the address the web uses in its own examples, so there is nothing behind it to read. Paste a link to a real recipe and it will come straight in.`;
  }
  return `${host} is a reserved address rather than a site on the web, so there is nothing behind it to read. Paste a link to a real recipe and it will come straight in.`;
}
