import type { ImportFailureCode } from "@/types/recipe";

/**
 * An import failure CookPilot explained: its cause in `reason`, the sentence
 * for the cook in `message`.
 *
 * CookPilot's shared parser is the one source of wording for any failure whose
 * cause it knows (deployed 2026-11-10). When a reason is present its message is
 * shown as it is, never swapped for our own copy. Ours is only for failures
 * with no reason: CookPilot unreachable, our own fetch, our own limits. If a
 * message is wrong for RecipePrinter, change it in CookPilot, where every app
 * reads it.
 */
export interface ReasonedFailure {
  reason: string;
  message: string;
  /** Our analytics bucket. Never changes the message. */
  failure: ImportFailureCode;
}

/** Reasons under `not-found` that mean the page itself is missing, not that it holds no recipe. */
const MISSING_PAGE = new Set(["site-not-found", "page-not-found", "redirected-home", "share-link-unresolved"]);

/**
 * The explained failure in a CookPilot answer, or null when it carries no
 * reason. `code` is the Functions code, bare over HTTP ("not-found") or
 * prefixed from a callable ("functions/not-found").
 */
export function reasonedFailure(code: unknown, reason: unknown, message: unknown): ReasonedFailure | null {
  if (typeof reason !== "string" || !reason.trim()) return null;
  if (typeof message !== "string" || !message.trim()) return null;
  return { reason, message: message.trim(), failure: bucketFor(String(code ?? ""), reason) };
}

function bucketFor(code: string, reason: string): ImportFailureCode {
  if (MISSING_PAGE.has(reason)) return "not_found";
  if (reason === "site-refused") return "blocked";
  if (code.includes("failed-precondition")) return "blocked";
  if (code.includes("not-found")) return "no_recipe";
  if (code.includes("deadline-exceeded")) return "timeout";
  if (code.includes("resource-exhausted")) return "rate_limited";
  // site-error, site-unreachable: the same bucket a site's 5xx gets when our own
  // fetch sees it (`failureForVerdict`).
  if (code.includes("unavailable")) return "backend_unavailable";
  return "unknown";
}
