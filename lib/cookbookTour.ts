import { localStore } from "@/lib/storage";

/**
 * Set once the cookbook walkthrough has been shown in this browser. It is a
 * first-cookbook thing: someone starting their second book already knows what
 * they get and what it costs (Amelia, 2026-11-17).
 */
const COOKBOOK_TOUR_SEEN_KEY = "recipeprinter:cookbook-tour-seen:v1";

export function cookbookTourSeen(): boolean {
  return localStore.get(COOKBOOK_TOUR_SEEN_KEY) !== null;
}

export function markCookbookTourSeen(): void {
  localStore.set(COOKBOOK_TOUR_SEEN_KEY, "1");
}
