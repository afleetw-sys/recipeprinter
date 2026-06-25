"use client";

import { adaptCookPilotRecipe, normalizeImportURL } from "@/lib/cookpilot";
import type { ParseResponse, Recipe } from "@/types/recipe";

// These are the exact callables CookPilot's web app uses (see CookPilot
// `lib/cookpilot/functions.ts`). RecipePrinter calls them directly — same
// backend, no duplicated parser.
async function callCookPilotParser(name: string, data: unknown): Promise<unknown> {
  const [{ httpsCallable }, { functions }, { ensureAnonymousUser }] = await Promise.all([
    import("firebase/functions"),
    import("@/lib/firebase/functions"),
    import("@/lib/firebase/client"),
  ]);

  await ensureAnonymousUser();
  const callable = httpsCallable(functions, name);
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
  if (code.includes("unauthenticated") || code.includes("permission-denied")) {
    return new Error("CookPilot rejected the request (auth/App Check). Check the dev token.");
  }
  if (code.includes("deadline-exceeded")) {
    return new Error("The parser timed out. Please try again.");
  }
  return new Error(message || fallback);
}

async function parseUrlLocally(url: string): Promise<Recipe | null> {
  try {
    const response = await fetch("/api/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    const data = (await response.json()) as ParseResponse;
    if (data.success) return data.recipe;
  } catch {
    /* Fall back to CookPilot's callable parser below. */
  }
  return null;
}

/** URL import — CookPilot's `parseRecipeFromURL`. */
export async function parseUrl(rawUrl: string): Promise<Recipe> {
  const url = normalizeImportURL(rawUrl);
  const localRecipe = await parseUrlLocally(url);
  if (localRecipe) return localRecipe;

  try {
    const data = await callCookPilotParser("parseRecipeFromURL", { url });
    const recipe = adaptCookPilotRecipe(data, url);
    if (!recipe) throw new Error("No recipe could be found at that URL.");
    return recipe;
  } catch (err) {
    throw friendlyError(err, "We couldn't import a recipe from that URL.");
  }
}

/** Image import — CookPilot's `parseRecipeFromImages` (expects data-URL strings). */
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

/** Pasted-text import — CookPilot's `parseSocialRecipe` (free text as caption). */
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
