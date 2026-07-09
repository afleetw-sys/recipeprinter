"use client";

import { useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { useModalFocus } from "@/components/useModalFocus";
import { createSharedRecipeCard, setSharedRecipeCardPublished } from "@/lib/sharedRecipeCards";
import { printableRecipe } from "@/lib/queue";
import { isValidSlug, slugify } from "@/types/sharedRecipeCard";
import type { Recipe } from "@/types/recipe";

export interface ShareLinkPrintSettings {
  template: RecipePrintTemplate;
  cardSize: PrintCardSize;
  cardsPerSheet: 1 | 2;
  showPhoto: boolean;
  showSourceUrl: boolean;
  showCutLines: boolean;
  doubleSided: boolean;
}

export function AdminShareLinkDialog({
  recipe,
  settings,
  uid,
  onClose,
}: {
  recipe: Recipe;
  settings: ShareLinkPrintSettings;
  uid: string;
  onClose: () => void;
}) {
  const [slug, setSlug] = useState(() => slugify(recipe.title || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useModalFocus(dialogRef, onClose, { disabled: busy || deactivateBusy });

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const trimmedSlug = slug.trim().toLowerCase();
    if (!isValidSlug(trimmedSlug)) {
      setError("Use lowercase letters, numbers, and hyphens only (e.g. lemon-pasta).");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createSharedRecipeCard({
        slug: trimmedSlug,
        recipe: printableRecipe(recipe),
        template: settings.template,
        cardSize: settings.cardSize,
        cardsPerSheet: settings.cardsPerSheet,
        showPhoto: settings.showPhoto,
        showSourceUrl: settings.showSourceUrl,
        showCutLines: settings.showCutLines,
        doubleSided: settings.doubleSided,
        createdBy: uid,
      });
      setSavedSlug(trimmedSlug);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save that link. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!savedSlug || deactivateBusy) return;
    setDeactivateBusy(true);
    try {
      await setSharedRecipeCardPublished(savedSlug, false);
      setSavedSlug(null);
    } catch {
      setError("Couldn't deactivate that link. Please try again.");
    } finally {
      setDeactivateBusy(false);
    }
  }

  const shareUrl = savedSlug ? `${window.location.origin}/print/${savedSlug}` : null;

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center bg-ink/30 p-0 sm:px-cp-4 sm:py-cp-6"
      role="dialog"
      aria-modal="true"
      aria-label="Save as share link"
      tabIndex={-1}
    >
      <div className="panel panel--modal w-full sm:max-w-[420px] h-full sm:h-auto rounded-none border-0 sm:rounded-2xl sm:border p-cp-5 flex flex-col gap-cp-4 relative overflow-y-auto">
        <button
          type="button"
          className="absolute right-3 top-3 icon-close-btn"
          onClick={onClose}
          aria-label="Close"
        >
          <XIcon size={ICON_SIZE.md} />
        </button>

        <div className="pr-cp-7">
          <h3 className="font-extrabold tracking-[-0.02em] text-cp-h2">Save as share link</h3>
          <p className="text-cp-small text-ink-soft mt-1">
            Creates a public URL that opens this recipe preloaded with the current design and print settings.
          </p>
        </div>

        {savedSlug ? (
          <div className="flex flex-col gap-cp-3">
            <div className="state" role="status">
              <h4>Link saved</h4>
              <p>{shareUrl}</p>
            </div>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => shareUrl && navigator.clipboard?.writeText(shareUrl)}
            >
              Copy link
            </button>
            <button
              type="button"
              className="btn-ghost btn-compact w-full"
              onClick={handleDeactivate}
              disabled={deactivateBusy}
            >
              {deactivateBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Deactivate this link
            </button>
          </div>
        ) : (
          <form className="flex flex-col gap-cp-3" onSubmit={handleSave}>
            <div>
              <label className="field-label" htmlFor="share-slug">
                Link
              </label>
              <div className="flex items-center gap-1 text-cp-small text-ink-soft">
                <span>/print/</span>
                <input
                  id="share-slug"
                  className="field"
                  value={slug}
                  autoFocus
                  onChange={(event) => setSlug(event.target.value)}
                  placeholder="lemon-pasta"
                />
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Save link
            </button>
          </form>
        )}

        {error && (
          <div className="state state--error" role="alert">
            <h4>Couldn&apos;t save link</h4>
            <p>{error}</p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
