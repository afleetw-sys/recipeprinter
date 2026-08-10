"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { IconButton } from "@/components/Controls";
import { CheckIcon, ICON_SIZE, ImageIcon, UploadIcon, XIcon } from "@/components/icons";
import { friendlyPhotoUploadError } from "@/lib/friendlyErrors";
import { uploadPhotoFile } from "@/lib/photoStorage";

export function ImagePicker({
  current,
  images,
  onSelect,
  gridActive = false,
  onSelectGrid,
  onExitGrid,
  gridImages,
  onGridChange,
  gridMax = 6,
  placement,
  placementOptions,
  onPlacementChange,
  label = "Choose photo",
  className = "",
}: {
  current?: string;
  images: string[];
  onSelect: (url: string | undefined) => void;
  gridActive?: boolean;
  onSelectGrid?: () => void;
  /** Turns the "Photo grid" choice into a toggle: when provided, clicking it
      while grid is active exits back to a single photo (used by section openers,
      where grid is a Full-page sub-mode). Absent = the cover's one-way behavior. */
  onExitGrid?: () => void;
  /** Current photos in the cover collage (grid mode), in display order. */
  gridImages?: string[];
  /** Replaces the whole collage selection. Enables grid multi-select in the
      existing-photos section — the user picks how many photos and which ones. */
  onGridChange?: (urls: string[]) => void;
  /** Most photos a collage holds; the grid layout tops out here. */
  gridMax?: number;
  /** Recipe-photo mode: the current placement id (`none` hides the source
      section). Presence of `placementOptions` turns the dialog into the
      per-recipe Photo picker — placement on top, then this recipe's photo vs a
      custom one. */
  placement?: string;
  placementOptions?: Array<{ id: string; label: string; hint?: string }>;
  onPlacementChange?: (id: string) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Recipe-photo mode: placement (None/In-card/Full-page) on top, then the
  // source (this recipe's photo vs a custom one). `none` = no photo, so the
  // source section collapses.
  const recipeMode = Boolean(placementOptions && onPlacementChange);
  // Always surface the currently-chosen photo as a selectable tile, even when it
  // isn't one of the passed candidates — e.g. a section cover / cover photo the
  // cook UPLOADED (a Storage URL, not a recipe image). Without this the photo is
  // visibly on the page yet the picker shows nothing selected, reading as "no
  // photo". Skipped in recipe-photo mode, whose grid is deliberately just "this
  // recipe's photo" (a custom upload lives behind the Custom photo tile there).
  const uniqueImages = Array.from(
    new Set([...(current && !recipeMode ? [current] : []), ...images].filter(Boolean)),
  );
  // Grid multi-select: the cover reaches it via its standalone "Photo grid"
  // choice; a section opener reaches it as a Full-page sub-mode. Either way the
  // caller drives it through `gridActive`.
  const selectedGrid = (gridImages ?? []).filter(Boolean);
  const gridMode = gridActive && Boolean(onGridChange);
  const placementNone = recipeMode && placement === "none";
  // The "Photo grid" choice shows for the cover always, and for a placement
  // dialog only under Full page — where it toggles the single facing photo into
  // a collage. (Recipes pass no `onSelectGrid`, so it never shows for them.)
  const showGridChoice = Boolean(onSelectGrid) && (!recipeMode || placement === "full");

  function choose(action: () => void) {
    action();
    setError(null);
    setOpen(false);
  }

  function toggleInGrid(image: string) {
    if (!onGridChange) return;
    if (selectedGrid.includes(image)) {
      onGridChange(selectedGrid.filter((url) => url !== image));
    } else if (selectedGrid.length < gridMax) {
      onGridChange([...selectedGrid, image]);
    }
    setError(null);
  }

  return (
    <>
      <button
        type="button"
        className={`image-picker__trigger no-print ${className}`}
        // Don't let mousedown pull focus off a currently-edited field (e.g. the
        // section/chapter title textarea): that blur would commit-and-close the
        // edit before this picker ever opens. The click still fires.
        onMouseDown={(event) => event.preventDefault()}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        <ImageIcon size={ICON_SIZE.md} />
        <span>{label}</span>
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        closeDisabled={uploading}
        labelledBy="image-picker-title"
        dismissOnBackdropClick
        portal
        className="image-picker"
        backdropClassName="image-picker__backdrop"
        panelClassName="image-picker__panel"
      >
        <div className="image-picker__heading">
          <div>
            <h2 id="image-picker-title">
              {gridMode ? "Choose photos" : recipeMode ? "Recipe photo" : "Choose an image"}
            </h2>
            <p>
              {gridMode
                ? `Pick up to ${gridMax} photos for the collage — tap to add or remove.`
                : recipeMode
                  ? "Choose where the photo goes, then pick a photo or a custom one."
                  : "Use a photo already in this cookbook or add a new one."}
            </p>
          </div>
          <IconButton className="image-picker__close" onClick={() => setOpen(false)} aria-label="Close">
            <XIcon size={ICON_SIZE.md} />
          </IconButton>
        </div>

        {recipeMode && placementOptions && (
          <section className="image-picker__placement" aria-label="Where the photo goes">
            <h3>Placement</h3>
            <div className="image-picker__placement-row" role="group">
              {placementOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`image-picker__placement-btn ${placement === option.id ? "is-active" : ""}`}
                  aria-pressed={placement === option.id}
                  onClick={() => onPlacementChange?.(option.id)}
                >
                  <span className="image-picker__placement-label">{option.label}</span>
                  {option.hint && <span className="image-picker__placement-hint">{option.hint}</span>}
                </button>
              ))}
            </div>
          </section>
        )}

        {placementNone ? (
          <p className="image-picker__placement-note">
            No photo here. Pick a placement above to add one.
          </p>
        ) : (
        <>
        <div className={`image-picker__choices ${recipeMode ? "image-picker__choices--recipe" : ""}`}>
          {/* "Photo grid": on the cover it swaps the single cover photo for a
              collage; under a Full-page placement (section openers) it toggles the
              facing photo into a chapter collage, and `onExitGrid` collapses it
              back to one photo. */}
          {showGridChoice && (
            <button
              type="button"
              className={`image-picker__choice ${gridActive ? "is-active" : ""}`}
              onClick={() => {
                setError(null);
                if (gridActive) onExitGrid?.();
                else if (onExitGrid) onSelectGrid?.();
                else if (onSelectGrid) choose(onSelectGrid);
              }}
              aria-pressed={gridActive}
            >
              <span className="image-picker__grid-icon" aria-hidden><i /><i /><i /><i /></span>
              <span>Photo grid</span>
              {gridActive && <CheckIcon size={ICON_SIZE.sm} />}
            </button>
          )}
          {!recipeMode && (
            <button
              type="button"
              className={`image-picker__choice ${!current && !gridActive ? "is-active" : ""}`}
              onClick={() => choose(() => onSelect(undefined))}
              aria-pressed={!current && !gridActive}
            >
              <span className="image-picker__none-icon" aria-hidden />
              <span>No image</span>
              {!current && !gridActive && <CheckIcon size={ICON_SIZE.sm} />}
            </button>
          )}
          <label className={`image-picker__choice ${uploading ? "is-busy" : ""}`}>
            <UploadIcon size={22} />
            <span>{uploading ? "Adding…" : recipeMode ? "Custom photo" : "Add new"}</span>
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={uploading}
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setError(null);
                setUploading(true);
                try {
                  const url = await uploadPhotoFile(file);
                  // In grid mode a fresh upload joins the collage and the dialog
                  // stays open so the user can keep curating; otherwise it's the
                  // single chosen photo and we close.
                  if (gridMode && onGridChange) {
                    if (selectedGrid.length < gridMax) onGridChange([...selectedGrid, url]);
                  } else {
                    onSelect(url);
                    setOpen(false);
                  }
                } catch (uploadError) {
                  console.warn("RecipePrinter: image upload failed", uploadError);
                  setError(friendlyPhotoUploadError(uploadError));
                } finally {
                  setUploading(false);
                }
              }}
            />
          </label>
        </div>

        {uniqueImages.length > 0 && (
          <section className="image-picker__existing" aria-label="Existing photos">
            <h3>{gridMode ? "Tap to add or remove" : recipeMode ? "This recipe's photo" : "Existing photos"}</h3>
            <div className="image-picker__grid">
              {uniqueImages.map((image, index) => {
                if (gridMode) {
                  const order = selectedGrid.indexOf(image);
                  const inGrid = order !== -1;
                  const atMax = !inGrid && selectedGrid.length >= gridMax;
                  return (
                    <button
                      key={image}
                      type="button"
                      className={`image-picker__photo ${inGrid ? "is-active" : ""} ${
                        atMax ? "is-disabled" : ""
                      }`}
                      onClick={() => toggleInGrid(image)}
                      disabled={atMax}
                      aria-label={inGrid ? `Remove photo ${index + 1} from cover` : `Add photo ${index + 1} to cover`}
                      aria-pressed={inGrid}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt="" />
                      {inGrid && <span className="image-picker__order">{order + 1}</span>}
                    </button>
                  );
                }
                return (
                  <button
                    key={image}
                    type="button"
                    className={`image-picker__photo ${current === image && !gridActive ? "is-active" : ""}`}
                    onClick={() => choose(() => onSelect(image))}
                    aria-label={`Use existing photo ${index + 1}`}
                    aria-pressed={current === image && !gridActive}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" />
                    {current === image && !gridActive && (
                      <span className="image-picker__check"><CheckIcon size={ICON_SIZE.sm} /></span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}
        </>
        )}
        {error && <p className="image-picker__error" role="alert">{error}</p>}
        {gridMode && (
          <div className="image-picker__footer">
            <span className="image-picker__count">
              {selectedGrid.length} of {gridMax} selected
            </span>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => setOpen(false)}
            >
              Done
            </button>
          </div>
        )}
      </Dialog>
    </>
  );
}
