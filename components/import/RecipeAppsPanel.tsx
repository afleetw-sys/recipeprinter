"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import { CookPilotImportSource, prewarmCookPilotImport } from "@/components/CookPilotRecipePicker";
import {
  PAPRIKA_ACCEPT,
  PaprikaImportSource,
} from "@/components/import/PaprikaImportSource";
import {
  getCachedCookPilotTotal,
  loadCookPilotRecipeTotal,
} from "@/lib/cookpilotRecipes";
import { cachedPaprikaLibrary } from "@/lib/paprikaLibrary";
import type { QueueItem } from "@/types/recipe";
import {
  ChevronLeftIcon,
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

function IntegrationCard({
  name,
  description,
  status,
  note,
  addedCount,
  icon,
  action,
  onOpen,
  secondaryAction,
  onSecondary,
}: {
  name: string;
  description: string;
  /** A short state worth knowing, as a chip. Omitted when there is nothing
      true to say: Paprika used to read "No file yet", which is not a state so
      much as the absence of one, and every visitor saw it forever. */
  status?: string;
  /** A passing state that is not worth a chip, like a check in flight. */
  note?: string;
  addedCount: number;
  /** The product's own mark, at whatever size suits it. CookPilot's is a
      transparent glyph that wants room around it; Paprika's is a square app
      icon. Passing a node rather than a component is what lets each one arrive
      as it actually exists. */
  icon: ReactNode;
  /** What pressing the button does, in its own words. Deliberately not one
      shared verb: you sign into CookPilot and you open a file from Paprika,
      and "Connect" describes neither of those honestly. */
  action: string;
  onOpen: () => void;
  /** A quieter second way in. Paprika's main button opens the file dialog
      now, which leaves nothing pointing at the export instructions; this is
      what still points at them. */
  secondaryAction?: string;
  onSecondary?: () => void;
}) {
  return (
    <li className="flex flex-col gap-cp-3 rounded-xl border border-line bg-card p-cp-3">
      {/* Mark, then the words, then the action: the order you read the card
          in, so the button arrives once you know what it will do. The card
          used to be one wide button with a chevron; the button is a real
          control of its own now, which is why nothing outside it is clickable
          — a button inside a button is not something a screen reader or a
          keyboard can make sense of. */}
      <span className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl bg-page grid place-items-center text-ink">
        {icon}
      </span>

      <div className="min-w-0">
        {/* Chips take the shared `rounded-lg`, the radius every other chip in
            the product uses, rather than a pill. */}
        <div className="flex flex-wrap items-center gap-x-cp-2 gap-y-0.5">
          <span className="text-cp-body font-bold leading-snug">{name}</span>
          {status && (
            <span className="inline-flex items-center rounded-lg bg-[var(--cp-accent-soft)] px-2 py-0.5 text-cp-caption font-bold text-ink">
              {status}
            </span>
          )}
          {addedCount > 0 && (
            <span className="inline-flex items-center rounded-lg bg-[var(--cp-accent-soft)] px-2 py-0.5 text-cp-caption font-bold text-ink">
              {addedCount} added
            </span>
          )}
        </div>
        <p className="mt-0.5 text-cp-caption text-ink-soft">{description}</p>
        {note && <p className="mt-0.5 text-cp-caption text-ink-soft">{note}</p>}
      </div>

      {/* `mt-auto` so the two buttons sit on one line when the descriptions
          wrap to different heights, which they do at most widths. */}
      <div className="mt-auto flex flex-wrap items-center gap-cp-3">
        <button
          type="button"
          onClick={onOpen}
          // Opens with the product's name, and keeps the visible words inside
          // the accessible name so voice control can say what it reads.
          aria-label={`${action} from ${name}`}
          className="btn btn-secondary btn-compact"
        >
          {action}
        </button>
        {secondaryAction && onSecondary && (
          <button
            type="button"
            onClick={onSecondary}
            className="text-cp-caption font-semibold text-ink-soft hover:text-ink transition-colors"
          >
            {secondaryAction}
          </button>
        )}
      </div>
    </li>
  );
}

export function RecipeAppsPanel({
  items,
  onAddRecipes,
  commitLabel,
  commitLeavesPage = false,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  /** What the surrounding panel's submit button says — see ImportPanel. */
  commitLabel: string;
  /** And whether pressing it navigates, which decides its icon. */
  commitLeavesPage?: boolean;
}) {
  const [source, setSource] = useState<SourceId | null>(lastOpenSource);
  // Paprika holds ONE library at a time, so there is nothing to choose between
  // on this screen: the button opens the system file dialog and the next
  // screen is the recipes in the file you picked. It used to take you to a
  // page whose only content was a second button saying the same thing.
  const paprikaInputRef = useRef<HTMLInputElement>(null);
  const [paprikaFile, setPaprikaFile] = useState<File | null>(null);
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

  // ── How many recipes CookPilot holds ──────────────────────────────────
  // The LIBRARY total, from the server-side aggregation, not a tally of what
  // has been paged in. This chip used to count the loaded summaries, which is
  // one page: it read "30 recipes" for a library of 65 and only corrected
  // itself once you went in and scrolled to the end.
  //
  // `getCountFromServer` counts in Firestore and returns a number without
  // reading the documents, so asking for it here costs a single aggregation
  // query rather than the library.
  const [cookPilotTotal, setCookPilotTotal] = useState<number | null>(() =>
    user ? getCachedCookPilotTotal(user.uid) : null,
  );
  useEffect(() => {
    if (!ready || !user) return;
    let live = true;
    loadCookPilotRecipeTotal(user.uid).then((total) => {
      if (live) setCookPilotTotal(total);
    });
    return () => {
      live = false;
    };
  }, [ready, user]);

  // A chip only when there is something to report. Not being signed in is the
  // starting state for everybody, and "Not connected" spent a chip saying so
  // on every first visit; the button already says what to do about it.
  //
  // The count joins the chip only once it is known. A number that appears a
  // moment later is fine; a wrong one that corrects itself is not.
  const cookPilotStatus = ready && user
    ? cookPilotTotal === null
      ? "Signed in"
      : `Signed in · ${cookPilotTotal} ${cookPilotTotal === 1 ? "recipe" : "recipes"}`
    : undefined;
  const cookPilotNote = ready ? undefined : "Checking your account…";

  const paprikaLibrary = useMemo(
    () => cachedPaprikaLibrary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [libraryNonce, source],
  );
  // Nothing at all until a file is open. The filename stays out of the chip:
  // an export is named by the app, not by the cook, and a chip is no place for
  // "Export 2026-09-01 11.12.03 All Recipes.paprikarecipes".
  const paprikaStatus = paprikaLibrary
    ? `${paprikaLibrary.entries.length} ${
        paprikaLibrary.entries.length === 1 ? "recipe" : "recipes"
      } loaded`
    : undefined;

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
            commitLabel={commitLabel}
            commitLeavesPage={commitLeavesPage}
          />
        ) : (
          <PaprikaImportSource
            initialFile={paprikaFile}
            items={items}
            onAddRecipes={onAddRecipes}
            commitLabel={commitLabel}
            commitLeavesPage={commitLeavesPage}
            onLibraryChange={() => setLibraryNonce((value) => value + 1)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-cp-4">
      <h3 className="field-label mb-0">Bring recipes from</h3>
      {/* Side by side, and stacked on a phone where two of these would be too
          narrow to read. */}
      <ul className="grid gap-cp-2 sm:grid-cols-2">
        <IntegrationCard
          name="CookPilot"
          description="Sign in and your saved recipes come straight across."
          status={cookPilotStatus}
          note={cookPilotNote}
          addedCount={addedCounts.cookpilot}
          icon={<CookPilotLogoIcon size={22} />}
          action="Choose recipes"
          onOpen={() => open("cookpilot")}
        />
        <IntegrationCard
          name="Paprika"
          description="Export your library from Paprika, then open that file here."
          status={paprikaStatus}
          addedCount={addedCounts.paprika}
          // Inset in the 44px tile like CookPilot's, rather than filling it.
          // Smaller than CookPilot's 22 rather than equal to it: that mark is
          // an open glyph on nothing, this is a solid app icon, so matching
          // their box sizes would not have matched their weight.
          icon={<PaprikaLogoIcon size={26} />}
          action="Open file"
          onOpen={() => paprikaInputRef.current?.click()}
          // The export steps used to live on the screen the button reached.
          // They still exist there, so this is what still reaches them, and it
          // is also the way in for someone who has no file yet.
          secondaryAction="Where do I find that file?"
          onSecondary={() => open("paprika")}
        />
      </ul>

      {/* Outside the list so a re-render of the cards cannot remount it
          mid-dialog. Cancelling picks nothing and goes nowhere, which is the
          right answer to a cancelled file dialog. */}
      <input
        ref={paprikaInputRef}
        type="file"
        accept={PAPRIKA_ACCEPT}
        className="sr-only absolute h-px w-px overflow-hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset first: choosing the SAME file again has to fire onChange, or
          // a retry after a failed read looks like nothing happened.
          event.target.value = "";
          if (!file) return;
          setPaprikaFile(file);
          open("paprika");
        }}
      />
    </div>
  );
}

/** " · 120 recipes" once a library has been loaded this session, nothing
    before that — the row shouldn't fetch just to have a number to show. */

