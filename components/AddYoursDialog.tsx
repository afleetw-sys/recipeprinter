"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { Dialog } from "@/components/Dialog";
import { CheckIcon, ICON_SIZE, SpinnerIcon, UploadIcon, XIcon } from "@/components/icons";
import { partitionImageFiles } from "@/lib/imageImport";
import { friendlyPhotoUploadError } from "@/lib/friendlyErrors";
import { submitGalleryPhoto } from "@/lib/gallerySubmissions";

/**
 * "Add yours" — a photo of what someone actually printed, for the homepage's
 * "Fresh off the printer" strip.
 *
 * Reads like a normal submission form. Behind it, submitting only ever writes
 * to a Firebase inbox nobody can read back through the client SDK (see
 * lib/gallerySubmissions.ts) — there is no live "your photo is now on the
 * site" moment, because there isn't one: every photo up there was added by
 * hand, and this one will be too.
 */
export function AddYoursDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emailId = useId();

  function reset() {
    setPhoto(null);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setEmail("");
    setError(null);
    setSent(false);
  }

  function close() {
    if (busy) return;
    onClose();
    // After the close animation would read, not mid-fade — a form resetting
    // under a dialog that's still visibly closing looks like the fields were
    // never filled in to begin with.
    window.setTimeout(reset, 200);
  }

  function choosePhoto(list: FileList | null) {
    const { images } = partitionImageFiles(list);
    const file = images[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    if (!photo) {
      setError("Add a photo first.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await submitGalleryPhoto({
        email: email.trim(),
        photo,
      });
      setSent(true);
    } catch (err) {
      setError(friendlyPhotoUploadError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      closeDisabled={busy}
      label="Add yours"
      dismissOnBackdropClick
      portal
      className="fixed inset-0 z-[var(--z-dialog)] flex items-stretch sm:items-center justify-center dialog-scrim p-0 sm:px-cp-4 sm:py-cp-6"
      panelClassName="panel panel--modal w-full sm:max-w-[460px] h-full sm:h-auto rounded-none border-0 sm:rounded-2xl sm:border p-cp-5 flex flex-col gap-cp-4 relative overflow-y-auto"
    >
      <button
        type="button"
        className="absolute right-3 top-3 icon-close-btn"
        onClick={close}
        aria-label="Close"
        disabled={busy}
      >
        <XIcon size={ICON_SIZE.md} />
      </button>

      {sent ? (
        // The title and the ask are done with, so they go: what is left is the
        // answer to "did that work?", centred with room around it.
        <div className="flex flex-col items-center gap-cp-3 px-cp-4 py-cp-6 text-center" role="status">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-brand-100 text-brand-ink">
            <CheckIcon size={28} />
          </span>
          <div>
            <h3 className="font-extrabold text-cp-dialog-title">We got your photo</h3>
            <p className="mt-1 text-cp-small text-ink-soft">Thanks for sharing.</p>
          </div>
        </div>
      ) : (
        <>
        <div className="pr-cp-7">
          <h3 className="font-extrabold text-cp-dialog-title">Add yours</h3>
          <p className="mt-1 text-cp-small text-ink-soft">
            Show others how you took a recipe off the screen and into the kitchen.
          </p>
        </div>
        <form className="flex flex-col gap-cp-3" onSubmit={handleSubmit}>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(event) => choosePhoto(event.target.files)}
            />
            {photoPreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="block w-full overflow-hidden rounded-xl border border-line"
              >
                {/* A raw object URL, never uploaded anywhere until Submit — an
                    <img> rather than next/image, which can't take one. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt=""
                  className="h-40 w-full object-cover"
                />
                <span className="block bg-[var(--cp-surface-sunken,var(--cp-paper))] px-cp-3 py-2 text-cp-caption font-semibold text-ink-soft">
                  Choose a different photo
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-cp-4 py-cp-6 text-ink-soft transition-colors hover:bg-[var(--cp-overlay-hover)]"
              >
                <UploadIcon size={ICON_SIZE.lg} />
                <span className="text-cp-small font-semibold">Choose a photo</span>
              </button>
            )}
          </div>

          <div>
            <label className="field-label" htmlFor={emailId}>
              Your email (optional)
            </label>
            <input
              id={emailId}
              className="field"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
          </div>

          {error && <p className="field-error" role="alert">{error}</p>}

          <div className="flex flex-col gap-2">
            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <SpinnerIcon size={ICON_SIZE.md} /> : null}
              Share your photo
            </button>
            <p className="text-center text-cp-caption leading-relaxed text-ink-soft">
              By sharing, you let RecipePrinter use your photo on our site and in marketing.
            </p>
          </div>
        </form>
        </>
      )}
    </Dialog>
  );
}
