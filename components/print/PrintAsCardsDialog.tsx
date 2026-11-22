"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { BookRecipePicker, type BookRecipe } from "@/components/BookRecipePicker";
import { ICON_SIZE, SpinnerIcon, XIcon } from "@/components/icons";
import { Checkbox } from "@/components/Controls";

/**
 * "Print as recipe cards": which of the book's recipes to print as cards.
 *
 * The same searchable list a chapter's "Add existing" uses, so a book of three
 * hundred recipes is as easy to pick from as one of three. It opens with the
 * recipes the cook already selected in the rail (or the one on screen) ticked,
 * so the common case is one press.
 *
 * The cards open as a new job holding those recipes, saved to Projects. With
 * the box ticked (the default) they stay linked: an edit to a recipe on a card
 * changes it in the book too, and the other way round. Unticked, the cards are
 * their own copies, for a cook who wants to trim a recipe for a card (a
 * shorter note, fewer words) without touching the book.
 */
export function PrintAsCardsDialog({
  open,
  onClose,
  recipes,
  initialIds,
  onPrint,
}: {
  open: boolean;
  onClose: () => void;
  recipes: BookRecipe[];
  initialIds: string[];
  /** Resolves once the cards are on their way, or rejects if they could not
      be made; the dialog stays open on a failure so the choice isn't lost.
      `keepInSync` is the checkbox: linked recipes, or separate copies. */
  onPrint: (itemIds: string[], keepInSync: boolean) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialIds));
  const [busy, setBusy] = useState(false);
  const [keepInSync, setKeepInSync] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setSelected(new Set(initialIds));
    setKeepInSync(true);
    setError(null);
    // Ticks what was selected when it opened, not whatever the rail does after.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const count = selected.size;
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      labelledBy="print-as-cards-title"
      className="recipe-add-dialog no-print"
      backdropClassName="recipe-add-dialog__backdrop"
      panelClassName="recipe-add-dialog__panel"
    >
      <div className="recipe-add-dialog__header">
        <h2 id="print-as-cards-title">Print as recipe cards</h2>
        <button
          type="button"
          className="recipe-add-dialog__close icon-close-btn"
          aria-label="Close"
          onClick={onClose}
          disabled={busy}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>
      <div className="recipe-add-dialog__body">
        <p className="text-cp-caption text-ink-soft mb-cp-3">Choose the recipes to print as cards.</p>
        <BookRecipePicker recipes={recipes} selectedIds={selected} onSelectedIdsChange={setSelected} />
        <Checkbox
          className="mt-cp-3"
          checked={keepInSync}
          onChange={(event) => setKeepInSync(event.target.checked)}
          label="Keep the cards and the cookbook the same"
          hint="Change a recipe in one and it changes in the other."
        />
        {error && (
          <p className="field-error mt-cp-2" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="recipe-add-dialog__footer">
        <button
          type="button"
          className="btn btn-primary w-full"
          disabled={busy || count === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              // In book order, not the order they were ticked in.
              await onPrint(recipes.map(({ item }) => item.id).filter((id) => selected.has(id)), keepInSync);
            } catch {
              setError("We couldn't open those cards. Please try again.");
              setBusy(false);
            }
          }}
        >
          {busy && <SpinnerIcon size={ICON_SIZE.md} />}
          {count > 1 ? `Print ${count} recipes as cards` : "Print as a recipe card"}
        </button>
      </div>
    </Dialog>
  );
}
