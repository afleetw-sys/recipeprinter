"use client";

import { useSyncExternalStore } from "react";
import { isBlackFridayLive } from "@/lib/blackFriday";

const noSubscription = () => () => {};

/**
 * Whether the sale (lib/blackFriday.ts) is on, for things React renders.
 * False on the server and during hydration, so server HTML (which may have
 * been built on another day) never disagrees with the browser's first render;
 * true right after, in the browser, while the sale runs. Visible text that
 * must not flicker uses the `rp-sale-only` / `rp-sale-hide` classes instead,
 * which the layout's inline script switches before first paint.
 */
export function useSaleLive(): boolean {
  return useSyncExternalStore(noSubscription, () => isBlackFridayLive(), () => false);
}
