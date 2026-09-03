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
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  IMAGE_ZOOM_STEP,
  IMAGE_ZOOM_STEPS,
  clampImageZoom,
} from "@/lib/imageZoom";
import { ZoomControl } from "@/components/print/ZoomControl";
import { markImageAvailable, markImageUnavailable } from "@/lib/imageFailure";
import { PAGE_DIMS } from "@/lib/printGeometry";
import {
  getCookbookPreset,
  presetCardDims,
  presetCardVars,
} from "@/lib/cookbookPresets";
import type { CookbookPresetId } from "@/types/recipe";
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
  showDescription,
  showCutLines,
  showDecoration = true,
  cookbookMode = false,
  showEmptyFields = false,
  inlineEdit,
  dividerEdit,
  coverEdit,
  imageEdit,
  tocKicker,
  tocTitle,
  tocEdit,
  gutterSide = "none",
  preset,
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
  showDescription: boolean;
  cookbookMode?: boolean;
  /** Reveal the fields a recipe does not have yet — see RecipeCardPrint. */
  showEmptyFields?: boolean;
  showCutLines: boolean;
  /** False for the rail thumbnails, whose ~1/11 scale renders the templates'
      decorative motifs sub-pixel — print.css paints a flat stand-in instead.
      See `TemplateDecoration` in components/RecipeCardPrint.tsx. */
  showDecoration?: boolean;
  inlineEdit?: RecipeCardInlineEdit;
  dividerEdit?: {
    sectionId: string;
    titleEditing: boolean;
    titleValue: string;
    onTitleOpen: () => void;
    onTitleChange: (value: string) => void;
    onTitleCommit: () => void;
    onTitleCancel: () => void;
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
  /** The book's print format. In cookbook mode the page IS this preset's sheet
      — see `presetCardDims`. Ignored outside cookbook mode, where a card is a
      card and the paper it prints on is the print dialog's business. */
  preset?: CookbookPresetId;
}) {
  // A cookbook page is the preset's real sheet, on screen exactly as in the
  // file — so the preview cannot show a page shape the book does not have (see
  // `presetCardDims`). A plain card project keeps its own fixed page.
  const bookPreset = getCookbookPreset(preset);
  const dims = cookbookMode ? presetCardDims(bookPreset) : PAGE_DIMS[size];
  const cardVars = cookbookMode ? (presetCardVars(bookPreset) as CSSProperties) : undefined;
  const imageSource =
    sheet.layoutKind === "image"
      ? sheet.slots.find((slot): slot is ImageSheetSlot => slot?.kind === "image")?.imageUrl
      : undefined;
  const [imageCanReposition, setImageCanReposition] = useState(false);
  useEffect(() => {
    setImageCanReposition(false);
  }, [imageSource]);
  // Pinch (and ctrl/⌘ + wheel, which is the same event) zooms the full-page
  // photo. Bound natively rather than through React's `onWheel`, because React
  // registers wheel PASSIVELY at the root — a passive listener cannot
  // preventDefault, and without that a pinch zooms the whole browser page
  // instead of the picture. A plain wheel is left alone so the deck still
  // scrolls with the photo under the pointer.
  /**
   * A pinch anywhere on the deck zooms the DECK, photo included.
   *
   * This used to intercept ctrl/⌘+wheel over a full-page picture and zoom the
   * picture instead, stopping the event before the deck saw it. It was an
   * honest attempt at "whatever is under the pointer wins", and it made the
   * gesture mean two different things a few hundred pixels apart — pinch over
   * the page and the book scales, drift onto the photo and the book stops
   * while the photo grows inside it. On a page that IS a photo, the boundary
   * was invisible.
   *
   * The photo keeps its own zoom, on the Photo zoom stepper below, where it is
   * labelled and reversible. The trackpad now only ever means the artboard.
   */
  const onZoomChange = imageEdit?.onZoomChange;

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
    const zoom = clampImageZoom(imageEdit?.zoom ?? imageSlot.zoom ?? 1);
    // A photo that exactly fits its page has no crop to drag around — until it
    // is zoomed in, which creates that travel. So zoom decides this too.
    const repositionable = Boolean(imageEdit && (imageCanReposition || zoom > IMAGE_ZOOM_MIN));
    return (
      <div
        className="recipe-page-scaler"
        style={{ "--page-scale": scale, "--page-w": `${dims.w}px`, "--page-h": `${dims.h}px` } as CSSProperties}
      >
        <div className="recipe-page-scaler__inner">
          <div
            className={`recipe-print-preview recipe-print-preview--letter ${presetBaseClass} ${presetArtClass}`}
            style={cardVars}
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
                  style={{
                    objectPosition: `${imageEdit?.focusX ?? imageSlot.focusX ?? 50}% ${
                      imageEdit?.focusY ?? imageSlot.focusY ?? 50
                    }%`,
                    // Zoom magnifies about the same point the cook dragged to,
                    // so zooming in closes on what they framed rather than on
                    // the middle of the page.
                    ...(zoom > 1
                      ? {
                          transform: `scale(${zoom})`,
                          transformOrigin: `${imageEdit?.focusX ?? imageSlot.focusX ?? 50}% ${
                            imageEdit?.focusY ?? imageSlot.focusY ?? 50
                          }%`,
                        }
                      : null),
                  }}
                  onLoad={(event) => {
                    const image = event.currentTarget;
                    markImageAvailable(image);
                    if (!image.naturalWidth || !image.naturalHeight) {
                      setImageCanReposition(false);
                      return;
                    }
                    const imageAspect = image.naturalWidth / image.naturalHeight;
                    const frameAspect = dims.w / dims.h;
                    const cropRatio = Math.max(imageAspect / frameAspect, frameAspect / imageAspect);
                    // Ignore tiny rounding/aspect differences that technically
                    // crop a sliver but don't create useful drag travel.
                    setImageCanReposition(cropRatio > 1.015);
                  }}
                  onError={(event) => {
                    setImageCanReposition(false);
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
                    {/* Just the drag. Pinching stopped zooming the photo when a
                        pinch became one thing everywhere on the deck, and the
                        hint outlived it — offering a gesture that now does
                        something else entirely. Photo zoom is the stepper. */}
                    Drag to reposition
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
          <ZoomControl
            className="recipe-image-spread__zoom"
            compact
            label="Photo zoom"
            value={zoom}
            min={IMAGE_ZOOM_MIN}
            max={IMAGE_ZOOM_MAX}
            presets={IMAGE_ZOOM_STEPS}
            presetNote={(step) => (step === IMAGE_ZOOM_MIN ? "Fit" : undefined)}
            onStep={(direction) =>
              onZoomChange(clampImageZoom(zoom + direction * IMAGE_ZOOM_STEP))
            }
            onSet={(next) => onZoomChange(clampImageZoom(next))}
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
            style={cardVars}
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
            style={cardVars}
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
                    showEmptyFields={showEmptyFields}
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
                    showEmptyFields={showEmptyFields}
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
          style={cardVars}
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
              {/* Book furniture, so it prints only in a book. Every sheet is
                  numbered in both modes — the strip below the deck says which
                  page you are on for recipe cards too — but a stack of cards is
                  not paginated: they get cut apart, stuck to a fridge, handed to
                  someone. A folio in the corner of one is furniture from a
                  different object. Numbering stopped implying a book when it was
                  decoupled from the contents, and this is the other half of that
                  change: the sheet knows its number, the page decides whether to
                  print it.

                  A photo page has a number and still shows nothing — a full-bleed
                  picture with a numeral over it is not a book, it's a mistake.
                  `layoutKind` is what makes it a photo page. */}
              {cookbookMode && sheet.pageNumber !== undefined && !sheet.layoutKind && (
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
                    showDescription={showDescription}
                    continued={slot.isContinuation}
                    template={template}
                    showDecoration={showDecoration}
                    cookbookMode={cookbookMode}
                    showEmptyFields={showEmptyFields}
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
                      showEmptyFields={showEmptyFields}
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
