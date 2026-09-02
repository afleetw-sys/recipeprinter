"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import { CookPilotImportSource, prewarmCookPilotImport } from "@/components/CookPilotRecipePicker";
import { PaprikaImportSource } from "@/components/import/PaprikaImportSource";
import { getCachedCookPilotSummaries } from "@/lib/cookpilotRecipes";
import { cachedPaprikaLibrary } from "@/lib/paprikaLibrary";
import type { QueueItem } from "@/types/recipe";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CookPilotLogoIcon,
  ICON_SIZE,
  PaprikaLogoIcon,
} from "@/components/icons";

export { prewarmCookPilotImport };

/**
 * "Recipe apps": the libraries you can bring recipes over from.
 *
 * This replaced a tab that was just CookPilot, and the shape is deliberately an
 * integrations list rather than another row of segments. The two sources have
 * nothing in common at the point of connection — one is an account you sign
 * into, the other is a file you export — and a segmented switch would have had
 * to pretend otherwise. A list can say what each one needs, and what state it
 * is in, in its own words.
 *
 * Recipes from both can go into one print list. Each source keeps its own
 * loaded library in module state (lib/cookpilotRecipes.ts, lib/paprikaLibrary.ts),
 * so moving between them costs nothing and loses nothing, and the ids they
 * produce are namespaced by source so they can never collide.
 */

type SourceId = "cookpilot" | "paprika";

// Which source was last open, so returning to this tab picks up where the cook
// left off instead of making them re-enter it every time. Module-scoped for the
// same reason the libraries themselves are: the panel unmounts on every tab
// change.
let lastOpenSource: SourceId | null = null;

function IntegrationRow({
  name,
  description,
  status,
  addedCount,
  icon,
  onOpen,
}: {
  name: string;
  description: string;
  status: string;
  addedCount: number;
  /** The product's own mark, at whatever size suits it. CookPilot's is a
      transparent glyph that wants room around it; Paprika's is a square app
      icon that fills the tile. Passing a node rather than a component is what
      lets each one arrive as it actually exists. */
  icon: ReactNode;
  onOpen: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Import from ${name}`}
        className="group flex w-full items-center gap-cp-3 rounded-xl border border-line bg-card p-cp-3 text-left transition-colors hover:border-line-strong"
      >
        <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-page grid place-items-center text-ink">
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-cp-2 gap-y-0.5">
            <span className="text-cp-body font-bold leading-snug">{name}</span>
            {addedCount > 0 && (
              <span className="inline-flex items-center rounded-lg bg-[var(--cp-accent-soft)] px-2 py-0.5 text-cp-caption font-bold text-ink">
                {addedCount} added
              </span>
            )}
          </span>
          <span className="mt-0.5 block text-cp-caption text-ink-soft">{description}</span>
          <span className="mt-0.5 block text-cp-caption font-medium text-ink">{status}</span>
        </span>

        <ChevronRightIcon size={ICON_SIZE.lg} className="flex-shrink-0 text-ink-soft" />
      </button>
    </li>
  );
}

export function RecipeAppsPanel({
  items,
  onAddRecipes,
  onRemoveRecipe,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  const [source, setSource] = useState<SourceId | null>(lastOpenSource);
  // Bumped when the open Paprika file changes, so the row below re-reads it.
  const [libraryNonce, setLibraryNonce] = useState(0);
  const { user, ready } = useCookPilotAuth();

  function open(next: SourceId | null) {
    lastOpenSource = next;
    setSource(next);
  }

  const addedCounts = useMemo(() => {
    let cookpilot = 0;
    let paprika = 0;
    for (const item of items) {
      if (item.method === "cookpilot") cookpilot += 1;
      else if (item.method === "paprika") paprika += 1;
    }
    return { cookpilot, paprika };
  }, [items]);

  const cookPilotStatus = !ready
    ? "Checking your account…"
    : user
      ? `Signed in${cookPilotCount(user.uid)}`
      : "Not connected";

  const paprikaLibrary = useMemo(
    () => cachedPaprikaLibrary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libraryNonce, source],
  );
  const paprikaStatus = paprikaLibrary
    ? `${paprikaLibrary.entries.length} ${
        paprikaLibrary.entries.length === 1 ? "recipe" : "recipes"
      } from ${paprikaLibrary.fileName}`
    : "No file yet";

  if (source === "cookpilot" || source === "paprika") {
    return (
      <div className="flex flex-col gap-cp-4">
        <button
          type="button"
          className="btn-ghost btn-compact self-start"
          onClick={() => open(null)}
        >
          <ChevronLeftIcon size={ICON_SIZE.sm} />
          Recipe apps
        </button>

        {source === "cookpilot" ? (
          <CookPilotImportSource
            items={items}
            onAddRecipes={onAddRecipes}
            onRemoveRecipe={onRemoveRecipe}
          />
        ) : (
          <PaprikaImportSource
            items={items}
            onAddRecipes={onAddRecipes}
            onRemoveRecipe={onRemoveRecipe}
            onLibraryChange={() => setLibraryNonce((value) => value + 1)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-cp-4">
      <h3 className="field-label mb-0">Bring recipes from</h3>
      <ul className="flex flex-col gap-cp-2">
        <IntegrationRow
          name="CookPilot"
          description="Your saved CookPilot recipes, ready to print."
          status={cookPilotStatus}
          addedCount={addedCounts.cookpilot}
          icon={<CookPilotLogoIcon size={22} />}
          onOpen={() => open("cookpilot")}
        />
        <IntegrationRow
          name="Paprika"
          description="Export your Paprika library and open the file here."
          status={paprikaStatus}
          addedCount={addedCounts.paprika}
          icon={<PaprikaLogoIcon size={44} />}
          onOpen={() => open("paprika")}
        />
      </ul>
    </div>
  );
}

/** " · 120 recipes" once a library has been loaded this session, nothing
    before that — the row shouldn't fetch just to have a number to show. */
function cookPilotCount(uid: string): string {
  const cached = getCachedCookPilotSummaries(uid);
  if (!cached || cached.length === 0) return "";
  return ` · ${cached.length} ${cached.length === 1 ? "recipe" : "recipes"}`;
}
