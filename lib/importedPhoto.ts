import type { Recipe } from "@/types/recipe";

/**
 * A cookbook recipe imported from the cook's own photo keeps that photo as its
 * image.
 *
 * CookPilot reads the text out of the photo and sends back no picture, so the
 * photo the cook took or chose used to be thrown away once it had been read.
 * In a cookbook it's often the best picture there is: the handwritten card,
 * the cookbook page, the dish. It's theirs, so it isn't held back the way a
 * website's image is (see lib/bookPhotos.ts).
 *
 * Saved the way a photo picked in the photo dialog is (uploaded when signed in,
 * kept in this browser otherwise), and started alongside the parse so the
 * import doesn't wait on it. Best effort: a photo that can't be saved just
 * leaves the recipe without one.
 */
export function storeImportedPhoto(source: File | string): Promise<string | undefined> {
  return (async () => {
    const file =
      typeof source === "string"
        ? await fetch(source)
            .then((response) => response.blob())
            .then((blob) => new File([blob], "imported-photo", { type: blob.type || "image/jpeg" }))
        : source;
    const { storePickedPhotoFile } = await import("@/lib/photoStorage");
    return storePickedPhotoFile(file);
  })().catch(() => undefined);
}

/** The parsed recipe with the stored photo as its image, unless it already has one. */
export async function withImportedPhoto(
  recipe: Recipe,
  storedPhoto: Promise<string | undefined> | undefined,
): Promise<Recipe> {
  if (!storedPhoto || recipe.image) return recipe;
  const image = await storedPhoto;
  return image ? { ...recipe, image } : recipe;
}
