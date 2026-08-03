"use client";

import { useState } from "react";
import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, ImageIcon, UploadIcon, XIcon } from "@/components/icons";
import { friendlyPhotoUploadError } from "@/lib/friendlyErrors";
import { uploadPhotoFile } from "@/lib/photoStorage";

export function ImagePicker({
  current,
  images,
  onSelect,
  gridActive = false,
  onSelectGrid,
  label = "Choose photo",
  className = "",
}: {
  current?: string;
  images: string[];
  onSelect: (url: string | undefined) => void;
  gridActive?: boolean;
  onSelectGrid?: () => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uniqueImages = Array.from(new Set(images.filter(Boolean)));

  function choose(action: () => void) {
    action();
    setError(null);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={`image-picker__trigger no-print ${className}`}
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
            <h2 id="image-picker-title">Choose an image</h2>
            <p>Use a photo already in this cookbook or add a new one.</p>
          </div>
          <button type="button" className="image-picker__close" onClick={() => setOpen(false)} aria-label="Close">
            <XIcon size={ICON_SIZE.md} />
          </button>
        </div>

        <div className="image-picker__choices">
          {onSelectGrid && (
            <button
              type="button"
              className={`image-picker__choice ${gridActive ? "is-active" : ""}`}
              onClick={() => choose(onSelectGrid)}
              aria-pressed={gridActive}
            >
              <span className="image-picker__grid-icon" aria-hidden><i /><i /><i /><i /></span>
              <span>Photo grid</span>
              {gridActive && <CheckIcon size={ICON_SIZE.sm} />}
            </button>
          )}
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
          <label className={`image-picker__choice ${uploading ? "is-busy" : ""}`}>
            <UploadIcon size={22} />
            <span>{uploading ? "Adding…" : "Add new"}</span>
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
                  onSelect(await uploadPhotoFile(file));
                  setOpen(false);
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
            <h3>Existing photos</h3>
            <div className="image-picker__grid">
              {uniqueImages.map((image, index) => (
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
              ))}
            </div>
          </section>
        )}
        {error && <p className="image-picker__error" role="alert">{error}</p>}
      </Dialog>
    </>
  );
}
