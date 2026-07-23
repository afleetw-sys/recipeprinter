"use client";

import { adaptCookPilotRecipe, normalizeImportURL } from "@/lib/cookpilot";
import type { ImportFailureCode } from "@/lib/analytics";
import type { ParseResponse, Recipe } from "@/types/recipe";

interface LocalParseOutcome {
  recipe: Recipe | null;
  error?: string;
  status?: number;
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

async function callCookPilotParser(name: string, data: unknown): Promise<unknown> {
  const [{ httpsCallable }, { getFns }] = await Promise.all([
    import("firebase/functions"),
    import("@/lib/firebase/functions"),
  ]);

  const callable = httpsCallable(getFns(), name);
  const res = await callable(data);
  return res.data;
}

function friendlyError(err: unknown, fallback: string): ImportError {
  // A failure that already carries a code (e.g. our own "no recipe found")
  // keeps it — don't relabel it as unknown on the way out.
  if (err instanceof ImportError) return err;

  const message = err instanceof Error ? err.message : String(err);
  // Firebase callables throw FunctionsError with a `.code` like "functions/...".
  const code = (err as { code?: string })?.code ?? "";

  // CookPilot surfaces the source site's HTTP status when a fetch is refused.
  if (/HTTP\s*(401|402|403|429)/.test(message)) {
    return new ImportError(
      "That site blocked the request. Try a different recipe URL, or paste the recipe text instead.",
      "blocked",
    );
  }
  if (/HTTP\s*404/.test(message)) {
    return new ImportError("That page couldn't be found. Double-check the URL.", "not_found");
  }
  if (isAuthOrAppCheckError(err)) {
    return new ImportError(
      "The fallback parser couldn't accept this request. Try a different recipe URL, or paste the recipe text instead.",
      "backend_unavailable",
    );
  }
  if (code.includes("deadline-exceeded")) {
    return new ImportError("The parser timed out. Please try again.", "timeout");
  }
  if (/firebase|functions\/|app check|appcheck|auth\/|permission-denied|internal|stack|api key/i.test(message)) {
    return new ImportError(fallback, "backend_unavailable");
  }
  return new ImportError(message || fallback, "unknown");
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
    if (data.success) return { recipe: data.recipe };
    return { recipe: null, error: data.error, status: response.status };
  } catch {
    /* Fall back to CookPilot's callable parser below. */
  }
  return { recipe: null };
}

function shouldTryUrlFallback(outcome: LocalParseOutcome): boolean {
  if (outcome.recipe) return false;
  if (outcome.status === undefined) return true;
  return ![400, 413].includes(outcome.status);
}

async function parseUrlWithCookPilot(url: string, localError?: string): Promise<Recipe> {
  try {
    const data = await callCookPilotParser("parseRecipeFromURL", { url });
    const recipe = adaptCookPilotRecipe(data, url);
    if (!recipe) throw new ImportError(localError || "No recipe could be found on that page.", "no_recipe");
    return recipe;
  } catch (err) {
    throw friendlyError(err, localError || "We couldn't import a recipe from that URL.");
  }
}

/** URL import, CookPilot's `parseRecipeFromURL`. */
export async function parseUrl(rawUrl: string): Promise<Recipe> {
  const url = normalizeImportURL(rawUrl);
  const localRecipe = await parseUrlLocally(url);
  if (localRecipe.recipe) return localRecipe.recipe;
  if (shouldTryUrlFallback(localRecipe)) {
    return parseUrlWithCookPilot(url, localRecipe.error);
  }
  throw new ImportError(
    localRecipe.error ?? "We couldn't import a recipe from that URL.",
    localRecipe.status === 413 ? "too_large" : "no_recipe",
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
    throw friendlyError(err, "We couldn't read a recipe from those photos.");
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
    if (!recipe) throw new ImportError("No recipe could be read from that text.", "no_recipe");
    return recipe;
  } catch (err) {
    throw friendlyError(err, "We couldn't read a recipe from that text.");
  }
}
