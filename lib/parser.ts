"use client";

import { httpsCallable, type HttpsCallableResult } from "firebase/functions";
import { functions } from "@/lib/firebase/functions";
import { ensureAnonymousUser } from "@/lib/firebase/client";
import { adaptCookPilotRecipe, normalizeImportURL } from "@/lib/cookpilot";
import type { Recipe } from "@/types/recipe";

// These are the exact callables CookPilot's web app uses (see CookPilot
// `lib/cookpilot/functions.ts`). RecipePrinter calls them directly — same
// backend, no duplicated parser.
const parseRecipeFromURLCallable = httpsCallable(functions, "parseRecipeFromURL");
const parseRecipeFromImagesCallable = httpsCallable(functions, "parseRecipeFromImages");
const parseSocialRecipeCallable = httpsCallable(functions, "parseSocialRecipe");

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

/** URL import — CookPilot's `parseRecipeFromURL`. */
export async function parseUrl(rawUrl: string): Promise<Recipe> {
  const url = normalizeImportURL(rawUrl);
  try {
    await ensureAnonymousUser();
    const res = (await parseRecipeFromURLCallable({ url })) as HttpsCallableResult;
    const recipe = adaptCookPilotRecipe(res.data, url);
    if (!recipe) throw new Error("No recipe could be found at that URL.");
    return recipe;
  } catch (err) {
    throw friendlyError(err, "We couldn't import a recipe from that URL.");
  }
}

/** Image import — CookPilot's `parseRecipeFromImages` (expects data-URL strings). */
export async function parseImages(images: string[]): Promise<Recipe> {
  try {
    await ensureAnonymousUser();
    const res = (await parseRecipeFromImagesCallable({ images })) as HttpsCallableResult;
    const recipe = adaptCookPilotRecipe(res.data);
    if (!recipe) throw new Error("No recipe could be read from those photos.");
    return recipe;
  } catch (err) {
    throw friendlyError(err, "We couldn't read a recipe from those photos.");
  }
}

/** Pasted-text import — CookPilot's `parseSocialRecipe` (free text as caption). */
export async function parseText(text: string): Promise<Recipe> {
  try {
    await ensureAnonymousUser();
    const res = (await parseSocialRecipeCallable({
      platform: "other",
      caption: text,
      transcript: text,
    })) as HttpsCallableResult;
    const recipe = adaptCookPilotRecipe(res.data);
    if (!recipe) throw new Error("No recipe could be read from that text.");
    return recipe;
  } catch (err) {
    throw friendlyError(err, "We couldn't read a recipe from that text.");
  }
}
