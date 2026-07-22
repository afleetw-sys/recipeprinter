"use client";

import { ImportPanel } from "@/components/ImportPanel";
import { ICON_SIZE, XIcon } from "@/components/icons";
import { Dialog } from "@/components/Dialog";
import type { QueueItem } from "@/types/recipe";

// A lighter, one-shot version of the homepage's import panel: no queue list
// (nothing to review here — it's just "add one and get back to the deck"),
// and URL/image/text submissions close the dialog right away. CookPilot stays
// open since picking from your library is inherently a multi-select browse,
// not a single submit.
export function AddRecipeDialog({
  open,
  onClose,
  items,
  onAddUrl,
  onAddImages,
  onAddText,
  onAddCookPilotRecipes,
  onRemoveRecipe,
}: {
  open: boolean;
  onClose: () => void;
  items: QueueItem[];
  onAddUrl: (url: string) => void;
  onAddImages: (images: string[], label: string) => void;
  onAddText: (text: string) => void;
  onAddCookPilotRecipes: (recipes: QueueItem[]) => number;
  onRemoveRecipe: (id: string) => void;
}) {
  function handleAddUrl(url: string) {
    onAddUrl(url);
    onClose();
  }

  function handleAddImages(images: string[], label: string) {
    onAddImages(images, label);
    onClose();
  }

  function handleAddText(text: string) {
    onAddText(text);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      labelledBy="recipe-add-dialog-title"
      className="recipe-add-dialog no-print"
      backdropClassName="recipe-add-dialog__backdrop"
      panelClassName="recipe-add-dialog__panel"
    >
      <div className="recipe-add-dialog__header">
        <h2 id="recipe-add-dialog-title">Add recipe</h2>
        <button
          type="button"
          className="recipe-add-dialog__close icon-close-btn"
          aria-label="Close"
          onClick={onClose}
        >
          <XIcon size={ICON_SIZE.md} />
        </button>
      </div>
      <div className="recipe-add-dialog__body">
        <ImportPanel
          items={items}
          onAddUrl={handleAddUrl}
          onAddImages={handleAddImages}
          onAddText={handleAddText}
          onAddCookPilotRecipes={onAddCookPilotRecipes}
          onRemoveRecipe={onRemoveRecipe}
        />
      </div>
    </Dialog>
  );
}
