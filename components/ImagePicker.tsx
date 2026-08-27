"use client";

import { useEffect, useState } from "react";
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
  openSignal,
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
  /** Opens the dialog from outside. Choosing "In card" or "Full page" for a
      recipe that has no photo yet is a request for a photo, so the thing that
      asks for one opens by itself instead of leaving a placement set to
      nothing. Each new value opens it once; closing is still the dialog's. */
  openSignal?: number;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  // Recipe-photo mode: placement (None/In-card/Full-page) on top, then the
  // source (this recipe's photo vs a custom one). `none` = no photo, so the
  // source section collapses.
  const recipeMode = Boolean(placementOptions && onPlacementChange);
  // Always surface the currently-chosen photo as a selectable tile, even when it
  // isn't one of the passed candidates — e.g. a section cover / cover photo the
  // cook UPLOADED (a Storage URL, not a recipe image). Without this the photo is
  // visibly on the page yet the picker shows nothing selected, reading as "no
  // photo". Skipped in recipe-photo mode, which passes its own candidates: the
  // recipe's current photo plus the ones it has worn before (`photoHistory`),
  // so the current one is already among them.
  const uniqueImages = Array.from(
    new Set([...(current && !recipeMode ? [current] : []), ...images].filter(Boolean)),
  );
  // Grid multi-select: the cover reaches it via its standalone "Photo grid"
  // choice; a section opener reaches it as a Full-page sub-mode. Either way the
  // caller drives it through `gridActive`.
  const selectedGrid = (gridImages ?? []).filter(Boolean);
  const gridMode = gridActive && Boolean(onGridChange);
  /* "None" hides the photo, so there is nothing to pick a photo FOR — unless
     there is no photo yet, in which case hiding the picker is the thing that
     traps you: the dialog offers three placements, two of them do nothing
     visible without a photo, and the one control that would give you one is
     the control being hidden. With no photo, the upload always shows. */
  const placementNone = recipeMode && placement === "none" && Boolean(current);
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

  function markImageFailed(image: string) {
    setFailedImages((current) => {
      if (current.has(image)) return current;
      const next = new Set(current);
      next.add(image);
      return next;
    });
  }

  function removeFailedImage(image: string) {
    if (gridMode && onGridChange) {
      onGridChange(selectedGrid.filter((url) => url !== image));
      return;
    }
    if (current === image || recipeMode) onSelect(undefined);
    setOpen(false);
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
        title={label}
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
                  ? "Set the placement, then pick a photo."
                  : "Use a photo already in this cookbook or add a new one."}
            </p>
          </div>
          <IconButton className="image-picker__close" onClick={() => setOpen(false)} aria-label="Close">
            <XIcon size={ICON_SIZE.md} />
          </IconButton>
        </div>

        {recipeMode && placementOptions && (
          <section className="image-picker__placement" aria-label="Where the photo goes">
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
                </button>
              ))}
            </div>
          </section>
        )}

        {placementNone ? (
          <p className="image-picker__placement-note">
            This recipe&rsquo;s photo is hidden. Pick a placement above to show it.
          </p>
        ) : (
        <>
        <section className="image-picker__existing" aria-label="Photos">
          <div className="image-picker__existing-head">
            <h3>{gridMode ? "Tap to add or remove" : recipeMode ? "This recipe's photo" : "Your photos"}</h3>
            {/* "Select multiple" turns the grid into a multi-pick collage. Section
                openers can toggle back (onExitGrid); the cover enters and closes,
                matching its one-way collage flow — so it's hidden once the cover is
                already multi-selecting, having no single-photo state to return to. */}
            {showGridChoice && (!gridActive || onExitGrid) && (
              <button
                type="button"
                className={`image-picker__multiselect ${gridActive ? "is-active" : ""}`}
                aria-pressed={gridActive}
                onClick={() => {
                  setError(null);
                  if (gridActive) onExitGrid?.();
                  else if (onExitGrid) onSelectGrid?.();
                  else if (onSelectGrid) choose(onSelectGrid);
                }}
              >
                <span className="image-picker__grid-icon" aria-hidden><i /><i /><i /><i /></span>
                <span>{gridActive ? "Use one photo" : "Select multiple"}</span>
              </button>
            )}
          </div>

          <div className="image-picker__grid">
            {/* Cover/plain pickers keep a "None" tile to clear the photo. */}
            {!recipeMode && (
              <button
                type="button"
                className={`image-picker__photo image-picker__photo--action ${
                  !current && !gridActive ? "is-active" : ""
                }`}
                onClick={() => choose(() => onSelect(undefined))}
                aria-label="No photo"
                aria-pressed={!current && !gridActive}
              >
                <span className="image-picker__none-icon" aria-hidden />
                <span className="image-picker__tile-label">None</span>
              </button>
            )}

            {uniqueImages.map((image, index) => {
              const failed = failedImages.has(image);
              if (failed) {
                const isSelectedFailedImage = current === image || selectedGrid.includes(image) || recipeMode;
                // A stale unselected candidate has no useful recovery action;
                // simply stop offering it. Selected stale URLs remain visible
                // as an explicit removable state so the saved config can heal.
                if (!isSelectedFailedImage) return null;
                return (
                  <button
                    key={image}
                    type="button"
                    className="image-picker__photo image-picker__photo--unavailable"
                    onClick={() => removeFailedImage(image)}
                    aria-label="Remove unavailable photo"
                  >
                    <ImageIcon size={ICON_SIZE.md} />
                    <span className="image-picker__tile-label">Unavailable</span>
                    <span className="image-picker__remove-label">Remove</span>
                  </button>
                );
              }
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
                    aria-label={inGrid ? `Remove photo ${index + 1} from collage` : `Add photo ${index + 1} to collage`}
                    aria-pressed={inGrid}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={image} alt="" onError={() => markImageFailed(image)} />
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
                  <img src={image} alt="" onError={() => markImageFailed(image)} />
                  {current === image && !gridActive && (
                    <span className="image-picker__check"><CheckIcon size={ICON_SIZE.sm} /></span>
                  )}
                </button>
              );
            })}

            {/* Upload sits at the end of the grid as an "add" tile: in grid mode a
                fresh upload joins the collage (dialog stays open to keep curating);
                otherwise it becomes the chosen photo and we close. */}
            <label
              className={`image-picker__photo image-picker__photo--action image-picker__photo--upload ${
                uploading ? "is-busy" : ""
              }`}
            >
              <UploadIcon size={20} />
              <span className="image-picker__tile-label">{uploading ? "Adding…" : "Upload"}</span>
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
        </section>
        </>
        )}
        {error && <p className="field-error" role="alert">{error}</p>}
        {gridMode && (
          <div className="image-picker__footer">
            <span className="image-picker__count">
              {selectedGrid.length === 0
                ? "No photos yet"
                : `${selectedGrid.length} photo${selectedGrid.length === 1 ? "" : "s"} selected`}
              {selectedGrid.length >= gridMax && " · grid full"}
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
