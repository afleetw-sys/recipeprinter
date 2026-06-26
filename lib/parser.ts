"use client";

import { adaptCookPilotRecipe, normalizeImportURL } from "@/lib/cookpilot";
import type { ParseResponse, Recipe } from "@/types/recipe";

interface LocalParseOutcome {
  recipe: Recipe | null;
  error?: string;
  status?: number;
}

// These are the exact callables CookPilot's web app uses (see CookPilot
// `lib/cookpilot/functions.ts`). RecipePrinter calls them directly, same
// backend, no duplicated parser.
async function callCookPilotParser(name: string, data: unknown): Promise<unknown> {
  const [{ httpsCallable }, { getFns }, { ensureParserUser }] = await Promise.all([
    import("firebase/functions"),
    import("@/lib/firebase/functions"),
    import("@/lib/firebase/client"),
  ]);

  await ensureParserUser();
  const callable = httpsCallable(getFns(), name);
  const res = await callable(data);
  return res.data;
}

function friendlyError(err: unknown, fallback: string): Error {
  const message = err instanceof Error ? err.message : String(err);
  // Firebase callables throw FunctionsError with a `.code` like "functions/...".
  const code = (err as { code?: string })?.code ?? "";

  // CookPilot surfaces the source site's HTTP status when a fetch is refused.
  if (/HTTP\s*(401|402|403|429)/.test(message)) {
    return new Error("That site blocked the request. Try a different recipe URL, or paste the recipe text instead.");
  }
  if (/HTTP\s*404/.test(message)) {
    return new Error("That page couldn't be found. Double-check the URL.");
  }
  if (isAuthOrAppCheckError(err)) {
    return new Error(
      "The fallback parser couldn't accept this request. Try a different recipe URL, or paste the recipe text instead.",
    );
  }
  if (code.includes("deadline-exceeded")) {
    return new Error("The parser timed out. Please try again.");
  }
  return new Error(message || fallback);
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

function shouldUseLocalError(local: LocalParseOutcome, fallbackError: unknown): boolean {
  if (!local.error) return false;
  if (isAuthOrAppCheckError(fallbackError)) return true;

  // A precise local fetch/parse result is more useful than a generic callable
  // failure, especially for unsupported pages and HTTP responses.
  return Boolean(local.status && local.status >= 400 && local.status < 500);
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

/** URL import, CookPilot's `parseRecipeFromURL`. */
export async function parseUrl(rawUrl: string): Promise<Recipe> {
  const url = normalizeImportURL(rawUrl);
  const localRecipe = await parseUrlLocally(url);
  if (localRecipe.recipe) return localRecipe.recipe;

  try {
    const data = await callCookPilotParser("parseRecipeFromURL", { url });
    const recipe = adaptCookPilotRecipe(data, url);
    if (!recipe) throw new Error("No recipe could be found at that URL.");
    return recipe;
  } catch (err) {
    if (shouldUseLocalError(localRecipe, err)) {
      throw new Error(localRecipe.error ?? "We couldn't import a recipe from that URL.");
    }
    throw friendlyError(err, "We couldn't import a recipe from that URL.");
  }
}

/** Image import, CookPilot's `parseRecipeFromImages` (expects data-URL strings). */
export async function parseImages(images: string[]): Promise<Recipe> {
  try {
    const data = await callCookPilotParser("parseRecipeFromImages", { images });
    const recipe = adaptCookPilotRecipe(data);
    if (!recipe) throw new Error("No recipe could be read from those photos.");
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
    if (!recipe) throw new Error("No recipe could be read from that text.");
    return recipe;
  } catch (err) {
    throw friendlyError(err, "We couldn't read a recipe from that text.");
  }
}
