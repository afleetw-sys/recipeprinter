/** Replaces the browser's broken-image glyph with the shared unavailable-photo
    treatment supplied by the image's containing frame. */
export function markImageUnavailable(image: HTMLImageElement): void {
  image.hidden = true;
  image.parentElement?.classList.add("has-unavailable-photo");
}

export function markImageAvailable(image: HTMLImageElement): void {
  image.hidden = false;
  image.parentElement?.classList.remove("has-unavailable-photo");
}
