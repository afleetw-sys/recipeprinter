"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useCookPilotAuth } from "@/components/CookPilotAuth";
import { CookPilotImportSource, prewarmCookPilotImport } from "@/components/CookPilotRecipePicker";
import {
  PAPRIKA_ACCEPT,
  PaprikaImportSource,
  readPaprikaExport,
} from "@/components/import/PaprikaImportSource";
import {
  getCachedCookPilotTotal,
  loadCookPilotRecipeTotal,
} from "@/lib/cookpilotRecipes";
import { cachedPaprikaLibrary } from "@/lib/paprikaLibrary";
import { useSingleRecipeOnly } from "@/lib/useSingleRecipeOnly";
import { useStandaloneProUpgrade } from "@/lib/useStandaloneProUpgrade";
import { Dialog } from "@/components/Dialog";
import type { QueueItem } from "@/types/recipe";
import {
  ChevronLeftIcon,
  CookPilotLogoIcon,
  ICON_SIZE,
  InfoIcon,
  PaprikaLogoIcon,
  SpinnerIcon,
} from "@/components/icons";

const COOKPILOT_SITE_URL = "https://cookpilotapp.com/";

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
  help,
  helpLabel,
  helpOpen = false,
  onToggleHelp,
  error,
  busy = false,
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
  /** An explainer folded into the card, opened by the ⓘ beside the action.
      Paprika's export steps used to live on the screen the button reached;
      there is no such screen any more, so they live here. */
  help?: ReactNode;
  helpLabel?: string;
  helpOpen?: boolean;
  onToggleHelp?: () => void;
  /** Shown under the action, where the thing that failed was started. */
  error?: string | null;
  /** Whether the action is mid-flight. */
  busy?: boolean;
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
      <div className="mt-auto flex flex-col gap-cp-2">
        {/* The how-to sits ABOVE the action: you read how to get the file
            before you are asked to open it, and the action then lands on the
            same line as the buttons on cards with no how-to. */}
        <div className="flex flex-col items-start gap-cp-2">
          {help && onToggleHelp && (
            /* The icon sits BESIDE the words, not instead of them. On its own
               an ⓘ is a guess; with the label it is a signpost, and the label
               on its own read as a second action equal to the button. */
            <button
              type="button"
              onClick={onToggleHelp}
              aria-haspopup="dialog"
              className="btn-ghost btn-compact"
            >
              <InfoIcon size={ICON_SIZE.md} />
              {helpLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            disabled={busy}
            // Opens with the product's name, and keeps the visible words inside
            // the accessible name so voice control can say what it reads.
            aria-label={`${action} from ${name}`}
            className="btn btn-secondary btn-compact"
          >
            {busy && <SpinnerIcon size={ICON_SIZE.sm} />}
            {action}
          </button>
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Over the page, not a step on the way to it. These are instructions
          for something you do in ANOTHER app, so they should hand the page
          back exactly as they found it rather than navigating anywhere. */}
      {help && onToggleHelp && (
        <Dialog
          open={helpOpen}
          onClose={onToggleHelp}
          portal
          dismissOnBackdropClick
          labelledBy={`${name}-help-title`}
          className="fixed inset-0 z-[var(--z-dialog)] grid place-items-center dialog-scrim p-cp-4"
          panelClassName="relative w-full max-w-md rounded-2xl border border-line bg-card p-cp-6 shadow-cp-lg"
        >
          <h2
            id={`${name}-help-title`}
            className="text-cp-dialog-title font-extrabold tracking-[-0.02em]"
          >
            {helpLabel}
          </h2>
          <div className="mt-cp-4">{help}</div>
          <button
            type="button"
            onClick={onToggleHelp}
            className="btn btn-secondary btn-compact mt-cp-5"
          >
            Got it
          </button>
        </Dialog>
      )}
    </li>
  );
}

export function RecipeAppsPanel({
  items,
  onAddRecipes,
  commitLabel,
  commitLeavesPage = false,
  onCommitEmpty,
  reselects = 0,
  locked = false,
  singleSelect,
  onLockedTap,
}: {
  items: QueueItem[];
  onAddRecipes: (recipes: QueueItem[]) => number;
  /** What the surrounding panel's submit button says — see ImportPanel. */
  commitLabel: string;
  /** And whether pressing it navigates, which decides its icon. */
  commitLeavesPage?: boolean;
  onCommitEmpty?: () => void;
  /** Bumped when the Recipe apps tab is pressed while already on it. Closes
      the open library and shows the sources again. */
  reselects?: number;
  /** See `RecipeSourceList`'s own `locked` doc — passed straight through to
      whichever source is open. Only /print's rail can ever reach this
      (recipeCount only exceeds one there — see `openAddRecipeBelow`), so the
      homepage front door never needs its own answer the way `singleSelect`
      below does. */
  locked?: boolean;
  /** See `PaprikaImportSource`'s own `singleSelect` doc. Left `undefined`
      rather than defaulted to `false`: /print already knows its own
      entitlement precisely (mirror-fallback and all — see `computeProLocks`)
      and always passes a real boolean, which wins outright. The homepage
      front door deliberately stays free of Firebase/RevenueCat itself (see
      PrinterWorkspace.tsx's own comment), so when it leaves this unset,
      `useSingleRecipeOnly` fills in for it. */
  singleSelect?: boolean;
  /** Opens the Pro upgrade dialog — only ever called while `locked`. */
  onLockedTap?: () => void;
}) {
  const [source, setSource] = useState<SourceId | null>(lastOpenSource);
  // Paprika holds ONE library at a time, so there is nothing to choose between
  // on this screen: the button opens the system file dialog and the next
  // screen is the recipes in the file you picked. It used to take you to a
  // page whose only content was a second button saying the same thing.
  const paprikaInputRef = useRef<HTMLInputElement>(null);
  const [paprikaReading, setPaprikaReading] = useState(false);
  const [paprikaError, setPaprikaError] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // Skips the first run: the count arrives as 0 on mount, and reacting to that
  // would throw away the source `lastOpenSource` had just restored.
  const seenReselects = useRef(reselects);
  useEffect(() => {
    if (seenReselects.current === reselects) return;
    seenReselects.current = reselects;
    setSource(null);
    lastOpenSource = null;
  }, [reselects]);
  // Bumped when the open Paprika file changes, so the row below re-reads it.
  const [libraryNonce, setLibraryNonce] = useState(0);
  const { user, ready } = useCookPilotAuth();
  // /print hands in its own handler, tied to the print job it would resume. On
  // every other page "upgrade to Pro" opens the same dialog right here, rather
  // than sending the cook off to /account to find it.
  const { openProUpgrade, proUpgradeDialog, proMessage, proJustActivated } =
    useStandaloneProUpgrade("recipe_apps_upgrade");
  const onUpgradeTap = onLockedTap ?? openProUpgrade;

  // Fallback answer for `singleSelect`, used only when the caller didn't
  // supply one (see the prop's own doc comment) — see the hook's own doc for
  // why this can't just live here: this isn't the only direct renderer of
  // these sources any more.
  const selfCheckedSingleRecipeOnly = useSingleRecipeOnly();
  const effectiveSingleSelect = singleSelect ?? (selfCheckedSingleRecipeOnly && !proJustActivated);

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
  // The chip is the library, never the account. It used to read "Signed in",
  // and someone who had only ever signed in to RecipePrinter took that as a
  // claim they had signed in to a second app. One account covers both, so the
  // sign-in is not news here; how many recipes are waiting over there is. No
  // chip until the count is known, and none at zero.
  const cookPilotStatus = ready && user && cookPilotTotal
    ? `${cookPilotTotal} ${cookPilotTotal === 1 ? "recipe" : "recipes"}`
    : undefined;
  const cookPilotNote = ready ? undefined : "Checking your account…";
  // Signed in with nothing in CookPilot is where most RecipePrinter-first
  // accounts start. The picker would open on an empty list, so the card points
  // at the app instead.
  const cookPilotEmpty = Boolean(ready && user && cookPilotTotal === 0);
  const cookPilotDescription = !user
    ? "Sign in and your saved recipes come straight across."
    : cookPilotEmpty
      ? "Your RecipePrinter account works in CookPilot too. Recipes you save there will show up here."
      : "Your RecipePrinter account works in CookPilot too, so your saved recipes are ready to bring across.";

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

  // Rendered by BOTH branches. It used to live only with the cards, so
  // "Change" from inside an open library called `click()` on a ref pointing at
  // nothing and the button did nothing at all.
  // Cancelling the dialog picks nothing and goes nowhere, which is the right
  // answer to a cancelled file dialog.
  const paprikaFileInput = (
    <input
          ref={paprikaInputRef}
          type="file"
          accept={PAPRIKA_ACCEPT}
          className="sr-only absolute h-px w-px overflow-hidden"
          tabIndex={-1}
          aria-hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            // Reset first: choosing the SAME file again has to fire onChange, or
            // a retry after a failed read looks like nothing happened.
            event.target.value = "";
            if (!file) return;
            setPaprikaError(null);
            setPaprikaReading(true);
            const result = await readPaprikaExport(file);
            setPaprikaReading(false);
            if (!result.ok) {
              // Stays on the card. A file that will not read has nothing to show
              // on the next screen, and sending someone there to read the reason
              // puts the message a page away from the button that retries it.
              setPaprikaError(result.message);
              return;
            }
            setLibraryNonce((value) => value + 1);
            open("paprika");
          }}
        />
  );

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
            onCommitEmpty={onCommitEmpty}
            locked={locked}
            singleSelect={effectiveSingleSelect}
            onLockedTap={onUpgradeTap}
          />
        ) : (
          <PaprikaImportSource
            // Remounts when a new file is read, which is what clears the
            // selection made against the old one.
            key={libraryNonce}
            onChooseAnotherFile={() => paprikaInputRef.current?.click()}
            // A replacement chosen from in here fails in here. The card is not
            // on screen to carry the message.
            replaceError={paprikaError}
            items={items}
            onAddRecipes={onAddRecipes}
            commitLabel={commitLabel}
            commitLeavesPage={commitLeavesPage}
            onCommitEmpty={onCommitEmpty}
            onLibraryChange={() => setLibraryNonce((value) => value + 1)}
            locked={locked}
            singleSelect={effectiveSingleSelect}
            onLockedTap={onUpgradeTap}
          />
        )}
        {paprikaFileInput}
        {proMessage && (
          <p className="text-cp-caption text-ink-soft" role="status">
            {proMessage}
          </p>
        )}
        {proUpgradeDialog}
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
          description={cookPilotDescription}
          status={cookPilotStatus}
          note={cookPilotNote}
          addedCount={addedCounts.cookpilot}
          icon={<CookPilotLogoIcon size={22} />}
          // Pressing this while signed out lands on a sign-in screen, not a
          // recipe list (see CookPilotImportSource's `!user` branch) — the
          // button has to say so rather than promise the wrong next screen.
          action={!user ? "Sign in" : cookPilotEmpty ? "Get CookPilot" : "Choose recipes"}
          onOpen={
            cookPilotEmpty
              ? () => window.open(COOKPILOT_SITE_URL, "_blank", "noopener,noreferrer")
              : () => open("cookpilot")
          }
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
          // What the button says depends on whether there is a library open.
          // The file is cached between visits, so "Open file" was asking for
          // one that had already been given: picking again was the only route
          // back to recipes that were sitting there the whole time.
          action={paprikaLibrary ? "Choose recipes" : "Open file"}
          onOpen={
            paprikaLibrary
              ? () => open("paprika")
              : () => paprikaInputRef.current?.click()
          }
          busy={paprikaReading}
          error={paprikaError}
          helpLabel="How to export"
          helpOpen={helpOpen}
          onToggleHelp={() => setHelpOpen((value) => !value)}
          help={
            <ol className="paprika-export-steps text-cp-caption text-ink-soft">
              <li>Open the Paprika app.</li>
              <li>Click the menu in the top left.</li>
              <li>Go to Settings.</li>
              <li>Click Export Recipes, then Export.</li>
            </ol>
          }
        />
      </ul>
      {paprikaFileInput}
      {proMessage && (
        <p className="text-cp-caption text-ink-soft" role="status">
          {proMessage}
        </p>
      )}
      {proUpgradeDialog}
    </div>
  );
}

/** " · 120 recipes" once a library has been loaded this session, nothing
    before that — the row shouldn't fetch just to have a number to show. */

