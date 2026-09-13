"use client";

import { localStore } from "@/lib/storage";

const KEPT_KEY = "recipeprinter:kept-on-device:v1";

/**
 * Projects the cook deliberately chose to keep on this device.
 *
 * The device shelf (lib/localProjects) catches EVERY project the workspace
 * releases, wanted or not, which is why `listableLocalProjects` refuses to list
 * it: a library that fills itself with every Tuesday's dinner prints is a log
 * rather than a library. That rule is right, and it left one real thing behind.
 *
 * Signed out, "Keep this project?" offers "Keep it on this device", and the
 * shelf is where that lands. But a recipe-card job on the shelf was listed
 * nowhere at all, so the button filed the work somewhere with no door: the
 * cards were on disk and unreachable, and the sentence under the button was
 * true about the bytes and false about everything the cook cared about.
 *
 * A press on that button is a decision, not a by-product, so it is recorded
 * here and the shelf lists what was decided. Everything the shelf merely caught
 * stays unlisted, exactly as before.
 *
 * Device-scoped on purpose (localStorage, not the document): "I want this
 * browser to hold on to this" says nothing about any other browser, and once
 * the project is in an account the account's own list takes over.
 */
interface KeptMap {
  [projectId: string]: { keptAt: number };
}

function kept(): KeptMap {
  return localStore.getJson<KeptMap>(KEPT_KEY) ?? {};
}

export function isProjectKeptOnDevice(projectId: string | undefined): boolean {
  return Boolean(projectId && kept()[projectId]);
}

export function rememberProjectKeptOnDevice(projectId: string): void {
  const map = kept();
  if (map[projectId]) return;
  map[projectId] = { keptAt: Date.now() };
  localStore.setJson(KEPT_KEY, map);
}

/** Drops the mark when the project itself goes, so the map does not outlive the
    shelf it describes. */
export function forgetProjectKeptOnDevice(projectId: string): void {
  const map = kept();
  if (!map[projectId]) return;
  delete map[projectId];
  localStore.setJson(KEPT_KEY, map);
}
