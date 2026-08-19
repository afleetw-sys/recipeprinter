"use client";

import { adaptCookPilotRecipe, adaptCookPilotRecipes, normalizeImportURL } from "@/lib/cookpilot";
import { anonymousOwnerId } from "@/lib/photoStorage";
import type { ImportFailureCode } from "@/lib/analytics";
import type { ParseResponse, Recipe } from "@/types/recipe";

interface LocalParseOutcome {
  recipes: Recipe[] | null;
  error?: string;
  status?: number;
  /** The route already ran CookPilot's full parser and it found nothing — see
      `ParseError.parserExhausted`. */
  parserExhausted?: boolean;
}

/**
 * An import failure that already knows which bucket it belongs in, so the
 * queue can report it to analytics without re-guessing from the message. The
 * message stays user-facing; `code` is for us.
 */
export class ImportError extends Error {
  constructor(
    message: string,
    readonly code: ImportFailureCode = "unknown",
  ) {
    super(message);
    this.name = "ImportError";
  }
}

// A logged-out visitor has no Firebase user, so the CookPilot parser callables
// (which rate-limit per caller) can't key on a uid. We attach the stable
// browser-owned anonymousOwnerId as `rpAnonId` so each visitor gets their own
// server-side quota without a Firebase Auth account ever being created. Signed-in
// callers still authenticate normally — the backend prefers the uid and ignores
// this field. Best-effort: if the id can't be read, we send the payload as-is and
// the backend falls back to its shared public bucket rather than failing.
function withAnonId(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  try {
    return { ...(data as Record<string, unknown>), rpAnonId: anonymousOwnerId() };
  } catch {
    return data;
  }
}

async function callCookPilotParser(name: string, data: unknown): Promise<unknown> {
  const [{ httpsCallable }, { getFns }] = await Promise.all([
    import("firebase/functions"),
    import("@/lib/firebase/functions"),
  ]);

  const callable = httpsCallable(getFns(), name);
  const res = await callable(withAnonId(data));
  return res.data;
}

function friendlyError(err: unknown, fallback: string): ImportError {
  // A failure that already carries a code (e.g. our own "no recipe found")
  // keeps it — don't relabel it as unknown on the way out.
  if (err instanceof ImportError) return err;

  const message = err instanceof Error ? err.message : String(err);
  // Firebase callables throw FunctionsError with a `.code` like "functions/...".
  const code = (err as { code?: string })?.code ?? "";

  // The CookPilot parser callables always throw a Firebase HttpsError with a
  // structured `code` — a far more reliable signal than the free-text message,
  // which varies per callable. Branch on the code FIRST so a real reason (rate
  // limit, bot-wall, no recipe) reaches the cook instead of being flattened
  // into the generic backend/unknown copy by the broad message regex below.

  // Per-caller hourly quota reached (e.g. "Image parsing limit of N per hour").
  // Fundamentally different from a bad input: waiting fixes it, and telling the
  // cook to re-shoot a perfectly good photo is actively wrong.
  if (code.includes("resource-exhausted") && /limit|per hour/i.test(message)) {
    return new ImportError(
      "You've hit the import limit for now. Wait a little while and try again.",
      "rate_limited",
    );
  }
  // Same code, different cause: transcription/extraction ran past the model's
  // output budget. The input was too much to read in one pass, not unreadable.
  if (code.includes("resource-exhausted")) {
    return new ImportError(
      "That was a lot to read at once. Try fewer photos, or one recipe at a time.",
      "too_large",
    );
  }
  // The source page is behind a bot challenge (Cloudflare, etc.) — we'll never
  // fetch it, so steer the cook to the paths that don't fetch.
  if (code.includes("failed-precondition") || /bot challenge/i.test(message)) {
    return new ImportError(
      "This page is protected by a bot check, so we can't read it. Paste the recipe text or upload screenshots instead.",
      "blocked",
    );
  }

  // CookPilot surfaces the source site's HTTP status when a fetch is refused.
  if (/HTTP\s*(401|402|403|429)/.test(message)) {
    return new ImportError(
      "This website wouldn't let us read the recipe. Paste the recipe text or upload screenshots instead.",
      "blocked",
    );
  }
  if (/HTTP\s*404/.test(message)) {
    return new ImportError("We couldn't find that page. Check the link and try again.", "not_found");
  }
  if (isAuthOrAppCheckError(err)) {
    return new ImportError(
      "We couldn't import this link right now. Paste the recipe text or upload screenshots instead.",
      "backend_unavailable",
    );
  }
  if (code.includes("deadline-exceeded")) {
    return new ImportError(
      "That website took too long to respond. Try again, or paste the recipe text instead.",
      "timeout",
    );
  }
  // The parser reached the input and simply found no recipe in it — the honest
  // "nothing to import" case. Keep the source-specific fallback copy (it tells
  // the cook what a good input looks like) but bucket it as no_recipe instead
  // of letting it drop through to `unknown`, so the dashboards count it right.
  // `unavailable` only counts here when its message is a no-recipe one (images
  // report "No readable recipe text found"); a bare fetch failure stays below.
  if (
    code.includes("not-found") ||
    (code.includes("unavailable") && /no (readable )?recipe|recipe (text|content)/i.test(message))
  ) {
    return new ImportError(fallback, "no_recipe");
  }
  if (/firebase|functions\/|app check|appcheck|auth\/|permission-denied|internal|stack|api key/i.test(message)) {
    return new ImportError(fallback, "backend_unavailable");
  }
  // Provider exceptions may contain function names, status codes, or setup
  // details. Keep those in the logged exception; only approved copy reaches
  // the recipe queue.
  return new ImportError(fallback, "unknown");
}

function isAuthOrAppCheckError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string })?.code ?? "";
  return (
    code.includes("unauthenticated") ||
    code.includes("permission-denied") ||
    code.includes("app-check") ||
    code.includes("auth/") ||
    /app check|appcheck|auth\/|firebase isn't configured/i.test(message)
  );
}

async function parseUrlLocally(url: string): Promise<LocalParseOutcome> {
  try {
    const response = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = (await response.json()) as ParseResponse;
    if (data.success) return { recipes: data.recipes };
    return {
      recipes: null,
      error: data.error,
      status: response.status,
      parserExhausted: data.parserExhausted,
    };
  } catch {
    /* Fall back to CookPilot's callable parser below. */
  }
  return { recipes: null };
}

function shouldTryUrlFallback(outcome: LocalParseOutcome): boolean {
  if (outcome.recipes && outcome.recipes.length > 0) return false;
  // The route already put this URL through CookPilot's full parser and it came
  // back empty. The fallback below is that same parser reached through its own
  // callable, so re-running it can only reproduce the same answer — at the cost
  // of a second wait (the server attempt alone allows 55s) and a second parse.
  // Only the *reasons the answer might differ* are worth a retry, which is what
  // the two cases below are: never-consulted, or inconclusive.
  if (outcome.parserExhausted) return false;
  if (outcome.status === undefined) return true;
  return ![400, 413].includes(outcome.status);
}

async function parseUrlWithCookPilot(url: string, localError?: string): Promise<Recipe[]> {
  try {
    // `multiRecipe` opts into roundup handling: CookPilot returns every recipe it
    // finds ({ recipes: [...] }) instead of only the single main one. A normal page
    // simply comes back as one, so `adaptCookPilotRecipes` always yields ≥1 here.
    const data = await callCookPilotParser("parseRecipeFromURL", { url, multiRecipe: true });
    const recipes = adaptCookPilotRecipes(data, url);
    if (recipes.length === 0) {
      throw new ImportError(
        localError ||
          "We couldn't find a complete recipe on that page. Try another link or paste the recipe text instead.",
        "no_recipe",
      );
    }
    return recipes;
  } catch (err) {
    throw friendlyError(
      err,
      localError ||
        "We couldn't import that recipe. Try the link again, paste the recipe text, or upload screenshots.",
    );
  }
}

/**
 * The analytics bucket for a route failure we are NOT retrying through
 * CookPilot. When every non-retried case was a 400/413 this could be a single
 * inline ternary, but suppressing the duplicate parse (see
 * `shouldTryUrlFallback`) means a blocked/404/timeout answer can now end here
 * instead of being categorized by `friendlyError` on the way out of the
 * fallback. Mirrors that function's status mapping deliberately, so which of
 * the two paths a failure took never changes the bucket it lands in — the
 * vocabulary is a closed map precisely so it stays comparable.
 */
function categoryForRouteStatus(status: number | undefined): ImportFailureCode {
  if (status === 413) return "too_large";
  if (status === 404) return "not_found";
  if (status === 401 || status === 402 || status === 403 || status === 429) return "blocked";
  if (status === 504) return "timeout";
  if (status !== undefined && status >= 500) return "backend_unavailable";
  return "no_recipe";
}

/**
 * URL import, CookPilot's `parseRecipeFromURL`. Returns one or more recipes: a
 * normal page yields exactly one, a "roundup" URL (e.g. "5 best borscht recipes")
 * yields several. Never resolves to an empty array — it throws `ImportError`
 * instead so the queue can report the failure.
 */
export async function parseUrlAll(rawUrl: string): Promise<Recipe[]> {
  const url = normalizeImportURL(rawUrl);
  const local = await parseUrlLocally(url);
  if (local.recipes && local.recipes.length > 0) return local.recipes;
  if (shouldTryUrlFallback(local)) {
    return parseUrlWithCookPilot(url, local.error);
  }
  throw new ImportError(
    local.error ??
      "We couldn't find a complete recipe on that page. Try another link or paste the recipe text instead.",
    categoryForRouteStatus(local.status),
  );
}

/** Image import, CookPilot's `parseRecipeFromImages` (expects data-URL strings). */
export async function parseImages(images: string[]): Promise<Recipe> {
  try {
    const data = await callCookPilotParser("parseRecipeFromImages", { images });
    const recipe = adaptCookPilotRecipe(data);
    if (!recipe) {
      throw new ImportError(
        "We couldn't find a recipe in those photos. Make sure the whole recipe — title, ingredients, and steps — is in the shot and in focus, and add one recipe at a time.",
        "no_recipe",
      );
    }
    return recipe;
  } catch (err) {
    throw friendlyError(
      err,
      "We couldn't read a complete recipe from those photos. Make sure the title, ingredients, and directions are visible.",
    );
  }
}

/** Pasted-text import, CookPilot's `parseSocialRecipe` (free text as caption). */
export async function parseText(text: string): Promise<Recipe> {
  try {
    const data = await callCookPilotParser("parseSocialRecipe", {
      platform: "other",
      caption: text,
      transcript: text,
    });
    const recipe = adaptCookPilotRecipe(data);
    if (!recipe) {
      throw new ImportError(
        "We couldn't find a complete recipe in that text. Include the title, ingredients, and directions.",
        "no_recipe",
      );
    }
    return recipe;
  } catch (err) {
    throw friendlyError(
      err,
      "We couldn't read that recipe text. Check that it includes the title, ingredients, and directions.",
    );
  }
}
