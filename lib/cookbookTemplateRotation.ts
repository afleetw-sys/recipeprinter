import { localStore } from "@/lib/storage";
import type { RecipePrintTemplate } from "@/components/RecipeCardPrint";

// Fresh cookbooks open on a premium theme (unlocked inside the $19.99 book, so
// no paywall — see `themeLocked`), rotating through them so the first view
// looks designed rather than the plain Classic default. The rotation index
// persists in localStorage so each new book lands on the next theme.
export const COOKBOOK_TEMPLATE_ROTATION: RecipePrintTemplate[] = [
  "heirloom",
  "bistro",
  "counter",
  "keepsake",
];
export const COOKBOOK_TEMPLATE_ROTATION_KEY = "recipeprinter:cookbook-template-rotation";

export function nextCookbookTemplate(): RecipePrintTemplate {
  // Through `localStore` rather than `window.localStorage`: the read here was
  // bare, and reading storage THROWS (it does not return null) in Safari
  // private mode and anywhere site data is blocked — which would have taken
  // the whole new-cookbook path down over a cosmetic default. A rotation that
  // never persists just means everyone starts at the same theme.
  if (typeof window === "undefined") return COOKBOOK_TEMPLATE_ROTATION[0];
  const prev = Number(localStore.get(COOKBOOK_TEMPLATE_ROTATION_KEY));
  const next = ((Number.isFinite(prev) ? prev : -1) + 1) % COOKBOOK_TEMPLATE_ROTATION.length;
  localStore.set(COOKBOOK_TEMPLATE_ROTATION_KEY, String(next));
  return COOKBOOK_TEMPLATE_ROTATION[next];
}
