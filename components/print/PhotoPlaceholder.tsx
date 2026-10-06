import { ImageIcon } from "@/components/icons";

/**
 * Where a photo goes before the cook has added one: a recipe's full page, a
 * chapter's image page, or a recipe's in-page photo. Screen only; the export
 * refuses to print one (see `emptyPhotoTitles` on the print page). Clicking it
 * opens the photo picker, like clicking any photo (PHOTO_SURFACES in
 * PrintDeck).
 *
 * It sits INSIDE the scaled page, so its type is divided by `--page-scale` to
 * come out at the workspace's own caption size on screen rather than shrinking
 * with the page. The in-page box is too small for words at that size, so it
 * shows the icon alone and says what it is to assistive tech.
 */
export function PhotoPlaceholder({ variant }: { variant: "page" | "inline" }) {
  if (variant === "inline") {
    return (
      <span className="photo-placeholder photo-placeholder--inline no-print" role="img" aria-label="Add a photo">
        <span className="photo-placeholder__icon">
          <ImageIcon size={18} />
        </span>
      </span>
    );
  }
  return (
    <div className="photo-placeholder photo-placeholder--page no-print">
      <span className="photo-placeholder__icon">
        <ImageIcon size={18} />
      </span>
      <span className="photo-placeholder__title">Add a photo</span>
      <span className="photo-placeholder__note">Upload your own photo</span>
    </div>
  );
}
