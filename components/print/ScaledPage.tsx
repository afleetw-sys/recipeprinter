"use client";

import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  RecipeCardFace,
  BistroCheckerSpine,
  DividerFace,
  CoverFace,
  TableOfContentsFace,
  type RecipeCardInlineEdit,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { ImagePicker } from "@/components/ImagePicker";
import type { PageSheet, SheetSlot, ImageSheetSlot } from "@/lib/usePrintSheets";
import { photoGridLayout } from "@/lib/photoGrid";
import { startFocalDrag } from "@/lib/focalDrag";
import {
  IMAGE_CROP_TOLERANCE,
  IMAGE_ZOOM_FIT,
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_STEP,
  clampImageZoom,
  formatImageZoom,
  minZoomFor,
  zoomByWheel,
} from "@/lib/imageZoom";
import { markImageAvailable, markImageUnavailable } from "@/lib/imageFailure";
import { PAGE_DIMS } from "@/lib/printGeometry";
import type { CoverConfig } from "@/types/recipe";

/**
 * A physical sheet rendered at true page size, scaled down by `scale` on
 * screen. Every face for every slot is always in the DOM — for print (via
 * `@media print` un-scaling it) that's the whole point. On screen, though,
 * browsing still happens one recipe at a time like it always has:
 * `data-preview-hidden` (a screen-only rule) hides the whole front/back group
 * that isn't `activeSide` — otherwise its declared page-sized height still
 * pushes the flex column taller even with its cards individually hidden,
 * shoving the side you want to see out of the scaler's clipped viewport —
 * and, within whichever group is showing, hides every card except the one
 * matching `activeSlotIndex`. One tree, so preview and print can't drift
 * apart even though they show different amounts of it at once.
 */
export const ScaledPage = memo(function ScaledPage({
  sheet,
  isLastSheet,
  activeSlotIndex,
  activeSide,
  scale,
  size,
  template,
  doubleSided,
  showSourceUrl,
  showCutLines,
  showDecoration = true,
  cookbookMode = false,
  inlineEdit,
  dividerEdit,
  sectionArtEdit,
  coverEdit,
  imageEdit,
  tocKicker,
  tocTitle,
  tocEdit,
  gutterSide = "none",
}: {
  sheet: PageSheet;
  isLastSheet: boolean;
  activeSlotIndex: number;
  activeSide: "front" | "back";
  scale: number;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  doubleSided: boolean;
  showSourceUrl: boolean;
  cookbookMode?: boolean;
  showCutLines: boolean;
  /** False for the rail thumbnails, whose ~1/11 scale renders the templates'
      decorative motifs sub-pixel — print.css paints a flat stand-in instead.
      See `TemplateDecoration` in components/RecipeCardPrint.tsx. */
  showDecoration?: boolean;
  inlineEdit?: RecipeCardInlineEdit;
  dividerEdit?: {
    sectionId: string;
    value: string;
    onChange: (value: string) => void;
    onCommit: () => void;
    onCancel: () => void;
    subtitle?: string;
    onSubtitleChange?: (value: string) => void;
    intro?: string;
    onIntroChange?: (value: string) => void;
    photoUrl?: string;
    recipeImages?: string[];
    onPhotoChange?: (url: string | undefined) => void;
    /** Unified placement (None/In-card/Full-page/Photo grid) + grid curation, so
        the opener picker is the same dialog as the recipe one, plus the cover's
        multi-select grid. */
    placement?: string;
    placementOptions?: Array<{ id: string; label: string; hint?: string }>;
    onPlacementChange?: (id: string) => void;
    gridActive?: boolean;
    gridImages?: string[];
    onGridChange?: (urls: string[]) => void;
    onSelectGrid?: () => void;
    onExitGrid?: () => void;
    gridMax?: number;
  };
  /** The photo picker for a chapter's FACING art page (its full-page photo or
      collage) — the same dialog the opener's picker opens, rendered over the
      art itself so the button is always on the picture it changes. */
  sectionArtEdit?: {
    sectionId: string;
    photoUrl?: string;
    recipeImages?: string[];
    onPhotoChange?: (url: string | undefined) => void;
    placement?: string;
    placementOptions?: Array<{ id: string; label: string; hint?: string }>;
    onPlacementChange?: (id: string) => void;
    gridActive?: boolean;
    gridImages?: string[];
    onGridChange?: (urls: string[]) => void;
    onSelectGrid?: () => void;
    onExitGrid?: () => void;
    gridMax?: number;
  };
  coverEdit?: {
    side: "front" | "back" | "dedication";
    cover: CoverConfig;
    onChange: (cover: CoverConfig) => void;
    recipeImages?: string[];
  };
  /** Present when the focused full-page image-spread photo is being edited —
      enables drag-to-reposition, persisting the object-position focal point. */
  imageEdit?: {
    focusX: number;
    focusY: number;
    onChange: (focusX: number, focusY: number) => void;
    /** Zoom past the cover fit (1 = none), and its setter. Present means the
        photo can be zoomed as well as dragged. */
    zoom?: number;
    onZoomChange?: (zoom: number) => void;
    /** Current full-page photo + candidates, so the image page can host its own
        "Photo" control instead of the recipe card doing it off-page. */
    current?: string;
    images?: string[];
    onImageChange?: (url: string | undefined) => void;
    /** Recipe-photo placement (None/In-card/Full-page), shown inside the same
        dialog so the photo's placement and source live in one place. */
    placement?: string;
    placementOptions?: Array<{ id: string; label: string; hint?: string }>;
    onPlacementChange?: (id: string) => void;
  };
  tocKicker?: string;
  tocTitle?: string;
  tocEdit?: {
    kicker: string;
    title: string;
    onKickerChange: (value: string) => void;
    onTitleChange: (value: string) => void;
  };
  /** Which edge carries the binding gutter, used only when an export applies a
      format (verso→right, recto→left, single/cover→none). */
  gutterSide?: "left" | "right" | "none";
}) {
  const dims = PAGE_DIMS[size];
  const imageSource =
    sheet.layoutKind === "image"
      ? sheet.slots.find((slot): slot is ImageSheetSlot => slot?.kind === "image")?.imageUrl
      : undefined;
  // How far `cover` overshoots the page to fill it — 1 for a photo shaped like
  // the page, more for one being cropped. It says both whether there is crop to
  // drag through and how far this photo can zoom OUT, so it is read from the
  // real image once it loads.
  //
  // Stamped WITH the source it was measured from rather than reset by an effect
  // on `imageSource`: a cached photo (or a data URI) fires `load` before effects
  // run after mount, so a reset effect would wipe the measurement the load had
  // just taken and leave every such photo looking un-croppable — no drag, no
  // zoom out. Keying it instead means a stale measurement simply doesn't match
  // and reads as 1 until the new photo reports its own.
  const [measuredImage, setMeasuredImage] = useState<{ src?: string; cropRatio: number }>({
    cropRatio: 1,
  });
  const imageCropRatio = measuredImage.src === imageSource ? measuredImage.cropRatio : 1;
  const imageCanReposition = imageCropRatio > IMAGE_CROP_TOLERANCE;
  // Pinch (and ctrl/⌘ + wheel, which is the same event) zooms the full-page
  // photo. Bound natively rather than through React's `onWheel`, because React
  // registers wheel PASSIVELY at the root — a passive listener cannot
  // preventDefault, and without that a pinch zooms the whole browser page
  // instead of the picture. A plain wheel is left alone so the deck still
  // scrolls with the photo under the pointer.
  const zoomTargetRef = useRef<HTMLImageElement | null>(null);
  const minZoom = minZoomFor(imageCropRatio);
  const imageZoom = clampImageZoom(imageEdit?.zoom ?? IMAGE_ZOOM_FIT, minZoom);
  const onZoomChange = imageEdit?.onZoomChange;
  useEffect(() => {
    const node = zoomTargetRef.current;
    if (!node || !onZoomChange) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoomChange(zoomByWheel(imageZoom, event.deltaY, minZoom));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [onZoomChange, imageZoom, minZoom]);

  const anySlot = sheet.slots.find((slot): slot is SheetSlot => slot !== null) ?? null;
  if (!anySlot) return null;

  // Cookbook print-format geometry is applied only at EXPORT time, never on
  // screen: the book always PREVIEWS at plain Letter, and the chosen format is a
  // pure export concern (see the `.rp-exporting` print-only rules + the deck's
  // export vars in app/print/page.tsx / print.css). Each page still carries the
  // static `--book-*` / `rp-bind-*` hooks so an export has something to act on;
  // they're inert until a format is being exported. `--page-w/-h` stay Letter.
  const gutterClass = !cookbookMode
    ? ""
    : gutterSide === "left"
      ? "rp-bind-left"
      : gutterSide === "right"
        ? "rp-bind-right"
        : "";
  // Base class (paper bleed + binding side) plus the per-page bucket: `safe`
  // scales text into the margins; `art` fills the sheet so covers/photos bleed.
  const presetBaseClass = cookbookMode ? `recipe-print-preview--book-preset ${gutterClass}` : "";
  const presetSafeClass = cookbookMode ? "recipe-print-preview--book-safe" : "";
  const presetArtClass = cookbookMode ? "recipe-print-preview--book-art" : "";

  // ── Image-spread facing photo ────────────────────────────────────────────
  // A full-bleed photo alone on a letter page, facing the recipe's card page.
  if (sheet.layoutKind === "image") {
    const imageSlot = sheet.slots.find(
      (slot): slot is ImageSheetSlot => slot?.kind === "image",
    );
    if (!imageSlot) return null;
    // The live zoom: the cook's while editing, otherwise whatever the slot
    // carries — so preview, print and export all crop identically.
    const zoom = clampImageZoom(imageEdit?.zoom ?? imageSlot.zoom ?? IMAGE_ZOOM_FIT, minZoom);
    const focusX = imageEdit?.focusX ?? imageSlot.focusX ?? 50;
    const focusY = imageEdit?.focusY ?? imageSlot.focusY ?? 50;
    // A photo that exactly fits its page has no crop to drag around — until it
    // is zoomed, which gives it either crop to explore (in) or room to move on
    // the page (out). So any zoom off the fit makes it draggable.
    const repositionable = Boolean(imageEdit && (imageCanReposition || zoom !== IMAGE_ZOOM_FIT));
    return (
      <div
        className="recipe-page-scaler"
        style={{ "--page-scale": scale, "--page-w": `${dims.w}px`, "--page-h": `${dims.h}px` } as CSSProperties}
      >
        <div className="recipe-page-scaler__inner">
          <div
            className={`recipe-print-preview recipe-print-preview--letter ${presetBaseClass} ${presetArtClass}`}
            data-double-sided="false"
          >
            <div className={`recipe-card-set recipe-card-set--letter recipe-template--${template}`}>
              <div
                className={`recipe-card-page recipe-card-page--front recipe-card-page--image ${
                  isLastSheet ? "recipe-card-page--no-break" : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className={`recipe-image-spread__photo ${
                    repositionable ? "recipe-image-spread__photo--draggable" : ""
                  }`}
                  src={imageSlot.imageUrl}
                  alt=""
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  ref={zoomTargetRef}
                  style={{
                    objectPosition: `${focusX}% ${focusY}%`,
                    // Zoom scales about the same point the cook dragged to, so
                    // it closes on (or backs away from) what they framed rather
                    // than the middle of the page.
                    //
                    // Which way it scales depends on which side of the cover fit
                    // it is, and the difference matters: scaling a COVER-fitted
                    // photo below 1 would shrink the crop and its window
                    // together — a smaller version of the same crop, never a
                    // sight of what cover had cut off. So under the fit the
                    // photo switches to `contain` (the whole picture, letter-
                    // boxed) and is scaled back UP by exactly the amount cover
                    // was overshooting. The two meet seamlessly: at zoom 1,
                    // contain × cropRatio IS cover.
                    ...(zoom < IMAGE_ZOOM_FIT
                      ? {
                          objectFit: "contain" as const,
                          transform: `scale(${zoom * imageCropRatio})`,
                          transformOrigin: `${focusX}% ${focusY}%`,
                        }
                      : zoom > IMAGE_ZOOM_FIT
                        ? {
                            transform: `scale(${zoom})`,
                            transformOrigin: `${focusX}% ${focusY}%`,
                          }
                        : null),
                  }}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    markImageAvailable(image);
                    if (!image.naturalWidth || !image.naturalHeight) {
                      setMeasuredImage({ src: imageSlot.imageUrl, cropRatio: 1 });
                      return;
                    }
                    const imageAspect = image.naturalWidth / image.naturalHeight;
                    const frameAspect = dims.w / dims.h;
                    setMeasuredImage({
                      src: imageSlot.imageUrl,
                      cropRatio: Math.max(imageAspect / frameAspect, frameAspect / imageAspect),
                    });
                  }}
                  onError={(event) => {
                    setMeasuredImage({ src: imageSlot.imageUrl, cropRatio: 1 });
                    markImageUnavailable(event.currentTarget);
                  }}
                  onPointerDown={
                    repositionable && imageEdit
                      ? (event) =>
                          startFocalDrag(
                            event,
                            { x: imageEdit.focusX, y: imageEdit.focusY },
                            (point) => imageEdit.onChange(Math.round(point.x), Math.round(point.y)),
                          )
                      : undefined
                  }
                />
                <span className="photo-unavailable-message">Photo unavailable</span>
                {repositionable && (
                  <span className="recipe-image-spread__hint no-print">
                    {onZoomChange ? "Drag to reposition · pinch to zoom" : "Drag to reposition"}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Rendered OUTSIDE the scaled page — a sibling of the transformed
            __inner, not a descendant — so it keeps its true screen size and a
            clean hit region. Counter-scaling this control back up from inside the
            page transform left its clickable area out of sync with its painted
            box (and behaved differently across browsers). `.recipe-page-scaler`
            is sized to the on-screen page, so a plain top-right offset hugs the
            photo's corner. */}
        {/* Zoom, in the photo's own bottom corner and OUTSIDE the scaled page
            (see the note above the Photo control): buttons that are transform-
            scaled get hit regions that don't match what's painted. Pinch does
            the same job on a trackpad; this is the part you can find without
            knowing that. */}
        {onZoomChange && (
          <div className="recipe-image-spread__zoom no-print">
            <button
              type="button"
              aria-label="Zoom out"
              disabled={zoom <= minZoom}
              onClick={() => onZoomChange(clampImageZoom(zoom - IMAGE_ZOOM_STEP, minZoom))}
            >
              −
            </button>
            <span aria-live="polite">{formatImageZoom(zoom)}</span>
            <button
              type="button"
              aria-label="Zoom in"
              disabled={zoom >= IMAGE_ZOOM_MAX}
              onClick={() => onZoomChange(clampImageZoom(zoom + IMAGE_ZOOM_STEP, minZoom))}
            >
              +
            </button>
          </div>
        )}
        {imageEdit?.onImageChange && (
          <ImagePicker
            current={imageEdit.current}
            images={imageEdit.images ?? []}
            onSelect={imageEdit.onImageChange}
            placement={imageEdit.placement}
            placementOptions={imageEdit.placementOptions}
            onPlacementChange={imageEdit.onPlacementChange}
            label="Photo"
            className="recipe-image-spread__edit"
          />
        )}
      </div>
    );
  }

  // ── Section opener facing photo / grid ───────────────────────────────────
  // A full-page photo (or curated collage) alone on a letter page, facing its
  // chapter opener — the section-level counterpart to an image-spread. Reuses
  // the image-spread photo frame and the cover collage grid so section art and
  // cover art share one styling system. No focal-drag here (the opener owns the
  // section's edit controls on the facing divider page).
  if (anySlot.kind === "section-photo") {
    const gridLayout =
      anySlot.mode === "grid" ? photoGridLayout(anySlot.gridImages?.length ?? 0) : null;
    return (
      <div
        className="recipe-page-scaler"
        style={{ "--page-scale": scale, "--page-w": `${dims.w}px`, "--page-h": `${dims.h}px` } as CSSProperties}
      >
        <div className="recipe-page-scaler__inner">
          <div
            className={`recipe-print-preview recipe-print-preview--letter ${presetBaseClass} ${presetArtClass}`}
            data-double-sided="false"
          >
            <div className={`recipe-card-set recipe-card-set--letter recipe-template--${template}`}>
              <div
                className={`recipe-card-page recipe-card-page--front recipe-card-page--image ${
                  isLastSheet ? "recipe-card-page--no-break" : ""
                }`}
              >
                {anySlot.mode === "full" && anySlot.photoUrl ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="recipe-image-spread__photo"
                      src={anySlot.photoUrl}
                      alt=""
                      draggable={false}
                      loading="lazy"
                      decoding="async"
                      onLoad={(event) => markImageAvailable(event.currentTarget)}
                      onError={(event) => markImageUnavailable(event.currentTarget)}
                    />
                    <span className="photo-unavailable-message">Photo unavailable</span>
                  </>
                ) : anySlot.mode === "grid" && gridLayout ? (
                  <div
                    className="recipe-card__cover-photo recipe-card__cover-photo--grid"
                    style={{ "--cover-grid-cols": gridLayout.columns } as CSSProperties}
                    aria-hidden
                  >
                    {(anySlot.gridImages ?? []).map((url, index) => (
                      <span
                        key={`${url}-${index}`}
                        className={`recipe-card__cover-grid-cell ${
                          gridLayout.firstSpans && index === 0 ? "recipe-card__cover-grid-img--wide" : ""
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" draggable={false} className="recipe-card__cover-grid-img" onLoad={(event) => markImageAvailable(event.currentTarget)} onError={(event) => markImageUnavailable(event.currentTarget)} />
                        <span className="photo-unavailable-message">Photo unavailable</span>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
        {/* Outside the scaled page, hugging the art's corner — see the
            image-spread note above for why it can't live inside the transform.
            The chapter's art is edited by clicking the art. */}
        {sectionArtEdit?.sectionId === anySlot.sectionId && sectionArtEdit.onPhotoChange && (
          <ImagePicker
            current={sectionArtEdit.photoUrl}
            images={sectionArtEdit.recipeImages ?? []}
            onSelect={sectionArtEdit.onPhotoChange}
            placement={sectionArtEdit.placement}
            placementOptions={sectionArtEdit.placementOptions}
            onPlacementChange={sectionArtEdit.onPlacementChange}
            gridActive={sectionArtEdit.gridActive}
            gridImages={sectionArtEdit.gridImages}
            onGridChange={sectionArtEdit.onGridChange}
            onSelectGrid={sectionArtEdit.onSelectGrid}
            onExitGrid={sectionArtEdit.onExitGrid}
            gridMax={sectionArtEdit.gridMax}
            label="Photo"
            className="recipe-image-spread__edit"
          />
        )}
      </div>
    );
  }

  // Divider and cover sheets are always a single slot, single-sided, on their
  // own dedicated page — render the whole sheet as one face rather than the
  // front/back card-page structure below, which only recipes need.
  if (anySlot.kind === "divider" || anySlot.kind === "cover" || anySlot.kind === "toc") {
    // A cover/back is art-dominant (fill the sheet, bleed the artwork); a TOC or
    // text divider is text-dominant (scale into the safe area over bleeding
    // paper).
    const bucketClass = anySlot.kind === "cover" ? presetArtClass : presetSafeClass;
    return (
      <div
        className="recipe-page-scaler"
        style={{ "--page-scale": scale, "--page-w": `${dims.w}px`, "--page-h": `${dims.h}px` } as CSSProperties}
      >
        <div className="recipe-page-scaler__inner">
          <div
            className={`recipe-print-preview recipe-print-preview--${size} ${presetBaseClass} ${bucketClass}`}
            data-double-sided="false"
          >
            <div className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}>
              <div className={`recipe-card-page recipe-card-page--front ${isLastSheet ? "recipe-card-page--no-break" : ""}`}>
                {anySlot.kind === "divider" && template === "bistro" && cookbookMode && (
                  <BistroCheckerSpine className="recipe-card-page__spine" />
                )}
                {anySlot.kind === "divider" ? (
                  <DividerFace
                    title={anySlot.title}
                    recipeTitles={anySlot.recipeTitles}
                    chapterNumber={anySlot.chapterNumber}
                    showChapterNumber={anySlot.showChapterNumber}
                    subtitle={anySlot.subtitle}
                    photoUrl={anySlot.photoUrl}
                    intro={anySlot.intro}
                    template={template}
                    showDecoration={showDecoration}
                    inlineEdit={dividerEdit?.sectionId === anySlot.id ? dividerEdit : undefined}
                  />
                ) : anySlot.kind === "toc" ? (
                  <TableOfContentsFace
                    entries={anySlot.entries}
                    kicker={tocKicker}
                    title={tocTitle}
                    continued={anySlot.continued}
                    template={template}
                    showDecoration={showDecoration}
                    inlineEdit={tocEdit}
                  />
                ) : (
                  <CoverFace
                    cover={anySlot.cover}
                    side={anySlot.side}
                    template={template}
                    showDecoration={showDecoration}
                    inlineEdit={coverEdit?.side === anySlot.side ? coverEdit : undefined}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // The very last physical page of the whole print job shouldn't request a
  // page break after itself — otherwise the print pipeline can add a
  // trailing blank page. Rather than lean on a CSS `:last-child` selector to
  // work out which page that is (which depends on the print engine
  // correctly matching a structural pseudo-selector — not something we've
  // been able to rely on), the page that's actually last is passed down and
  // marked directly: the back group if this sheet prints one, else the front.
  const lastGroupIsBack = isLastSheet && sheet.backGroupNeeded;
  const lastGroupIsFront = isLastSheet && !sheet.backGroupNeeded;

  return (
    <div
      className="recipe-page-scaler"
      style={
        {
          "--page-scale": scale,
          "--page-w": `${dims.w}px`,
          "--page-h": `${dims.h}px`,
        } as CSSProperties
      }
    >
      <div className="recipe-page-scaler__inner">
        <div
          className={`recipe-print-preview recipe-print-preview--${size} ${presetBaseClass} ${presetSafeClass} ${
            showCutLines ? "recipe-print-preview--cut-lines" : ""
          }`}
          data-double-sided={doubleSided ? "true" : "false"}
        >
          <div
            className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}
          >
            <div
              className={`recipe-card-page recipe-card-page--front ${
                lastGroupIsFront ? "recipe-card-page--no-break" : ""
              }`}
              data-preview-hidden={activeSide !== "front" ? "true" : undefined}
            >
              {sheet.pageNumber !== undefined && (
                <>
                  {sheet.runningHeader && (
                    <div className="recipe-book-runhead" aria-hidden>
                      {sheet.runningHeader}
                    </div>
                  )}
                  <div className="recipe-book-folio" aria-hidden>
                    {sheet.pageNumber}
                  </div>
                </>
              )}
              {/* Page-level copy of bistro's checker spine, drawn OUTSIDE the
                  transform-scaled card so a spiral export doesn't rasterize the
                  vector (see print.css `.rp-coil …__spine`). Shown only at spiral
                  export; the in-card spine covers screen + hardcover. */}
              {template === "bistro" && cookbookMode && (
                <BistroCheckerSpine className="recipe-card-page__spine" />
              )}
              {sheet.slots.map((slot, slotIndex) =>
                // `slot` is only ever null here in principle (this branch's
                // one recipe slot is always filled by the time a sheet
                // exists) — kept as a guard rather than assumed. Blank cards
                // are only for the back side, to keep a duplex job's
                // physical page count in sync (see `backGroupNeeded`), not
                // for the front.
                slot && slot.kind === "recipe" ? (
                  <RecipeCardFace
                    key={`front-${slotIndex}`}
                    recipe={slot.recipe}
                    ingredients={slot.front.ingredients}
                    instructions={slot.front.instructions}
                    side="front"
                    showHeader={!slot.isContinuation}
                    layout={slot.front.layout}
                    contentScale={slot.front.contentScale}
                    hasBackFace={slot.hasBack}
                    showImage={slot.showPhoto}
                    photoOnFacingPage={slot.hidePhoto}
                    showSourceUrl={showSourceUrl}
                    continued={slot.isContinuation}
                    template={template}
                    showDecoration={showDecoration}
                    cookbookMode={cookbookMode}
                    previewHidden={slotIndex !== activeSlotIndex || activeSide !== "front"}
                    inlineEdit={
                      activeSide === "front" &&
                      slotIndex === activeSlotIndex
                        ? inlineEdit
                        : undefined
                    }
                  />
                ) : null,
              )}
            </div>
            {sheet.backGroupNeeded && (
              <div
                className={`recipe-card-page recipe-card-page--back ${
                  lastGroupIsBack ? "recipe-card-page--no-break" : ""
                }`}
                data-preview-hidden={activeSide !== "back" ? "true" : undefined}
              >
                {sheet.slots.map((slot, slotIndex) => {
                  if (!slot || slot.kind !== "recipe") return null;

                  return slot.back ? (
                    <RecipeCardFace
                      key={`back-${slotIndex}`}
                      recipe={slot.recipe}
                      ingredients={slot.back.ingredients}
                      instructions={slot.back.instructions}
                      side="back"
                      showHeader={false}
                      layout={slot.back.layout}
                      contentScale={slot.back.contentScale}
                      hasBackFace={slot.hasBack}
                      template={template}
                      showDecoration={showDecoration}
                      cookbookMode={cookbookMode}
                      continued
                      previewHidden={slotIndex !== activeSlotIndex || activeSide !== "back"}
                      inlineEdit={
                        activeSide === "back" &&
                        slotIndex === activeSlotIndex
                          ? inlineEdit
                          : undefined
                      }
                    />
                  ) : (
                    <RecipeCardFace
                      key={`back-blank-${slotIndex}`}
                      recipe={slot.recipe}
                      ingredients={[]}
                      instructions={[]}
                      side="back"
                      showHeader={false}
                      layout="standard"
                      hasBackFace={false}
                      template={template}
                      blank
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
