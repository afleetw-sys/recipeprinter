"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import {
  UI_THEMES,
  applyUiTheme,
  readAppliedUiThemeId,
  type UiTheme,
} from "@/lib/uiThemes";

/**
 * The UI theme switcher — experimental, and deliberately easy to delete.
 *
 * This is scaffolding for looking at the product in different skins, not a
 * product feature: one floating launcher, one panel, and no entry point in the
 * real chrome. Removing the `<ThemeLab />` line from the root layout takes the
 * whole thing out; the token work underneath it stands on its own.
 *
 * The trick that makes the picker worth having: `[data-ui-theme="…"]` in
 * globals.css is a plain attribute selector, not `html[data-ui-theme]`, so
 * putting the attribute on a `<div>` scopes that theme's tokens to the subtree
 * inside it. Each card below therefore renders a small piece of REAL chrome —
 * the same tokens, borders, radii, and typeface the app uses — already wearing
 * the theme it's offering. A row of static colour swatches tells you a theme is
 * navy and mustard; this tells you what navy and mustard do to a button.
 */
export function ThemeLab() {
  const [open, setOpen] = useState(false);
  // Starts null on the server and on the first client render, then syncs to
  // whatever the pre-paint script in the root layout already applied. Reading
  // the DOM during render would disagree with the server's HTML and get
  // rewritten by hydration.
  const [active, setActive] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setActive(readAppliedUiThemeId());
    setReady(true);
  }, []);

  const choose = useCallback((id: string | null) => {
    applyUiTheme(id);
    setActive(id);
  }, []);

  const activeTheme = UI_THEMES.find((t) => t.id === active) ?? UI_THEMES[0];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        /* Raised clear of the workspace's mobile action bar, which is full
           width and comes in below 1024px (see `.rp-mobile-print-tray` in
           globals.css); at the default corner offset the launcher sat on top
           of the Print button. `--z-menu`, not `--z-toast`: this is chrome,
           and it belongs UNDER the panel it opens. */
        className="no-print fixed bottom-[7.5rem] left-cp-4 z-[var(--z-menu)] inline-flex items-center gap-cp-2 rounded-full border border-line-strong bg-card px-cp-3 py-cp-2 text-cp-caption font-bold text-ink shadow-cp-lg transition-transform hover:-translate-y-px lg:bottom-cp-4"
        aria-haspopup="dialog"
        title="Try a different UI theme"
      >
        <SwatchGlyph />
        {/* Suppressed because the label depends on a value only the client
            knows; the server has no way to render the right theme name. */}
        <span suppressHydrationWarning>{ready ? activeTheme.name : "Theme"}</span>
      </button>

      {open && (
        <Dialog
          open
          onClose={() => setOpen(false)}
          dismissOnBackdropClick
          portal
          labelledBy="theme-lab-title"
          className="fixed inset-0 z-[var(--z-dialog)] flex items-end justify-center sm:items-center"
          backdropClassName="absolute inset-0 bg-[var(--cp-scrim)]"
          panelClassName="relative flex max-h-[92dvh] w-full max-w-[64rem] flex-col overflow-hidden rounded-t-2xl border border-line bg-page shadow-cp-xl sm:m-cp-6 sm:rounded-2xl"
        >
          <header className="flex items-start justify-between gap-cp-4 border-b border-line px-cp-5 py-cp-4">
            <div>
              <h2 id="theme-lab-title" className="text-cp-dialog-title font-extrabold text-ink">
                Theme lab
              </h2>
              <p className="mt-1 text-cp-small text-ink-soft">
                Each card is live chrome in its own theme. Your choice is remembered on this
                device, and <code className="font-mono">?ui-theme=</code> in the URL wins for one
                visit.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="btn btn-ghost shrink-0"
            >
              Done
            </button>
          </header>

          <div className="grid gap-cp-4 overflow-y-auto p-cp-5 sm:grid-cols-2 xl:grid-cols-4">
            {UI_THEMES.map((theme) => (
              <ThemeCard
                key={theme.id ?? "default"}
                theme={theme}
                selected={ready && theme.id === active}
                onSelect={() => choose(theme.id)}
              />
            ))}
          </div>
        </Dialog>
      )}
    </>
  );
}

function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: UiTheme;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      /* The card's OWN frame stays in the app's current theme so the grid reads
         as one panel; only the preview inside it changes skin. A card that
         themed its own border too would make the selected-state ring mean two
         different things at once. */
      className={`group flex flex-col overflow-hidden rounded-xl border text-left transition-transform hover:-translate-y-0.5 ${
        selected
          ? "border-[var(--cp-selected-border)] bg-[var(--cp-selected-fill)]"
          : "border-line bg-card"
      }`}
    >
      {/* The theme's own tokens, scoped to this subtree. */}
      <div
        data-ui-theme={theme.id ?? undefined}
        className="border-b border-line bg-page p-cp-3 font-sans"
      >
        <ChromePreview name={theme.name} />
      </div>

      <div className="flex flex-1 flex-col gap-cp-2 p-cp-3">
        <div className="flex items-baseline justify-between gap-cp-2">
          <span className="text-cp-h2 font-extrabold text-ink">{theme.name}</span>
          <span className="shrink-0 rounded-full bg-brand px-cp-2 py-0.5 text-cp-micro font-bold uppercase tracking-wide text-card">
            {theme.era}
          </span>
        </div>
        <p className="text-cp-caption leading-snug text-ink-soft">{theme.description}</p>
        <ul className="mt-auto flex gap-1 pt-cp-1">
          {theme.swatches.map((swatch) => (
            <li
              key={swatch.hex}
              title={`${swatch.name} ${swatch.hex}`}
              className="h-5 flex-1 rounded-sm border border-line"
              style={{ background: swatch.hex }}
            />
          ))}
        </ul>
      </div>
    </button>
  );
}

/**
 * A miniature of the workspace, built from the same tokens the real one uses:
 * a top bar, a selected sheet on the deck ground, a notice banner, and the two
 * button weights (`.btn-primary`, `.btn-secondary`) side by side. This is what
 * actually differs between the themes — paper colour, ink, corner radius, and
 * typeface — rather than a swatch row, which every theme would make look
 * equally good.
 *
 * It shows BOTH accents on purpose. The palettes each have a cool half and a
 * warm one (see --cp-accent-warm in globals.css), and a preview that only ever
 * painted the cool one is what let Sunroom ship reading as a blue app on mint
 * paper. The selected card here carries the cool border and the warm fill; the
 * banner under it is the warm notice family in full.
 */
function ChromePreview({ name }: { name: string }) {
  return (
    <div className="overflow-hidden rounded border border-line bg-card">
      <div className="flex items-center gap-1.5 border-b border-line px-2 py-1.5">
        <span className="h-2.5 w-2.5 rounded-sm bg-brand" aria-hidden="true" />
        <span className="text-cp-micro font-extrabold text-ink">{name}</span>
        <span className="ml-auto text-cp-micro font-bold text-brand-ink">Print</span>
      </div>
      <div className="space-y-1.5 bg-[var(--cp-deck-ground)] px-2 py-2">
        {/* Selected: cool border and text, warm fill. */}
        <div
          className="rounded border px-2 py-1.5"
          style={{
            borderColor: "var(--cp-selected-border)",
            background: "var(--cp-selected-fill)",
          }}
        >
          <div
            className="text-cp-micro font-extrabold"
            style={{ color: "var(--cp-selected-text)" }}
          >
            Buttermilk Biscuits
          </div>
          <div className="mt-1 space-y-1" aria-hidden="true">
            <span className="block h-1 w-full rounded-full bg-[var(--cp-line-strong)]" />
            <span className="block h-1 w-4/5 rounded-full bg-line" />
            <span className="block h-1 w-3/5 rounded-full bg-line" />
          </div>
        </div>
        {/* The warm notice family: tint, border, ink. */}
        <div
          className="flex items-center gap-1 rounded px-2 py-1 text-cp-micro font-bold"
          style={{
            border: "1px solid color-mix(in srgb, var(--cp-accent-warm) 28%, transparent)",
            background: "var(--cp-accent-warm-soft)",
            color: "var(--cp-accent-warm-ink)",
          }}
        >
          <span>Free template</span>
          <span className="ml-auto uppercase tracking-wide">New</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5 border-t border-line px-2 py-1.5">
        <span className="btn btn-primary !min-h-0 !px-2 !py-1 text-cp-micro">Print</span>
        <span className="btn btn-secondary !min-h-0 !px-2 !py-1 text-cp-micro">Edit</span>
        <span
          className="ml-auto h-3 w-6 rounded-full"
          style={{ background: "var(--cp-accent-warm-soft)" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

function SwatchGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <circle cx="5" cy="5" r="4" fill="var(--cp-accent)" />
      <circle cx="9.5" cy="9" r="4" fill="var(--cp-ink)" opacity="0.75" />
    </svg>
  );
}
