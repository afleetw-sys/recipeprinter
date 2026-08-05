"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import type { AccountSaveStatus } from "@/components/AccountControl";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { PrintDialogs } from "@/components/PrintDialogs";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";
import { CookbookBuildReveal, CookbookWelcomeDialog } from "@/components/CookbookWelcomeDialog";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import { OrganizeCookbookDialog } from "@/components/OrganizeCookbookDialog";
import { Select } from "@/components/Select";
import { ImagePicker } from "@/components/ImagePicker";
import { Dialog } from "@/components/Dialog";
import { useModalFocus } from "@/components/useModalFocus";
import {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  RecipeCardFace,
  DividerFace,
  CoverFace,
  TableOfContentsFace,
  type RecipeCardInlineEdit,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import {
  usePrintSheets,
  type NavItem,
  type PageSheet,
  type SheetSlot,
  type ImageSheetSlot,
} from "@/lib/usePrintSheets";
import {
  buildSections,
  namedSectionCount,
  useProjectMeta,
  type ProjectMeta,
  type PhotoStyle,
} from "@/lib/project";
import { materializeProjectPhotos } from "@/lib/photoStorage";
import {
  createPrintProjectId,
  savePrintProject,
  assemblePrintProject,
  loadPrintProject,
  PrintProjectConflictError,
} from "@/lib/printProjects";
import { adoptAnonymousProject, readAdoptionManifest } from "@/lib/anonymousProjectAdoption";
import { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import { startFocalDrag } from "@/lib/focalDrag";
import { useDeckScroller } from "@/lib/useDeckScroller";
import { usePremiumTemplatePurchase } from "@/lib/usePremiumTemplatePurchase";
import { useCookbookPurchase } from "@/lib/useCookbookPurchase";
import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
import {
  DEFAULT_COOKBOOK_PRESET_ID,
  getCookbookPreset,
  gutterSideForRole,
  presetArtScale,
  presetCardScale,
  presetInsets,
} from "@/lib/cookbookPresets";
import { localStore } from "@/lib/storage";
import { track } from "@/lib/analytics";
import {
  organizationSectionsForApply,
  suggestCookbookOrganization,
  type CookbookOrganizationDraft,
} from "@/lib/cookbookOrganizer";
import {
  CheckIcon,
  BookIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CrownIcon,
  EditIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  PrintIcon,
  ReorderIcon,
  SettingsIcon,
  SizeIcon,
  SpinnerIcon,
  TemplateIcon,
  XIcon,
} from "@/components/icons";
import { isPremiumTemplate } from "@/lib/premiumTemplates";
import { hasTemplateEntitlement } from "@/lib/recipePrinterPurchases";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import {
  loadRecipePrinterUserProfile,
  type RecipePrinterFreeTemplateStatus,
} from "@/lib/recipePrinterFreeTemplateClaim";
import {
  createCurrentPrintJob,
  readCurrentPrintJobIds,
  readQueue,
  useQueue,
} from "@/lib/queue";
import {
  isPrintCardSize,
  isRecipePrintTemplate,
  usePrintSettingsPersistence,
} from "@/lib/printSettings";
import type { CookbookPresetId, CoverConfig, PrintProject, QueueItem, Recipe } from "@/types/recipe";
import { postPrintPrompt, purchaseGate, type PostPrintAction } from "@/lib/purchaseAccess";
import {
  markPrintPreviewStable,
  PRINT_PREVIEW_STABILITY_MS,
} from "@/lib/printErrorRecovery";

const AdminShareLinkDialog = dynamic(
  () => import("@/components/AdminShareLinkDialog").then((mod) => mod.AdminShareLinkDialog),
  { ssr: false, loading: () => null },
);

const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:post-print-dialog:last-shown:v1";
const UNPROTECTED_PURCHASE_STORAGE_KEY = "recipeprinter:unprotected-purchase:v1";


// Real card dimensions in CSS px (96px per inch), used only to size the
// on-screen scaler/thumbnails so a card looks true-to-size, just smaller.
// Matches --recipe-card-width/-min-height in globals.css: 0.125in per side
// smaller than the nominal "6x4"/"Letter" label, a safety margin for real
// printers' hardware non-printable edge (see that variable's comment).
const PAGE_DIMS: Record<PrintCardSize, { w: number; h: number }> = {
  letter: { w: 8.25 * 96, h: 10.75 * 96 },
  "card-6x4": { w: 5.75 * 96, h: 3.75 * 96 },
};

// Rail thumbnails target a fixed width so they always fit the rail column,
// regardless of page aspect ratio (letter portrait vs. 6x4 landscape).
const RAIL_THUMB_WIDTH = 112;
// The rail thumbnail zooms past fit-to-width and crops (see the
// `.recipe-page-rail__thumb .recipe-page-scaler` rule) so it reads as a real
// mini card — the top-left of the page — rather than a whole card shrunk to a
// stamp. Keep the crop box (74px) in sync with the CSS.
const RAIL_THUMB_ZOOM = 1.7;
const RAIL_SCALE: Record<PrintCardSize, number> = {
  letter: (RAIL_THUMB_WIDTH / PAGE_DIMS.letter.w) * RAIL_THUMB_ZOOM,
  "card-6x4": (RAIL_THUMB_WIDTH / PAGE_DIMS["card-6x4"].w) * RAIL_THUMB_ZOOM,
};

// Per-recipe cookbook page-layout choices. `full` = a plain full-page card;
// `image-spread` = the card facing a full-bleed photo page. A cookbook always
// gives each recipe its own full page.
// The single "how does this recipe show its photo" axis — the book-wide default
// (Print setup) and the per-recipe override both use these exact three options,
// so there's one vocabulary rather than a layout picker + a separate on/off
// toggle. `short` is the compact label for the per-page control.
const PHOTO_STYLE_OPTIONS: Array<{ id: PhotoStyle; label: string; short: string; hint: string }> = [
  { id: "none", label: "None", short: "None", hint: "No recipe photos" },
  { id: "card", label: "In the recipe card", short: "In card", hint: "A photo in each card’s header" },
  { id: "full", label: "Full page", short: "Full page", hint: "A full-page photo facing each recipe" },
];

// Tiny page illustration for each photo style — a blank card, a card with a
// header photo, and a full-page facing photo — so the choice reads at a glance.
function PhotoStylePreview({ id }: { id: PhotoStyle }) {
  const lines = (
    <>
      <span className="recipe-photo-preview__line" />
      <span className="recipe-photo-preview__line" />
      <span className="recipe-photo-preview__line recipe-photo-preview__line--short" />
    </>
  );
  if (id === "full") {
    return (
      <span className="recipe-photo-preview recipe-photo-preview--spread" aria-hidden>
        <span className="recipe-photo-preview__page recipe-photo-preview__page--photo" />
        <span className="recipe-photo-preview__page">{lines}</span>
      </span>
    );
  }
  return (
    <span className="recipe-photo-preview" aria-hidden>
      <span className="recipe-photo-preview__page">
        {id === "card" && <span className="recipe-photo-preview__photo" />}
        {lines}
      </span>
    </span>
  );
}

// A short, generic recipe used only to fill each theme's picker preview. Kept
// intentionally small so it lays out as a clean single front face at 6x4.
const THUMB_RECIPE: Recipe = {
  title: "Lemon Pasta",
  servings: 4,
  totalTime: "25 min",
  ingredients: [
    { name: "12 oz spaghetti" },
    { name: "2 lemons, zested and juiced" },
    { name: "1 cup grated parmesan" },
    { name: "3 tbsp olive oil" },
    { name: "2 cloves garlic, minced" },
    { name: "Fresh basil and black pepper" },
  ],
  instructions: [
    { step: 1, text: "Boil the spaghetti until al dente, then drain." },
    { step: 2, text: "Toss with olive oil, garlic, and lemon." },
    { step: 3, text: "Finish with parmesan, basil, and pepper." },
  ],
};

// The theme picker thumbnails render the *real* card (the same RecipeCardFace
// the print output uses) shrunk to fit, rather than a hand-built HTML mockup
// styled to approximate it. The mockups drifted from the real templates —
// different spacing, stray image placeholders, a BBQ preview that didn't look
// like the BBQ card — because nothing kept them in sync. A scaled real card
// can't drift: it *is* the template.
const TEMPLATE_THUMB_SIZE: PrintCardSize = "card-6x4";
// A whole 6x4 card shrunk to a ~110px picker cell renders its type too small to
// read. Instead the thumbnail zooms *past* fit-to-width (`ZOOM`) and crops to a
// fixed height (`HEIGHT`, px) anchored at the card's top-left — so the preview
// shows the header and first rows at a legible size, with the right/bottom
// edges running off under a soft mask fade. Bumping ZOOM trades how much of the
// card is visible for how large the type reads.
const TEMPLATE_THUMB_ZOOM = 1.95;
const TEMPLATE_THUMB_HEIGHT = 86;

function TemplateThumbnail({ template }: { template: RecipePrintTemplate }) {
  const dims = PAGE_DIMS[TEMPLATE_THUMB_SIZE];
  const ref = useRef<HTMLDivElement | null>(null);
  // Fit the fixed-size real card to whatever width the picker cell happens to
  // be (it varies with panel/drawer width), the same transform-scale trick
  // ScaledPage uses, then zoom in past that fit. Starts at a sensible guess so
  // first paint is close; the observer sets the exact scale from the measured
  // cell width.
  const [scale, setScale] = useState(0.22 * TEMPLATE_THUMB_ZOOM);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setScale((w / dims.w) * TEMPLATE_THUMB_ZOOM);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [dims.w]);

  return (
    <div ref={ref} className="recipe-template-option__thumb" aria-hidden>
      <div
        className="recipe-page-scaler recipe-template-option__scaler"
        style={
          {
            "--page-scale": scale,
            "--page-w": `${dims.w}px`,
            "--page-h": `${dims.h}px`,
            height: `${TEMPLATE_THUMB_HEIGHT}px`,
          } as CSSProperties
        }
      >
        <div className="recipe-page-scaler__inner">
          <div className={`recipe-print-preview recipe-print-preview--${TEMPLATE_THUMB_SIZE}`}>
            <div
              className={`recipe-card-set recipe-card-set--${TEMPLATE_THUMB_SIZE} recipe-template--${template}`}
            >
              <div className="recipe-card-page recipe-card-page--front">
                <RecipeCardFace
                  recipe={THUMB_RECIPE}
                  ingredients={THUMB_RECIPE.ingredients}
                  instructions={THUMB_RECIPE.instructions}
                  side="front"
                  showHeader
                  layout="standard"
                  hasBackFace={false}
                  showImage={false}
                  template={template}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Recipe cards / Cookbook segmented switch. Each option hugs its own content;
 *  a single ink "thumb" measures the active option and slides+resizes to it, so
 *  the transition reads as one control moving between the two. */
function ModeSwitch({
  inCookbook,
  onSwitchToCards,
  onSwitchToCookbook,
}: {
  inCookbook: boolean;
  onSwitchToCards: () => void;
  onSwitchToCookbook: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    function measure() {
      const active = root!.querySelector<HTMLElement>(".recipe-mode-switch__option.is-active");
      // Ignore 0-width reads (pre-layout / fonts still loading / hidden on
      // mobile) — the ResizeObserver re-fires once the real size lands.
      if (active && active.offsetWidth > 0) {
        setThumb({ left: active.offsetLeft, width: active.offsetWidth });
      }
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    if (document.fonts?.ready) document.fonts.ready.then(measure).catch(() => undefined);
    return () => observer.disconnect();
  }, [inCookbook]);

  return (
    <div
      className={`recipe-mode-switch ${thumb ? "recipe-mode-switch--ready" : ""}`}
      role="group"
      aria-label="Layout"
      ref={rootRef}
    >
      {thumb && (
        <span
          className="recipe-mode-switch__thumb"
          aria-hidden
          style={{ transform: `translateX(${thumb.left}px)`, width: `${thumb.width}px` }}
        />
      )}
      <button
        type="button"
        className={`recipe-mode-switch__option ${inCookbook ? "" : "is-active"}`}
        aria-pressed={!inCookbook}
        onClick={inCookbook ? onSwitchToCards : undefined}
      >
        Recipe cards
      </button>
      <button
        type="button"
        className={`recipe-mode-switch__option ${inCookbook ? "is-active" : ""}`}
        aria-pressed={inCookbook}
        onClick={inCookbook ? undefined : onSwitchToCookbook}
      >
        Cookbook
        <span className="recipe-mode-switch__badge">New</span>
      </button>
    </div>
  );
}

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
const ScaledPage = memo(function ScaledPage({
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
    /** Current full-page photo + candidates, so the image page can host its own
        "Change photo" control instead of the recipe card doing it off-page. */
    current?: string;
    images?: string[];
    onImageChange?: (url: string | undefined) => void;
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
  const [imageCanReposition, setImageCanReposition] = useState(false);
  useEffect(() => {
    setImageCanReposition(false);
  }, [imageSource]);

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
    const repositionable = Boolean(imageEdit && imageCanReposition);
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
                  style={{
                    objectPosition: `${imageEdit?.focusX ?? imageSlot.focusX ?? 50}% ${
                      imageEdit?.focusY ?? imageSlot.focusY ?? 50
                    }%`,
                  }}
                  onLoad={(event) => {
                    const image = event.currentTarget;
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
                {repositionable && (
                  <span className="recipe-image-spread__hint no-print">Drag to reposition</span>
                )}
                {imageEdit?.onImageChange && (
                  <ImagePicker
                    current={imageEdit.current}
                    images={imageEdit.images ?? []}
                    onSelect={imageEdit.onImageChange}
                    label="Change photo"
                    className="recipe-image-spread__edit"
                  />
                )}
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
            data-double-sided="false"
          >
            <div className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}>
              <div className={`recipe-card-page recipe-card-page--front ${isLastSheet ? "recipe-card-page--no-break" : ""}`}>
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
                    template={template}
                    showDecoration={showDecoration}
                    inlineEdit={tocEdit}
                  />
                ) : (
                  <CoverFace
                    cover={anySlot.cover}
                    side={anySlot.side}
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

function shouldShowPostPrintDialog() {
  return localStore.get(POST_PRINT_DIALOG_STORAGE_KEY) === null;
}

function markPostPrintDialogShown() {
  localStore.set(POST_PRINT_DIALOG_STORAGE_KEY, "1");
}

function initialPrintCardSize(value: string | null): PrintCardSize {
  return isPrintCardSize(value) ? value : "letter";
}

function initialRecipePrintTemplate(value: string | null): RecipePrintTemplate {
  return isRecipePrintTemplate(value) ? value : "classic";
}

export default function PrintPage() {
  useEffect(() => {
    const stableTimer = window.setTimeout(markPrintPreviewStable, PRINT_PREVIEW_STABILITY_MS);
    return () => window.clearTimeout(stableTimer);
  }, []);

  const router = useRouter();
  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const accountProjectId = params.get("project");
  const shouldPrint = params.get("print") === "1";
  // Set by the /print/[slug] loader after seeding a shared recipe into this
  // session's queue — there's nothing behind this tab to go back to.
  const cameFromSharedLink = params.get("shared") === "1";
  // One back affordance for every viewport: desktop header and the mobile
  // topbar both call this, so "back" always resolves to the same destination
  // instead of desktop doing history.back() while mobile hard-linked to "/".
  // A shared-link tab has no meaningful history, so it goes home instead.
  const handleBack = () => {
    if (cameFromSharedLink) router.push("/");
    else router.back();
  };
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [cardSize, setCardSize] = useState<PrintCardSize>(() =>
    initialPrintCardSize(params.get("size")),
  );
  const [template, setTemplate] = useState<RecipePrintTemplate>(() =>
    initialRecipePrintTemplate(params.get("template")),
  );
  const [doubleSided, setDoubleSided] = useState(true);
  const [showCutLines, setShowCutLines] = useState(false);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSourceUrl, setShowSourceUrl] = useState(false);
  const [showDonateDialog, setShowDonateDialog] = useState(false);
  const [showCookbookOfferDialog, setShowCookbookOfferDialog] = useState(false);
  const [cookbookBuilding, setCookbookBuilding] = useState(false);
  // Re-entering an already-built book: a plain loading spinner (not the first-run
  // build animation) while the stashed layout swaps back in.
  const [cookbookRestoring, setCookbookRestoring] = useState(false);
  const [showCookbookPrintDialog, setShowCookbookPrintDialog] = useState(false);
  // True only when the cookbook print dialog was reached via a fresh purchase
  // (not a re-export), so it can lead with a one-time "your cookbook is ready"
  // celebration instead of the plain "print your cookbook" framing.
  const [cookbookJustPurchased, setCookbookJustPurchased] = useState(false);
  const [showExitCookbookConfirm, setShowExitCookbookConfirm] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showAddRecipeDialog, setShowAddRecipeDialog] = useState(false);
  const [showOrganizeCookbook, setShowOrganizeCookbook] = useState(false);
  const [organizationUndo, setOrganizationUndo] = useState<ProjectMeta["sections"] | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "recipe"; id: string; title: string }
    | { kind: "section"; id: string; title: string; recipeIds: string[] }
    | { kind: "cover"; side: "front" | "back" | "dedication"; title: string }
    | null
  >(null);
  const [pendingFocusRecipeId, setPendingFocusRecipeId] = useState<string | null>(null);
  const [pendingFocusNavId, setPendingFocusNavId] = useState<string | null>(null);
  // The recipe whose rail row is currently shaking, set when a re-imported
  // duplicate points back at a recipe already in this deck. `nonce` lets the
  // same recipe re-shake on a repeat import (a bare id wouldn't change).
  const [railShake, setRailShake] = useState<{ recipeId: string; nonce: number } | null>(null);
  const queue = useQueue();
  const projectMeta = useProjectMeta();
  // The section/cover/title organizational layer, joined against the working
  // `items` snapshot below (see lib/project.ts) — recipe content itself stays
  // owned by `items`/the queue, unchanged from today.
  const sections = useMemo(() => buildSections(items ?? [], projectMeta.meta), [items, projectMeta.meta]);
  useEffect(() => {
    if (items) projectMeta.syncSections(sections);
    // Only re-run when the computed sections actually change shape; syncSections
    // itself is a stable no-op once meta already reflects `sections`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");
  const [editingCoverSide, setEditingCoverSide] = useState<
    "front" | "back" | "dedication" | null
  >(null);
  const [editingToc, setEditingToc] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  // Cmd/Ctrl-click multi-select in the rail (cookbook mode): the set of selected
  // recipe ids and whether the bulk-action menu is open.
  const [selectedRailIds, setSelectedRailIds] = useState<Set<string>>(() => new Set());
  // The last recipe clicked, used as the anchor for Shift-click range selection.
  const [railAnchorId, setRailAnchorId] = useState<string | null>(null);
  const [railBulkMenu, setRailBulkMenu] = useState<null | "root" | "move">(null);
  const railBulkRef = useRef<HTMLDivElement | null>(null);
  const [pendingAddSectionId, setPendingAddSectionId] = useState<string | null>(null);
  const [projectSaveBusy, setProjectSaveBusy] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AccountSaveStatus | null>(null);
  const [projectLoading, setProjectLoading] = useState(Boolean(accountProjectId));
  const projectRevisionRef = useRef(0);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const lastAttemptedFingerprintRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const saveAfterLoginRef = useRef(false);
  const projectIdRef = useRef<string>(createPrintProjectId());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [freeTemplateStatus, setFreeTemplateStatus] = useState<RecipePrinterFreeTemplateStatus | null>(null);
  const {
    user: cookPilotUser,
    ready: cookPilotAuthReady,
    redirectError: cookPilotRedirectError,
  } = useCookPilotAuth();
  const [isRecipePrinterAdmin, setIsRecipePrinterAdmin] = useState(false);
  const [showCookPilotLogin, setShowCookPilotLogin] = useState(false);
  const [cookPilotLoginReason, setCookPilotLoginReason] = useState<"default" | "purchase">("default");
  const printRequestedRef = useRef(false);
  // The document title becomes the browser's default "Save as PDF" filename, so
  // a cookbook export is named after the book (e.g. "Grandma's Cookbook.pdf")
  // rather than the generic page title. Stashed here and restored on afterprint.
  const previousDocTitleRef = useRef<string | null>(null);
  const autoPrintAttemptedRef = useRef(false);
  const postPrintActionRef = useRef<PostPrintAction>("donate");
  const unprotectedPromptShownRef = useRef(false);
  // A print the user asked for while the layout was still measuring. Rather
  // than disable the Print button (dead for the ~2s a settings change takes to
  // re-settle) or print the previous layout still on screen, the click is
  // remembered and fired the instant the requested layout is ready — one
  // click, correct result, no "try again". Cleared if the request resolves or
  // the user navigates away from the intent.
  const [printPending, setPrintPending] = useState(false);
  // Snapshot of every queue id that already existed when this print job was
  // loaded, so the merge effect below can tell "pre-existing queue item the
  // user didn't select for this job" apart from "just added via the Add
  // recipe dialog" — only the latter should get pulled into the deck.
  const initialQueueIdsRef = useRef<Set<string>>(new Set());
  // Since the Add recipe dialog closes the moment you submit (parsing
  // finishes later, in the background), a failed parse has no dialog left to
  // show its error in — this tracks which failures have already surfaced as a
  // toast so the same one doesn't repeat on every re-render.
  const toastedErrorIdsRef = useRef<Set<string>>(new Set());

  const anyRecipeHasImage =
    items?.some((item) => Boolean(item.recipe?.image)) ?? false;
  const anyRecipeHasSourceUrl =
    items?.some((item) => Boolean(item.recipe?.sourceUrl)) ?? false;
  const cookbookMode = Boolean(projectMeta.meta.cookbookMode);
  // The cookbook's remembered export format (US Letter / 8×10 hardcover). This
  // is purely an EXPORT concern — it never changes how the book previews or how
  // recipes are measured; it just seeds the format the "Print your cookbook"
  // screen offers and rides along on analytics. `activePreset` falls back to the
  // default for books that haven't exported yet.
  const activePreset = getCookbookPreset(projectMeta.meta.cookbookPreset);
  const cookbookProjectId = projectMeta.meta.projectId ?? projectIdRef.current;
  // The format currently being exported. Non-null only for the brief moment
  // between choosing a format and `window.print()` firing — that's when the
  // print-only geometry (see `.rp-exporting` in print.css) is switched on. Null
  // the rest of the time, so the on-screen book and a plain Ctrl+P stay Letter.
  const [exportPreset, setExportPreset] = useState<CookbookPresetId | null>(null);
  // Cookbook photos are set book-wide via the 3-way "Photos" control
  // (`photoStyle`); plain card mode keeps its own header-photo checkbox
  // (`showPhoto`). Default "card" = a header photo in each recipe card.
  const photoStyle: PhotoStyle = projectMeta.meta.photoStyle ?? "card";
  const headerPhotosOn = cookbookMode ? photoStyle === "card" : showPhoto;
  const photosOn = headerPhotosOn && anyRecipeHasImage;
  // "Full page" style defaults every photo recipe to a full-bleed image spread;
  // the per-page picker overrides individual recipes on top of it.
  const defaultFullPage = cookbookMode && photoStyle === "full";
  const sourceUrlOn = showSourceUrl && anyRecipeHasSourceUrl;
  // Distinct recipe photos, offered as cover-photo choices in the cover editor.
  const coverPhotoCandidates = useMemo(
    () =>
      Array.from(
        new Set(
          (items ?? [])
            .map((item) => item.recipe?.image)
            .filter((src): src is string => Boolean(src)),
        ),
      ),
    [items],
  );

  // Front-matter / dedication page passed to usePrintSheets. MEMOIZED on purpose:
  // building this object inline in the hook call produced a fresh reference every
  // render whenever an opening page was enabled, which is a dependency of the
  // hook's sheets useMemo — so it recomputed the layout every render, the
  // double-buffer re-committed every render, and the page fell into an infinite
  // update loop ("Maximum update depth exceeded"). A stable reference breaks it.
  const dedicationPage = useMemo<CoverConfig | undefined>(() => {
    if (!projectMeta.meta.cookbookMode) return undefined;
    const frontMatter = projectMeta.meta.frontMatter;
    if (frontMatter && (frontMatter.heading?.trim() || frontMatter.body?.trim())) {
      return {
        title:
          frontMatter.heading?.trim() ||
          (frontMatter.kind === "dedication" ? "Dedication" : "Introduction"),
        blurb: frontMatter.body,
        template,
      };
    }
    return projectMeta.meta.dedication;
  }, [
    projectMeta.meta.cookbookMode,
    projectMeta.meta.frontMatter,
    projectMeta.meta.dedication,
    template,
  ]);

  const {
    hasRecipeBackSide,
    continueOnBack,
    printLayoutReady,
    measuredRecipeItems,
    sheets,
    navItems,
    spreads,
    previewConfig,
    awaitingFirstLayout,
    resolvedLayouts,
    measurers,
  } = usePrintSheets({
    sections,
    cover: projectMeta.meta.cover,
    backCover: projectMeta.meta.backCover,
    dedication: dedicationPage,
    sectionDividers: projectMeta.meta.sectionDividers,
    tableOfContents: projectMeta.meta.cookbookMode ? projectMeta.meta.tableOfContents : false,
    bookTitle: projectMeta.meta.cover?.title,
    cookbookMode: projectMeta.meta.cookbookMode,
    itemPlacements: projectMeta.meta.itemPlacements,
    defaultFullPage,
    cardSize,
    doubleSided,
    photosOn,
    sourceUrlOn,
    template,
  });

  // The preview is double-buffered (see `usePrintSheets`): it keeps painting the
  // last complete layout while a new one is measured, so a settings change no
  // longer empties the screen. The placeholder is therefore only for a cold
  // load, when there is genuinely no previous frame to hold.
  const previewMeasuring = awaitingFirstLayout;

  // Size/template/photo/link AS THE DISPLAYED SHEETS WERE MEASURED. Reading the
  // live settings here instead would let the card change size a beat before its
  // pagination caught up — 6x4 chrome around letter-paginated content, which is
  // the clipping this whole system exists to prevent. Falls back to the live
  // values only before the first layout lands, when nothing is drawn anyway.
  const previewCardSize = previewConfig?.cardSize ?? cardSize;
  const previewTemplate = previewConfig?.template ?? template;
  // Per-recipe photo now travels baked into each slot's `showPhoto` (resolved
  // in usePrintSheets against the committed frame), so there's no global
  // preview-photo flag to thread to the faces anymore.
  const previewSourceUrlOn = previewConfig?.sourceUrlOn ?? sourceUrlOn;

  // Section headers in the rail are an organizational grouping shown for any
  // named section, independent of whether that section also gets a printed
  // divider PAGE (`sectionDividers`) — when it does, the divider's own
  // navItem already carries the title, so the synthetic header is skipped to
  // avoid showing it twice.
  const sectionTitleByItemId = useMemo(() => {
    const map = new Map<string, { title?: string; showOpener: boolean }>();
    sections.forEach((section) =>
      section.items.forEach((item) =>
        map.set(item.id, {
          title: section.title,
          showOpener: section.showOpener ?? Boolean(projectMeta.meta.sectionDividers),
        }),
      ),
    );
    return map;
  }, [sections, projectMeta.meta.sectionDividers]);

  const railRows = useMemo(() => {
    const rows: Array<{ header?: string; navItem: NavItem; index: number }> = [];
    let lastSectionTitle: string | undefined = undefined;
    let seenFirstRecipe = false;
    navItems.forEach((navItem, index) => {
      let header: string | undefined;
      if (navItem.kind === "recipe") {
        const sectionMeta = sectionTitleByItemId.get(navItem.recipeId);
        const title = sectionMeta?.title;
        if (!sectionMeta?.showOpener && title && (!seenFirstRecipe || title !== lastSectionTitle)) {
          header = title;
        }
        lastSectionTitle = title;
        seenFirstRecipe = true;
      }
      rows.push({ header, navItem, index });
    });
    return rows;
  }, [navItems, sectionTitleByItemId]);

  // First nav index for each physical sheet, precomputed once. The deck render
  // needs "is this the first nav item on its sheet?" per slide; doing it inline
  // with `navItems.findIndex` was O(n²) on every render — and the whole page
  // re-renders on each scroll frame as `activeNavIndex` updates.
  const firstNavIndexBySheet = useMemo(() => {
    const map = new Map<number, number>();
    navItems.forEach((navItem, index) => {
      if (!map.has(navItem.sheetIndex)) map.set(navItem.sheetIndex, index);
    });
    return map;
  }, [navItems]);

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  function sectionAndIndexForItem(itemId: string): { sectionId: string; index: number } | null {
    for (const section of sections) {
      const itemIndex = section.items.findIndex((item) => item.id === itemId);
      if (itemIndex !== -1) return { sectionId: section.id, index: itemIndex };
    }
    return null;
  }

  function sectionForNavItem(navItem: NavItem | null): { id: string; index: number } | null {
    if (!navItem) return null;
    if (navItem.kind === "divider") {
      const sectionIndex = sections.findIndex((section) => section.id === navItem.recipeId);
      return sectionIndex === -1 ? null : { id: navItem.recipeId, index: sectionIndex };
    }
    if (navItem.kind === "recipe") {
      const section = sectionAndIndexForItem(navItem.recipeId);
      if (!section) return null;
      const sectionIndex = sections.findIndex((candidate) => candidate.id === section.sectionId);
      return sectionIndex === -1 ? null : { id: section.sectionId, index: sectionIndex };
    }
    return null;
  }

  const itemIdsForSection = useCallback((sectionId: string): string[] => {
    return sections.find((section) => section.id === sectionId)?.items.map((item) => item.id) ?? [];
  }, [sections]);

  function handleDropIntoSection(sectionId: string, toIndex: number) {
    if (!draggingItemId) return;
    projectMeta.moveItem(draggingItemId, sectionId, toIndex);
    setDraggingItemId(null);
  }

  function handleDropOnItem(targetItemId: string) {
    if (!draggingItemId || draggingItemId === targetItemId) {
      setDraggingItemId(null);
      return;
    }
    const target = sectionAndIndexForItem(targetItemId);
    if (target) projectMeta.moveItem(draggingItemId, target.sectionId, target.index);
    setDraggingItemId(null);
  }

  const sectionTitleForId = useCallback((sectionId: string): string => {
    return sections.find((section) => section.id === sectionId)?.title?.trim() || "section";
  }, [sections]);

  // Touch-friendly reordering for the mobile structure sheet. The desktop rail
  // reorders by dragging; these step a recipe one slot up/down through the
  // flattened book, crossing section boundaries at the ends (last item in a
  // section steps to the top of the next; first steps to the end of the prior),
  // so a single control set covers both within- and cross-section moves.
  function moveRecipeInBook(itemId: string, direction: -1 | 1) {
    const loc = sectionAndIndexForItem(itemId);
    if (!loc) return;
    const sectionIndex = sections.findIndex((section) => section.id === loc.sectionId);
    if (sectionIndex === -1) return;
    const section = sections[sectionIndex];
    if (direction === -1) {
      if (loc.index > 0) {
        projectMeta.moveItem(itemId, section.id, loc.index - 1);
      } else {
        const prev = sections[sectionIndex - 1];
        if (prev) projectMeta.moveItem(itemId, prev.id, prev.items.length);
      }
    } else if (loc.index < section.items.length - 1) {
      projectMeta.moveItem(itemId, section.id, loc.index + 1);
    } else {
      const next = sections[sectionIndex + 1];
      if (next) projectMeta.moveItem(itemId, next.id, 0);
    }
  }

  // Reorders whole sections by their stored (meta) index so the swap is correct
  // even when `sections` has dropped an empty/unnamed section that `buildSections`
  // filters out of the derived list.
  function moveSectionInBook(sectionId: string, direction: -1 | 1) {
    const metaSections = projectMeta.meta.sections;
    const from = metaSections.findIndex((section) => section.id === sectionId);
    if (from === -1) return;
    const to = from + direction;
    if (to < 0 || to >= metaSections.length) return;
    projectMeta.reorderSections(from, to);
  }

  function navigateToRecipe(itemId: string) {
    const index = navItems.findIndex(
      (nav) => nav.kind === "recipe" && nav.recipeId === itemId,
    );
    if (index !== -1) goToSlide(index);
    setStructureSheetOpen(false);
  }

  function addStructureSection() {
    const id = projectMeta.addSection("New section");
    projectMeta.updateSection(id, { showOpener: true });
    track("cookbook_section_opener_toggled", { enabled: true });
  }

  // Bottom-sheet reorder/structure surface for phones — the touch-native
  // replacement for the drag-only desktop rail (hidden on mobile). Rendered
  // only in cookbook mode; the CSS keeps it off desktop entirely.
  function renderMobileStructureSheet() {
    if (!projectMeta.meta.cookbookMode) return null;
    const orderedIds = sections.flatMap((section) => section.items.map((item) => item.id));
    const recipeCount = orderedIds.length;
    const metaSections = projectMeta.meta.sections;
    return (
      <>
        {structureSheetOpen && (
          <button
            type="button"
            className="recipe-structure-sheet__backdrop no-print"
            aria-label="Close pages"
            onClick={() => setStructureSheetOpen(false)}
          />
        )}
        <aside
          className={`recipe-structure-sheet no-print ${structureSheetOpen ? "is-open" : ""}`}
          role="dialog"
          aria-modal={structureSheetOpen ? "true" : undefined}
          aria-label="Pages and structure"
          aria-hidden={structureSheetOpen ? undefined : "true"}
        >
          <div className="recipe-structure-sheet__grabber" aria-hidden />
          <header className="recipe-structure-sheet__header">
            <div>
              <h2>Book</h2>
              <span>
                {recipeCount} recipes · {namedSectionCount(sections)} sections
              </span>
            </div>
            <button
              type="button"
              className="icon-close-btn"
              aria-label="Close"
              onClick={() => setStructureSheetOpen(false)}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
          </header>

          <div className="recipe-structure-sheet__scroll">
            {/* Book-wide settings — the same controls as the desktop "Book
                Settings" panel, which the mobile config drawer never exposes
                (it only ever opens the Themes section). */}
            <div className="recipe-structure-sheet__settings">
              <label className="recipe-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(projectMeta.meta.tableOfContents)}
                  onChange={(event) => projectMeta.setTableOfContents(event.target.checked)}
                />
                <span>
                  <strong>Table of contents</strong>
                </span>
              </label>
              <label className="recipe-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(projectMeta.meta.frontMatter || projectMeta.meta.dedication)}
                  onChange={toggleDedication}
                />
                <span>
                  <strong>Opening page</strong>
                </span>
              </label>
              {anyRecipeHasImage && (
                <div className="recipe-structure-sheet__photos">
                  <span className="recipe-structure-sheet__group-label" id="sheet-photos-label">
                    Photos
                  </span>
                  <div
                    className="recipe-photo-style"
                    role="radiogroup"
                    aria-labelledby="sheet-photos-label"
                  >
                    {PHOTO_STYLE_OPTIONS.map((option) => (
                      <label
                        key={option.id}
                        className={`recipe-photo-style__tile ${photoStyle === option.id ? "is-active" : ""}`}
                        title={option.hint}
                      >
                        <input
                          type="radio"
                          name="recipe-sheet-photo-style"
                          className="sr-only"
                          checked={photoStyle === option.id}
                          onChange={() => projectMeta.setPhotoStyle(option.id)}
                        />
                        <PhotoStylePreview id={option.id} />
                        <span className="recipe-photo-style__tile-label">{option.short}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <span className="recipe-structure-sheet__group-label recipe-structure-sheet__group-label--structure">
              Structure
            </span>

            {sections.map((section) => {
              const metaIndex = metaSections.findIndex((candidate) => candidate.id === section.id);
              const canSectionUp = metaIndex > 0;
              const canSectionDown = metaIndex !== -1 && metaIndex < metaSections.length - 1;
              const showSectionChrome = sections.length > 1 || Boolean(section.title);
              return (
                <section className="recipe-structure-sheet__section" key={section.id}>
                  {showSectionChrome && (
                    <div className="recipe-structure-sheet__section-head">
                      <input
                        className="recipe-structure-sheet__section-title"
                        value={section.title ?? ""}
                        placeholder="Section name"
                        aria-label="Section name"
                        onChange={(event) =>
                          projectMeta.renameSection(section.id, event.target.value || undefined)
                        }
                      />
                      <div className="recipe-structure-sheet__move">
                        <button
                          type="button"
                          className="recipe-structure-sheet__move-up"
                          aria-label="Move section up"
                          disabled={!canSectionUp}
                          onClick={() => moveSectionInBook(section.id, -1)}
                        >
                          <ChevronDownIcon size={ICON_SIZE.sm} />
                        </button>
                        <button
                          type="button"
                          className="recipe-structure-sheet__move-down"
                          aria-label="Move section down"
                          disabled={!canSectionDown}
                          onClick={() => moveSectionInBook(section.id, 1)}
                        >
                          <ChevronDownIcon size={ICON_SIZE.sm} />
                        </button>
                      </div>
                    </div>
                  )}
                  {showSectionChrome && (
                    <label className="recipe-structure-sheet__opener">
                      <input
                        type="checkbox"
                        checked={Boolean(section.showOpener)}
                        onChange={(event) => setSectionOpener(section.id, event.target.checked)}
                      />
                      Chapter opener page
                    </label>
                  )}
                  <ul className="recipe-structure-sheet__recipes">
                    {section.items.map((item) => {
                      const globalIndex = orderedIds.indexOf(item.id);
                      const title = item.recipe?.title || item.title;
                      return (
                        <li className="recipe-structure-sheet__recipe" key={item.id}>
                          <button
                            type="button"
                            className="recipe-structure-sheet__recipe-open"
                            onClick={() => navigateToRecipe(item.id)}
                          >
                            <span className="recipe-structure-sheet__recipe-num">
                              {globalIndex + 1}
                            </span>
                            <span className="recipe-structure-sheet__recipe-title">{title}</span>
                          </button>
                          <div className="recipe-structure-sheet__move">
                            <button
                              type="button"
                              className="recipe-structure-sheet__move-up"
                              aria-label={`Move ${title} up`}
                              disabled={globalIndex <= 0}
                              onClick={() => moveRecipeInBook(item.id, -1)}
                            >
                              <ChevronDownIcon size={ICON_SIZE.sm} />
                            </button>
                            <button
                              type="button"
                              className="recipe-structure-sheet__move-down"
                              aria-label={`Move ${title} down`}
                              disabled={globalIndex >= recipeCount - 1}
                              onClick={() => moveRecipeInBook(item.id, 1)}
                            >
                              <ChevronDownIcon size={ICON_SIZE.sm} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                    {section.items.length === 0 && (
                      <li className="recipe-structure-sheet__empty">
                        Empty — step a recipe here with the arrows above.
                      </li>
                    )}
                  </ul>
                </section>
              );
            })}
          </div>

          <footer className="recipe-structure-sheet__footer">
            <button
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={addStructureSection}
            >
              <PlusIcon size={ICON_SIZE.sm} />
              Add section
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-compact"
              onClick={() => {
                setStructureSheetOpen(false);
                openOrganizeCookbook();
              }}
            >
              Auto-organize
            </button>
          </footer>
        </aside>
      </>
    );
  }

  function startSectionEdit(sectionId: string) {
    setEditingSectionId(sectionId);
    setEditingSectionTitle(sectionTitleForId(sectionId));
  }

  function commitSectionEdit() {
    if (!editingSectionId) return;
    projectMeta.renameSection(editingSectionId, editingSectionTitle.trim() || undefined);
    setEditingSectionId(null);
    setEditingSectionTitle("");
  }

  function addSectionDivider() {
    const title = "New section";
    const sectionId = projectMeta.addSection(title);
    projectMeta.updateSection(sectionId, { showOpener: true });
    setEditingSectionId(sectionId);
    setEditingSectionTitle(title);
    setPendingFocusNavId(sectionId);
    showToast("Section added. Drag recipes beneath it to group them.");
  }

  function setSectionOpener(sectionId: string, enabled: boolean) {
    projectMeta.updateSection(sectionId, { showOpener: enabled });
    track("cookbook_section_opener_toggled", { enabled });
  }

  // ── Rail multi-select (cookbook) ─────────────────────────────────────────
  // Cmd/Ctrl-click recipes in the rail to build a selection; two or more brings
  // up a bulk bar to group them into a new section or move them into an existing
  // one. Regular clicks navigate as before and clear any selection.
  function toggleRailSelection(recipeId: string) {
    setRailBulkMenu(null);
    setRailAnchorId(recipeId);
    setSelectedRailIds((current) => {
      const next = new Set(current);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }
  // Shift-click: select every recipe between the anchor (last clicked, else the
  // page you're on) and this one, in book order — the customary range select.
  function selectRailRange(recipeId: string) {
    const ordered = sections.flatMap((section) => section.items).map((item) => item.id);
    const anchor = railAnchorId ?? activeSelectableRecipeId ?? recipeId;
    const from = ordered.indexOf(anchor);
    const to = ordered.indexOf(recipeId);
    if (from === -1 || to === -1) {
      toggleRailSelection(recipeId);
      return;
    }
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    setRailBulkMenu(null);
    setSelectedRailIds((current) => {
      const next = new Set(current);
      for (let i = lo; i <= hi; i += 1) next.add(ordered[i]);
      return next;
    });
  }
  function clearRailSelection() {
    setSelectedRailIds((current) => (current.size ? new Set() : current));
    setRailBulkMenu(null);
  }
  // Selected recipe ids in book order, so a new/receiving section keeps sequence.
  function orderedRailSelection(): string[] {
    return sections
      .flatMap((section) => section.items)
      .map((item) => item.id)
      .filter((id) => effectiveRailSelection.has(id));
  }
  function makeSectionFromSelection() {
    const ids = orderedRailSelection();
    if (ids.length === 0) return;
    const sectionId = projectMeta.addSection("New section");
    ids.forEach((id, index) => moveProjectItem(id, sectionId, index));
    clearRailSelection();
    projectMeta.updateSection(sectionId, { showOpener: true });
    setEditingSectionId(sectionId);
    setEditingSectionTitle("New section");
    setPendingFocusNavId(sectionId);
    track("cookbook_section_created_from_selection", { count: ids.length });
  }
  function moveSelectionToSection(sectionId: string) {
    const ids = orderedRailSelection();
    if (ids.length === 0) return;
    const base = itemIdsForSection(sectionId).length;
    ids.forEach((id, index) => moveProjectItem(id, sectionId, base + index));
    clearRailSelection();
    track("cookbook_section_selection_moved", { count: ids.length });
  }

  function coverSideFromNavItem(navItem: NavItem): "front" | "back" | "dedication" {
    if (navItem.recipeId === "cover-back") return "back";
    if (navItem.recipeId === "cover-dedication") return "dedication";
    return "front";
  }

  function defaultCover(): CoverConfig {
    // Lead with a confident, giftable title instead of exposing an empty-state
    // implementation detail such as "Untitled Cookbook".
    const images = coverPhotoCandidates;
    const gridCount = images.length >= 6 ? 6 : images.length >= 4 ? 4 : images.length >= 2 ? 2 : 0;
    return {
      title: "Our Favorite Recipes",
      subtitle: "Recipes worth making again and again",
      template,
      style: "photo",
      creditLabel: "compiled-by",
      layout: gridCount > 0 ? "collage" : images.length === 1 ? "photo" : "typographic",
      ...(gridCount > 0
        ? { gridImages: images.slice(0, gridCount) }
        : images.length === 1
          ? { imageUrl: images[0] }
          : {}),
    };
  }

  // Turning a print job into a cookbook shouldn't drop the cook into an empty
  // shell — scaffold the book they'd have built by hand: a cover, a table of
  // contents, and recipes grouped into chapters with dividers on. Anything they
  // already set up (a cover, named sections) is respected, not overwritten.
  function scaffoldCookbook() {
    // A cookbook is a bound book, never a 4×6 card, and it wants its photos.
    // These are component-level (not meta), so they apply whether we restore a
    // stashed book or scaffold a fresh one.
    if (cardSize === "card-6x4") setCardSize("letter");
    setShowPhoto(true);
    // Coming back from a switch-to-recipe-cards? Restore the exact book the cook
    // left — cover, chapters, layouts, and settings — in one commit, and skip
    // the fresh-scaffold defaults below (which would clobber it, since they read
    // the pre-restore meta snapshot).
    if (projectMeta.restoreCookbook()) return;
    projectMeta.setCookbookMode(true);
    // Turn recipe photos on so the scaffolded book looks finished rather than
    // bare. The source link stays OFF by default — a bound cookbook rarely wants
    // a URL under every recipe; the cook can turn it on if they do.
    // Give the book a default print format (US Letter) so export geometry is
    // set from the start; a returning book keeps whatever it chose.
    if (!projectMeta.meta.cookbookPreset) projectMeta.setCookbookPreset(DEFAULT_COOKBOOK_PRESET_ID);
    // The premium default is an editorial spread: the recipe's full-bleed
    // photograph on the left, with its recipe page facing it on the right.
    if (!projectMeta.meta.photoStyle) projectMeta.setPhotoStyle("full");
    if (!projectMeta.meta.cover) {
      projectMeta.setCover(defaultCover());
    }
    if (!projectMeta.meta.backCover) {
      // A minimal closing page (template band on the theme's paper); the cook
      // can add a blurb / "from the kitchen of" line by editing it.
      projectMeta.setBackCover({ title: "", template });
    }
    projectMeta.setTableOfContents(true);
    projectMeta.setSectionDividers(false);
    if (
      namedSectionCount(sections) === 0 &&
      !projectMeta.meta.frontMatter &&
      !projectMeta.meta.dedication
    ) {
      projectMeta.setFrontMatter({
        kind: "dedication",
        heading: "Dedication",
        body: "",
      });
    }
    projectMeta.setCookbookWelcomeCompleted(true);
    // Every recipe gets its own full page — no auto-pairing. The cook can turn
    // an individual recipe into a full-page photo spread from the page controls.
  }

  function beginCookbookBuild() {
    setShowCookbookOfferDialog(false);
    setCookbookBuilding(true);
    window.setTimeout(() => {
      scaffoldCookbook();
      // Always reveal a new cookbook from its cover, regardless of where the
      // user had scrolled in Recipe Cards.
      setActiveNavIndex(0);
      setPendingFocusNavId("cover-front");
      track("cookbook_workspace_entered", {});
    }, 180);
    window.setTimeout(() => setCookbookBuilding(false), 1450);
  }

  // Entry point for the Recipe cards ↔ Cookbook toggle. The offer dialog is
  // shown only until the cookbook welcome has been completed; later switches
  // can scaffold the cookbook immediately.
  function startCookbook() {
    if (projectMeta.meta.cookbookWelcomeCompleted) {
      // A returning book restores a stash; a brief loading spinner covers the
      // layout recompute so the pages swap in cleanly instead of morphing. The
      // full build animation is reserved for the first-ever build.
      if (projectMeta.meta.stashedCookbook) {
        setCookbookRestoring(true);
        window.setTimeout(() => {
          scaffoldCookbook();
          setActiveNavIndex(0);
          setPendingFocusNavId("cover-front");
        }, 140);
        window.setTimeout(() => setCookbookRestoring(false), 650);
        return;
      }
      scaffoldCookbook();
      return;
    }
    track("cookbook_welcome_shown", {});
    setShowCookbookOfferDialog(true);
  }

  // Switching back to recipe cards is non-destructive — the book is tucked into
  // a stash (see `exitCookbook`/`restoreCookbook`) — but still goes through a
  // confirm so a stray click of the Recipe cards ↔ Cookbook switch doesn't
  // yank the cook out of their book.
  function confirmExitCookbook() {
    projectMeta.exitCookbook();
    setShowExitCookbookConfirm(false);
  }

  // The single per-recipe photo axis, matching the book-wide "Photos" control:
  // "none" (no photo), "card" (header photo), "full" (a full-page facing photo /
  // image-spread). Derived from the resolved layout + the per-recipe header
  // override, falling back to the book default.
  const photoModeFor = useCallback(
    (recipeId: string): PhotoStyle => {
      if (resolvedLayouts.get(recipeId) === "image-spread") return "full";
      const override = projectMeta.meta.itemPlacements?.[recipeId]?.showPhoto;
      const headerOn = override ?? photoStyle === "card";
      return headerOn ? "card" : "none";
    },
    [resolvedLayouts, projectMeta.meta.itemPlacements, photoStyle],
  );

  // Set one recipe's photo mode. Picking the book default clears the override so
  // the page keeps following the book; anything else pins an explicit choice.
  function setRecipePhotoMode(recipeId: string, mode: PhotoStyle) {
    if (mode === photoStyle) {
      projectMeta.setItemPlacement(recipeId, undefined);
      return;
    }
    const hero = mode === "full" ? items?.find((item) => item.id === recipeId)?.recipe?.image : undefined;
    projectMeta.setItemPhotoMode(recipeId, mode, hero);
  }

  // The per-recipe photo control (cookbook): the same three options as the
  // book-wide "Photos" default, overriding just this recipe. Hidden when the
  // recipe has no photo — there's nothing to place. Shared desktop + mobile.
  const renderPagePhotoControl = (recipeId: string) => {
    const recipe = items?.find((item) => item.id === recipeId && item.recipe)?.recipe;
    if (!recipe?.image) return null;
    const mode = photoModeFor(recipeId);
    return (
      <div className="recipe-page-layout-control">
        <div className="recipe-page-layout-picker" role="group" aria-label="Photo">
          {PHOTO_STYLE_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`recipe-page-layout-picker__btn ${mode === option.id ? "is-active" : ""}`}
              aria-pressed={mode === option.id}
              onClick={(event) => {
                event.stopPropagation();
                setRecipePhotoMode(recipeId, option.id);
              }}
            >
              {option.short}
            </button>
          ))}
        </div>
      </div>
    );
  };

  function coverForSide(side: "front" | "back" | "dedication"): CoverConfig | undefined {
    if (side === "back") return projectMeta.meta.backCover;
    if (side === "dedication") {
      const frontMatter = projectMeta.meta.frontMatter;
      if (frontMatter) {
        return {
          title:
            frontMatter.heading ||
            (frontMatter.kind === "dedication" ? "Dedication" : "Introduction"),
          blurb: frontMatter.body,
          template,
        };
      }
      return projectMeta.meta.dedication;
    }
    return projectMeta.meta.cover;
  }

  function setCoverForSide(
    side: "front" | "back" | "dedication",
    cover: CoverConfig | undefined,
  ) {
    if (side === "back") projectMeta.setBackCover(cover);
    else if (side === "dedication") {
      projectMeta.setFrontMatter(
        cover
          ? {
              kind: projectMeta.meta.frontMatter?.kind ?? "dedication",
              heading: cover.title || undefined,
              body: cover.blurb,
            }
          : undefined,
      );
    }
    else {
      if (cover?.layout && cover.layout !== projectMeta.meta.cover?.layout) {
        track("cookbook_cover_layout_selected", { layout: cover.layout });
      }
      projectMeta.setCover(cover);
    }
  }

  function addCover() {
    const cover = projectMeta.meta.cover ?? defaultCover();
    projectMeta.setCover(cover);
    setEditingCoverSide("front");
    setPendingFocusNavId("cover-front");
  }

  /** Toggles the dedication front-matter page. Adding one seeds a quiet,
      template-skinned page and jumps into editing it; removing clears it. */
  function toggleDedication() {
    if (projectMeta.meta.frontMatter || projectMeta.meta.dedication) {
      projectMeta.setFrontMatter(undefined);
      projectMeta.setDedication(undefined);
      setEditingCoverSide((current) => (current === "dedication" ? null : current));
      return;
    }
    projectMeta.setFrontMatter({ kind: "dedication", heading: "Dedication", body: "" });
    track("cookbook_front_matter_enabled", { kind: "dedication" });
    setEditingCoverSide("dedication");
    setPendingFocusNavId("cover-dedication");
  }

  const requestDeleteNavItem = useCallback((navItem: NavItem) => {
    if (navItem.kind === "recipe") {
      const item = items?.find((candidate) => candidate.id === navItem.recipeId && candidate.recipe);
      setPendingDelete({
        kind: "recipe",
        id: navItem.recipeId,
        title: item?.recipe?.title || item?.title || "this recipe",
      });
      return;
    }
    if (navItem.kind === "divider") {
      setPendingDelete({
        kind: "section",
        id: navItem.recipeId,
        title: sectionTitleForId(navItem.recipeId),
        recipeIds: itemIdsForSection(navItem.recipeId),
      });
      return;
    }
    const side = coverSideFromNavItem(navItem);
    setPendingDelete({
      kind: "cover",
      side,
      title: navItem.label || (side === "front" ? "cover" : "back cover"),
    });
  }, [items, itemIdsForSection, sectionTitleForId]);

  function confirmPendingDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.kind === "recipe") {
      const id = pendingDelete.id;
      const nextItems = (items ?? []).filter((item) => item.id !== id);
      setItems(nextItems);
      createCurrentPrintJob(nextItems.map((item) => item.id));
      queue.remove(id);
    } else if (pendingDelete.kind === "section") {
      projectMeta.deleteSection(pendingDelete.id);
    } else if (pendingDelete.side === "back") {
      projectMeta.setBackCover(undefined);
      setEditingCoverSide((side) => (side === "back" ? null : side));
    } else if (pendingDelete.side === "dedication") {
      projectMeta.setDedication(undefined);
      projectMeta.setFrontMatter(undefined);
      setEditingCoverSide((side) => (side === "dedication" ? null : side));
    } else {
      projectMeta.setCover(undefined);
      setEditingCoverSide((side) => (side === "front" ? null : side));
    }
    setPendingDelete(null);
  }

  function confirmDeleteSectionRecipes() {
    if (!pendingDelete || pendingDelete.kind !== "section") return;
    const idsToRemove = new Set(pendingDelete.recipeIds);
    const nextItems = (items ?? []).filter((item) => !idsToRemove.has(item.id));
    setItems(nextItems);
    createCurrentPrintJob(nextItems.map((item) => item.id));
    pendingDelete.recipeIds.forEach((id) => queue.remove(id));
    projectMeta.deleteSection(pendingDelete.id);
    setPendingDelete(null);
  }

  const [activeNavIndex, setActiveNavIndex] = useState(0);
  const [mobileDrawer, setMobileDrawer] = useState<"template" | null>(null);
  // The page rail (reorder/structure) is hidden on phones because the desktop
  // one relies on drag-and-drop, which doesn't exist on touch. This is the
  // mobile stand-in: a bottom sheet with the same structure controls driven by
  // taps instead. Cookbook mode only — plain cards have no sections to arrange.
  const [structureSheetOpen, setStructureSheetOpen] = useState(false);
  // The print-setup panel is a persistent sidebar on desktop and a modal
  // drawer on mobile, so it can only claim to be a dialog in the second case.
  // While it is one, it gets a real focus trap and Escape-to-close — it
  // previously carried `aria-modal` on an `<aside>`, where the attribute is
  // silently ignored (it's only honoured on role dialog/alertdialog), so the
  // promise of modality was never actually kept for assistive tech.
  const configPanelRef = useRef<HTMLElement>(null);
  useModalFocus(configPanelRef, () => setMobileDrawer(null), { disabled: !mobileDrawer });
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);

  // Close print settings whenever their trigger disappears. Cookbook settings
  // live inline in the setup panel, so neither card-settings surface belongs
  // in cookbook mode.
  useEffect(() => {
    if (projectMeta.meta.cookbookMode || (!hasRecipeBackSide && cardSize !== "card-6x4")) {
      setPrintSettingsOpen(false);
    }
    if (projectMeta.meta.cookbookMode) {
      setSettingsMenuOpen(false);
    }
  }, [projectMeta.meta.cookbookMode, hasRecipeBackSide, cardSize]);


  const singleRecipePrintView =
    (items?.filter((item) => Boolean(item.recipe)).length ?? 0) === 1;

  // Cookbook "book view": the deck shows two-page SPREADS, so a deck slide is a
  // spread (not a single page). `activeNavIndex` then indexes `spreads`, and the
  // controls/editing target a FOCUSED page within the active spread.
  const cookbookView = spreads.length > 0;
  // The book always previews at Letter — print format is applied only at export
  // time, never in the deck (see `exportPreset`), so on-screen sizing is Letter.
  const previewDims = PAGE_DIMS[previewCardSize];
  const spreadWidth = previewDims.w * 2;
  // While a format is being exported, the deck carries that preset's @page class
  // and geometry vars so the print-only `.rp-exporting` rules resize/inset/bleed
  // the pages. Empty the rest of the time → a plain Letter deck and Letter print.
  const exportPresetObj = exportPreset ? getCookbookPreset(exportPreset) : null;
  const exportInsets = exportPresetObj ? presetInsets(exportPresetObj) : null;
  const deckExportClass = exportPresetObj ? `rp-exporting ${exportPresetObj.pageClass}` : "";
  const deckExportStyle = (exportPresetObj
    ? {
        "--rp-card-scale": presetCardScale(exportPresetObj),
        "--rp-art-scale": presetArtScale(exportPresetObj),
        "--rp-inset-block": exportInsets!.block,
        "--rp-inset-outer": exportInsets!.outer,
        "--rp-inset-bind": exportInsets!.bind,
      }
    : undefined) as CSSProperties | undefined;
  // Sheet index → its representative nav item index (the first nav item on it).
  const navIndexForSheet = useMemo(() => {
    const map = new Map<number, number>();
    navItems.forEach((navItem, index) => {
      if (!map.has(navItem.sheetIndex)) map.set(navItem.sheetIndex, index);
    });
    return map;
  }, [navItems]);

  const { canvasSide, setCanvasSide, deckScale, deckRef, slideRefs, goToSlide } = useDeckScroller({
    activeNavIndex,
    setActiveNavIndex,
    navItemsLength: cookbookView ? spreads.length : navItems.length,
    cardSize: previewCardSize,
    sheetsLength: sheets.length,
    continueOnBack,
    singleRecipePrintView,
    pageWidth: cookbookView ? spreadWidth : PAGE_DIMS[previewCardSize].w,
    pageHeight: cookbookView ? previewDims.h : PAGE_DIMS[previewCardSize].h,
  });

  // The page (sheet) inside the active spread the controls act on. Clicking a
  // page focuses it; defaults to the recto (right) page. Reset when the active
  // spread changes so focus never leaks across spreads.
  const [focusedSheetIndex, setFocusedSheetIndex] = useState<number | null>(null);
  useEffect(() => {
    setFocusedSheetIndex(null);
  }, [activeNavIndex]);
  const activeSpread = cookbookView ? spreads[activeNavIndex] ?? null : null;
  const focusedSheet = cookbookView
    ? activeSpread &&
      focusedSheetIndex !== null &&
      (activeSpread.left === focusedSheetIndex || activeSpread.right === focusedSheetIndex)
      ? focusedSheetIndex
      : activeSpread
        ? activeSpread.right ?? activeSpread.left
        : null
    : null;
  const activeNavItem: NavItem | null = cookbookView
    ? focusedSheet !== null && navIndexForSheet.has(focusedSheet)
      ? navItems[navIndexForSheet.get(focusedSheet)!]
      : null
    : navItems[activeNavIndex] ?? null;
  const activeRecipeId = activeNavItem?.recipeId ?? null;

  const activeRecipeItem =
    activeRecipeId && items
      ? items.find((item) => item.id === activeRecipeId && item.recipe)
      : null;

  // The page you're on counts as part of a multi-select: once at least one other
  // recipe is Cmd-clicked, the recipe currently open joins the group too — so a
  // selection of two others while viewing a third reads (and acts on) all three.
  const activeSelectableRecipeId =
    activeNavItem?.kind === "recipe" ? activeNavItem.recipeId : null;
  const effectiveRailSelection = useMemo(() => {
    if (selectedRailIds.size === 0) return selectedRailIds;
    if (!activeSelectableRecipeId || selectedRailIds.has(activeSelectableRecipeId)) {
      return selectedRailIds;
    }
    const next = new Set(selectedRailIds);
    next.add(activeSelectableRecipeId);
    return next;
  }, [selectedRailIds, activeSelectableRecipeId]);

  const { pageEditMode, togglePageEditMode, activeInlineEdit } = useRecipeInlineEditor({
    items,
    setItems,
    activeRecipeId,
    activeRecipeItem,
    resetKey: String(activeNavIndex),
  });

  function printNow() {
    printRequestedRef.current = true;
    track("print_started", {
      template,
      cardSize,
      showPhoto,
      doubleSided,
      recipeCount: items?.filter((item) => item.recipe).length ?? 0,
      cookbookPreset: exportPreset ?? undefined,
    });
    // Name the exported PDF after the cookbook. The browser seeds the Save-as-PDF
    // filename from document.title, so this is what turns the deliverable from
    // "Print preview · RecipePrinter.pdf" into "The Smith Family Cookbook.pdf".
    if (cookbookMode) {
      const bookName = projectMeta.meta.cover?.title?.trim();
      if (bookName) {
        previousDocTitleRef.current = document.title;
        document.title = bookName;
      }
    }
    window.print();
  }

  function showToast(message: string) {
    setToastMessage(message);
  }

  function openOrganizeCookbook() {
    const proposal = suggestCookbookOrganization(items ?? []);
    const uncategorizedCount =
      proposal.sections.find((section) => section.title === "Uncategorized")?.itemIds.length ?? 0;
    track("relayout_started", {});
    track("relayout_method_selected", { method: "suggested" });
    track("relayout_previewed", {
      sectionCount: proposal.sections.length,
      uncategorizedCount,
    });
    setShowOrganizeCookbook(true);
  }

  function applyCookbookOrganization(draft: CookbookOrganizationDraft) {
    setOrganizationUndo(structuredClone(projectMeta.meta.sections));
    const next = organizationSectionsForApply(
      draft,
      (items ?? []).filter((item) => item.recipe).map((item) => item.id),
    );
    projectMeta.setSectionStructure(next);
    setShowOrganizeCookbook(false);
    track("relayout_applied", { sectionCount: next.length });
    showToast("Cookbook organized");
  }

  function undoCookbookOrganization() {
    if (!organizationUndo) return;
    projectMeta.setSectionStructure(organizationUndo);
    setOrganizationUndo(null);
    showToast("Organization undone");
  }

  function currentProject(): PrintProject | null {
    if (!cookPilotUser || !items?.length) return null;
    const defaultTitle =
      projectMeta.meta.cover?.title ||
      items.find((item) => item.recipe)?.recipe?.title ||
      `Recipe cards — ${new Date().toLocaleDateString()}`;
    return assemblePrintProject({
      id: cookbookProjectId,
      ownerUid: cookPilotUser.uid,
      title: defaultTitle,
      sections,
      cover: projectMeta.meta.cover,
      backCover: projectMeta.meta.backCover,
      dedication: projectMeta.meta.dedication,
      frontMatter: projectMeta.meta.frontMatter,
      revision: projectRevisionRef.current,
      kind: cookbookMode ? "cookbook" : "printProject",
      settings: {
        cardSize,
        template,
        doubleSided,
        showPhoto,
        showSourceUrl,
        showCutLines,
        cookbookMode: projectMeta.meta.cookbookMode,
        tableOfContents: projectMeta.meta.tableOfContents,
        sectionDividers: projectMeta.meta.sectionDividers,
        bookPreset: projectMeta.meta.cookbookPreset,
        cookbookWelcomeCompleted: projectMeta.meta.cookbookWelcomeCompleted,
        tocKicker: projectMeta.meta.tocKicker,
        tocTitle: projectMeta.meta.tocTitle,
        photoStyle: projectMeta.meta.photoStyle,
      },
      itemPlacements: projectMeta.meta.itemPlacements,
    });
  }

  async function handleSaveProject() {
    if (!cookPilotUser) {
      saveAfterLoginRef.current = true;
      setCookPilotLoginReason("default");
      setShowCookPilotLogin(true);
      return;
    }
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      return;
    }
    const baseProject = currentProject();
    if (!baseProject) return;
    saveInFlightRef.current = true;
    setProjectSaveBusy(true);
    setSaveStatus("saving");
    try {
      const materialized = await materializeProjectPhotos({
        sections: baseProject.sections,
        cover: baseProject.cover,
        backCover: baseProject.backCover,
        itemPlacements: baseProject.itemPlacements,
      });
      const project: PrintProject = {
        ...baseProject,
        sections: materialized.sections,
        cover: materialized.cover,
        backCover: materialized.backCover,
        itemPlacements: materialized.itemPlacements,
      };
      const saved = savedProjectId
        ? await savePrintProject(project)
        : await adoptAnonymousProject(cookPilotUser.uid, project);
      projectRevisionRef.current = Number(saved.revision ?? 0);
      setSavedProjectId(saved.id);
      if (saved.id !== projectMeta.meta.projectId) {
        projectMeta.replaceMeta({ ...projectMeta.meta, projectId: saved.id });
      }
      lastSavedFingerprintRef.current = JSON.stringify({
        items,
        meta: { ...projectMeta.meta, projectId: saved.id },
        cardSize,
        template,
        doubleSided,
        showPhoto,
        showSourceUrl,
        showCutLines,
      });
      setSaveStatus("saved");
    } catch (error) {
      console.warn("RecipePrinter: could not save project", error);
      if (error instanceof PrintProjectConflictError) {
        setSaveStatus("conflict");
      } else {
        setSaveStatus(readAdoptionManifest()?.status === "failed" ? "adoption" : "error");
      }
    } finally {
      saveInFlightRef.current = false;
      setProjectSaveBusy(false);
      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        window.setTimeout(() => void handleSaveProject(), 0);
      }
    }
  }

  function handleRetrySave() {
    if (saveStatus !== "conflict") {
      void handleSaveProject();
      return;
    }
    const loadNewer = window.confirm(
      "This cookbook was updated elsewhere. Choose OK to load that newer version, or Cancel to save your current edits as a copy.",
    );
    if (loadNewer && savedProjectId) {
      window.location.assign(`/print?project=${encodeURIComponent(savedProjectId)}`);
      return;
    }
    const copyId = createPrintProjectId();
    projectRevisionRef.current = 0;
    setSavedProjectId(null);
    projectMeta.replaceMeta({ ...projectMeta.meta, projectId: copyId });
    setSaveStatus(null);
  }

  useEffect(() => {
    if (!cookPilotUser || !saveAfterLoginRef.current) return;
    saveAfterLoginRef.current = false;
    void handleSaveProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotUser]);

  const {
    revenueCatUserId,
    customerInfo,
    showUnlockDialog,
    setShowUnlockDialog,
    purchaseBusy,
    claimBusy,
    templatePrices,
    freeTemplateBannerDismissed,
    setFreeTemplateBannerDismissed,
    selectedPremiumTemplate,
    selectedTemplateLabel,
    selectedTemplateLocked,
    hasUnclaimedFreeTemplate,
    canClaimSelectedTemplateFree,
    refreshCustomerInfo,
    unlockTemplateAndPrint,
    claimTemplateAndPrint,
  } = usePremiumTemplatePurchase({
    items,
    cookPilotUser,
    cookPilotAuthReady,
    template,
    freeTemplateStatus,
    setFreeTemplateStatus,
    showToast,
    clearToast: () => setToastMessage(null),
    printNow,
    onFreshPurchase: () => {
      postPrintActionRef.current = cookPilotUser ? "none" : "protect-purchase";
      if (!cookPilotUser) localStore.set(UNPROTECTED_PURCHASE_STORAGE_KEY, "1");
    },
  });

  const {
    cookbookPrice,
    cookbookLocked,
    showCookbookUnlockDialog,
    setShowCookbookUnlockDialog,
    cookbookPurchaseBusy,
    purchaseCookbookAndContinue,
  } = useCookbookPurchase({
    revenueCatUserId,
    customerInfo,
    cookPilotUser,
    cookbookMode: Boolean(projectMeta.meta.cookbookMode),
    projectId: cookbookProjectId,
    refreshCustomerInfo,
    showToast,
    clearToast: () => setToastMessage(null),
    onFreshPurchase: () => {
      if (!cookPilotUser) localStore.set(UNPROTECTED_PURCHASE_STORAGE_KEY, "1");
    },
  });

  // Every theme is included with the cookbook purchase, so the per-template
  // paywall is suppressed while in cookbook mode — the cookbook unlock is the
  // only gate there. Switching back to recipe cards restores normal gating.
  const templateLocked = selectedTemplateLocked && !projectMeta.meta.cookbookMode;

  // Delete/Backspace on the selected recipe opens a confirm dialog rather
  // than deleting immediately — but only when focus isn't inside an editable
  // field (inline title/ingredient/step editing uses real inputs, where
  // Backspace/Delete need to keep deleting characters) and no other dialog is
  // already up.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (isEditable) return;
      if (!activeNavItem) return;
      if (
        showAddRecipeDialog ||
        pendingDelete ||
        showDonateDialog ||
        showUnlockDialog ||
        showFeedbackDialog ||
        showCookPilotLogin
      ) {
        return;
      }
      event.preventDefault();
      requestDeleteNavItem(activeNavItem);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    activeNavItem,
    showAddRecipeDialog,
    pendingDelete,
    showDonateDialog,
    showUnlockDialog,
    showFeedbackDialog,
    showCookPilotLogin,
    requestDeleteNavItem,
  ]);

  // Jump to a just-added recipe once its page actually exists in the deck
  // (mirrors PowerPoint landing on a freshly inserted slide).
  useEffect(() => {
    const pendingId = pendingFocusNavId ?? pendingFocusRecipeId;
    if (!pendingId) return;
    const index = navItems.findIndex((navItem) => navItem.recipeId === pendingId);
    if (index === -1) return;
    const targetSheet = navItems[index]?.sheetIndex;
    const targetIndex = cookbookView
      ? spreads.findIndex(
          (spread) => spread.left === targetSheet || spread.right === targetSheet,
        )
      : index;
    if (targetIndex === -1) return;
    goToSlide(targetIndex);
    if (pendingFocusNavId) setPendingFocusNavId(null);
    if (pendingFocusRecipeId === pendingId) setPendingFocusRecipeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocusNavId, pendingFocusRecipeId, navItems, cookbookView, spreads]);

  async function handlePrint() {
    if (purchaseBusy || cookbookPurchaseBusy) return;
    if (!printLayoutReady) {
      // Remember it and let the effect below fire once the layout settles,
      // instead of turning them away — the button shows a spinner meanwhile.
      setPrintPending(true);
      return;
    }
    setPrintPending(false);
    const gate = purchaseGate({
      cookbookLocked,
      templateLocked: Boolean(selectedPremiumTemplate && templateLocked),
    });
    if (gate === "unlock-cookbook") {
      track("paywall_shown", { product: "cookbook" });
      setShowCookbookUnlockDialog(true);
      return;
    }
    if (gate === "unlock-template" && selectedPremiumTemplate) {
      track("paywall_shown", {
        product: "premium_template",
        template: selectedPremiumTemplate,
      });
      setShowUnlockDialog(true);
      return;
    }
    // An unlocked cookbook export lands on the "Print your cookbook" screen,
    // where the format is chosen at download time (the $19.99 unlocks every
    // format forever). Plain cards print immediately, as before.
    if (cookbookMode) {
      openCookbookPrintDialog();
      return;
    }
    printNow();
  }

  function openCookbookPrintDialog() {
    track("cookbook_print_options_shown", { preset: activePreset.id });
    track("cookbook_ready_shown", { freshPurchase: cookbookJustPurchased });
    setShowCookbookPrintDialog(true);
  }

  // Chosen a format on the "Print your cookbook" screen: remember it, flip on
  // that format's print-only geometry, and let the effect below fire the OS
  // print dialog once the deck has the geometry committed. The dialog stays open
  // so they can immediately export another format if they want.
  function exportCookbookAs(presetId: CookbookPresetId) {
    projectMeta.setCookbookPreset(presetId);
    track("cookbook_preset_selected", { preset: presetId });
    setExportPreset(presetId);
  }

  function handleMobilePrint() {
    setMobileDrawer(null);
    void handlePrint();
  }

  // The Print button is only truly *disabled* while a purchase is settling —
  // there's a real async operation the click can't preempt. It is NOT disabled
  // for a measuring layout: a click then is queued (see `printPending`), so the
  // button stays live and just shows a spinner until the layout is ready.
  const printBlocked = purchaseBusy || cookbookPurchaseBusy;
  const printSpinner = printBlocked || printPending;

  // Always the current `handlePrint`, for the auto-print effect below.
  //
  // That effect fires exactly once, on a 350ms timer, and `handlePrint` is a
  // fresh closure every render over eight changing values. Listing it as a
  // dependency — what the lint rule asks for — actively breaks the feature:
  // the effect re-runs on the very next render, its cleanup clears the pending
  // timeout, and `autoPrintAttemptedRef` (already true by then) stops it
  // rescheduling, so the print dialog never opens at all. Reading the latest
  // function off a ref instead means the effect depends only on the conditions
  // that should actually re-trigger it, and still calls the current closure.
  const handlePrintRef = useRef(handlePrint);
  useEffect(() => {
    handlePrintRef.current = handlePrint;
  });

  // Fire a print queued while the layout was still measuring, the moment it's
  // ready. Guarded on `printPending` so it only runs for a click that's
  // actually waiting, and `handlePrint` clears the flag as it proceeds so this
  // fires once, not on every subsequent settle.
  useEffect(() => {
    if (printPending && printLayoutReady && !purchaseBusy && !cookbookPurchaseBusy) {
      void handlePrintRef.current();
    }
  }, [printPending, printLayoutReady, purchaseBusy, cookbookPurchaseBusy]);

  // Export a chosen cookbook format: this runs AFTER React has committed the
  // deck's `.rp-exporting` class + geometry vars, so `window.print()` captures
  // the page at that format. Clearing `exportPreset` right after drops the deck
  // back to the plain Letter preview (the print snapshot is already taken). Only
  // depends on `exportPreset`; `printNow` is read as a fresh closure each render,
  // and the null guard makes a re-run a no-op.
  useEffect(() => {
    if (!exportPreset) return;
    printNow();
    setExportPreset(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportPreset]);

  const moveProjectItem = projectMeta.moveItem;

  useEffect(() => {
    if (!accountProjectId || !cookPilotAuthReady || !projectMeta.hydrated || !queue.hydrated) return;
    if (!cookPilotUser) {
      setProjectLoading(false);
      setCookPilotLoginReason("default");
      setShowCookPilotLogin(true);
      return;
    }
    let cancelled = false;
    setProjectLoading(true);
    loadPrintProject(cookPilotUser.uid, accountProjectId)
      .then((project) => {
        if (cancelled) return;
        if (!project) {
          showToast("That saved project could not be found.");
          return;
        }
        const loadedItems = project.sections.flatMap((section) => section.items);
        queue.replaceAll(loadedItems);
        setItems(loadedItems);
        createCurrentPrintJob(loadedItems.map((item) => item.id));
        projectMeta.replaceMeta({
          projectId: project.id,
          cookbookMode: project.settings.cookbookMode ?? project.kind === "cookbook",
          cookbookWelcomeCompleted: project.settings.cookbookWelcomeCompleted,
          cookbookPreset: project.settings.bookPreset,
          tableOfContents: project.settings.tableOfContents,
          sectionDividers: project.settings.sectionDividers,
          tocKicker: project.settings.tocKicker,
          tocTitle: project.settings.tocTitle,
          photoStyle: project.settings.photoStyle,
          cover: project.cover,
          backCover: project.backCover,
          dedication: project.dedication,
          frontMatter: project.frontMatter,
          itemPlacements: project.itemPlacements,
          sections: project.sections.map((section) => ({
            id: section.id,
            title: section.title,
            subtitle: section.subtitle,
            photoUrl: section.photoUrl,
            intro: section.intro,
            showOpener: section.showOpener,
            numberAsChapter: section.numberAsChapter,
            itemIds: section.items.map((item) => item.id),
          })),
        });
        if (isPrintCardSize(project.settings.cardSize)) setCardSize(project.settings.cardSize);
        if (isRecipePrintTemplate(project.settings.template)) setTemplate(project.settings.template);
        setDoubleSided(project.settings.doubleSided);
        setShowPhoto(project.settings.showPhoto);
        setShowSourceUrl(project.settings.showSourceUrl);
        setShowCutLines(project.settings.showCutLines);
        projectRevisionRef.current = Number(project.revision ?? 0);
        setSavedProjectId(project.id);
        lastSavedFingerprintRef.current = "__loaded__";
        setSaveStatus("saved");
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("RecipePrinter: could not open project", error);
          showToast("That saved project couldn't be opened.");
        }
      })
      .finally(() => {
        if (!cancelled) setProjectLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The hydration methods are stable; the URL/account are the load identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountProjectId, cookPilotAuthReady, cookPilotUser?.uid, projectMeta.hydrated, queue.hydrated]);

  useEffect(() => {
    if (accountProjectId) return;
    const fullQueue = readQueue();
    initialQueueIdsRef.current = new Set(fullQueue.map((it) => it.id));
    const byId = new Map(fullQueue.map((it) => [it.id, it]));
    const idsFromUrl = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const ids =
      (idsFromUrl.length > 0 ? idsFromUrl : readCurrentPrintJobIds()) ??
      fullQueue.filter((it) => it.status === "ready").map((it) => it.id);
    // Preserve the order from the current print job.
    const printItems = ids
      .map((id) => byId.get(id))
      .filter((it): it is QueueItem => Boolean(it && it.status === "ready" && it.recipe));
    setItems(printItems);
  }, [accountProjectId, idsParam]);

  const saveFingerprint = useMemo(
    () =>
      JSON.stringify({
        items,
        meta: projectMeta.meta,
        cardSize,
        template,
        doubleSided,
        showPhoto,
        showSourceUrl,
        showCutLines,
      }),
    [items, projectMeta.meta, cardSize, template, doubleSided, showPhoto, showSourceUrl, showCutLines],
  );

  useEffect(() => {
    if (projectLoading || !items?.length) return;
    // Plain recipe cards with no saved project: nothing to save or adopt, so
    // clear any leftover status (e.g. an "adoption" prompt carried over from a
    // cookbook the cook just switched away from).
    if (!cookbookMode && !savedProjectId) {
      if (saveStatus) setSaveStatus(null);
      return;
    }
    if (lastSavedFingerprintRef.current === "__loaded__") {
      lastSavedFingerprintRef.current = saveFingerprint;
      return;
    }
    if (!cookPilotUser) {
      setSaveStatus("adoption");
      return;
    }
    if (saveFingerprint === lastSavedFingerprintRef.current || saveStatus === "conflict") return;
    // Only autosave once per genuine content change. Without this, a failed save
    // (e.g. a permissions error) never advances lastSavedFingerprintRef, so every
    // saveStatus flip re-fires this effect and re-schedules the identical save —
    // an unbounded retry storm. Manual retry and the reconnect handler still call
    // handleSaveProject directly, so real retries keep working.
    if (saveFingerprint === lastAttemptedFingerprintRef.current) return;
    const timer = window.setTimeout(() => {
      lastAttemptedFingerprintRef.current = saveFingerprint;
      void handleSaveProject();
    }, 1500);
    return () => window.clearTimeout(timer);
    // handleSaveProject intentionally reads the latest render state after the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    saveFingerprint,
    projectLoading,
    items,
    cookbookMode,
    savedProjectId,
    cookPilotUser,
    saveStatus,
  ]);

  useEffect(() => {
    const online = () => {
      if (saveStatus === "offline") void handleSaveProject();
    };
    const offline = () => {
      if (cookbookMode || savedProjectId) setSaveStatus("offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus, cookbookMode, savedProjectId]);

  // Pulls recipes added via the Add recipe dialog into this print job once
  // they finish parsing — keeps running even after the dialog closes, so a
  // slow parse still lands here. `initialQueueIdsRef` excludes anything that
  // was already queued (but not selected for this job) before the dialog was
  // ever opened.
  useEffect(() => {
    const newlyReady = queue.items.filter(
      (item) =>
        item.status === "ready" &&
        item.recipe &&
        !initialQueueIdsRef.current.has(item.id) &&
        !(items ?? []).some((existing) => existing.id === item.id),
    );
    if (newlyReady.length === 0) return;
    const nextItems = [...(items ?? []), ...newlyReady];
    setItems(nextItems);
    createCurrentPrintJob(nextItems.map((item) => item.id));
    if (pendingAddSectionId && sections.some((section) => section.id === pendingAddSectionId)) {
      const insertAt = itemIdsForSection(pendingAddSectionId).length;
      newlyReady.forEach((item, offset) => {
        moveProjectItem(item.id, pendingAddSectionId, insertAt + offset);
      });
    }
    setPendingFocusRecipeId((current) => current ?? newlyReady[0]!.id);
  }, [queue.items, items, itemIdsForSection, moveProjectItem, pendingAddSectionId, sections]);

  // Surfaces a parse failure for a dialog-added recipe as a toast, since the
  // dialog that submitted it is already closed by the time parsing fails.
  useEffect(() => {
    const newlyErrored = queue.items.find(
      (item) =>
        item.status === "error" &&
        !initialQueueIdsRef.current.has(item.id) &&
        !toastedErrorIdsRef.current.has(item.id),
    );
    if (!newlyErrored) return;
    toastedErrorIdsRef.current.add(newlyErrored.id);
    setToastMessage(
      newlyErrored.error ||
        "That recipe looks incomplete. Add a title, ingredients, and directions, then try again.",
    );
  }, [queue.items]);

  // Re-importing a recipe that's already in this print job doesn't add a
  // duplicate — the queue focuses the existing item (bumping `focusNonce`).
  // Mirror the home queue's cue here: scroll the deck to that recipe and shake
  // its rail row so it's obvious why nothing new appeared. Keyed on
  // `focusNonce` so a repeat import of the same recipe re-fires.
  useEffect(() => {
    if (queue.focusNonce === 0) return;
    const id = queue.focusedItemId;
    if (!id || !(items ?? []).some((it) => it.id === id)) return;
    setPendingFocusRecipeId(id);
    setRailShake({ recipeId: id, nonce: queue.focusNonce });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.focusNonce]);

  // Drop the shake class once the animation has run so a later duplicate can
  // re-add it.
  useEffect(() => {
    if (!railShake) return;
    const timer = window.setTimeout(() => setRailShake(null), 600);
    return () => window.clearTimeout(timer);
  }, [railShake]);

  // Close the rail's "Add" overflow menu and the multi-select bulk menu on an
  // outside click or Escape (same pattern as the import/list menus).
  useEffect(() => {
    if (!addMenuOpen && !railBulkMenu) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (addMenuOpen && !addMenuRef.current?.contains(target)) setAddMenuOpen(false);
      if (railBulkMenu && !railBulkRef.current?.contains(target)) setRailBulkMenu(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAddMenuOpen(false);
      setRailBulkMenu(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addMenuOpen, railBulkMenu]);

  // Selection is a cookbook-only, page-scoped concern: drop it whenever we leave
  // cookbook mode or the recipe set changes, so stale ids can't linger.
  useEffect(() => {
    setSelectedRailIds((current) => (current.size ? new Set() : current));
    setRailBulkMenu(null);
  }, [cookbookMode, items]);

  // Whether the "Print settings" trigger is reachable — purely card-format
  // concerns now (a back side to toggle, or 6x4's cut lines). Cookbook book
  // settings live inline in the Print setup panel (see `renderBookSettings`), so
  // in a cookbook there's nothing behind this trigger and it stays hidden.
  const hasPrintSettingsFields =
    !projectMeta.meta.cookbookMode && (hasRecipeBackSide || cardSize === "card-6x4");

  function renderModeSwitch() {
    if (!COOKBOOK_ENABLED) return null;
    return (
      <ModeSwitch
        inCookbook={Boolean(projectMeta.meta.cookbookMode)}
        onSwitchToCards={() => setShowExitCookbookConfirm(true)}
        onSwitchToCookbook={startCookbook}
      />
    );
  }

  // Card-format print settings (behind the "Print settings" trigger). Cookbook
  // book settings are NOT here — they're inline in the panel (see
  // `renderBookSettings`), so a cookbook never opens this at all.
  function renderPrintSettingsFields() {
    return (
      <>
        {cardSize === "card-6x4" && (
          <label className="recipe-toggle">
            <input
              type="checkbox"
              checked={showCutLines}
              onChange={(event) => setShowCutLines(event.target.checked)}
            />
            <span>
              <strong>Cut lines</strong>
            </span>
          </label>
        )}
        {/* Two-sided is a plain-card concept only: a bound cookbook flows
            overflow onto the next page, not the back of a leaf (see
            `continueOnBack`), so the toggle would do nothing there. */}
        {hasRecipeBackSide && !projectMeta.meta.cookbookMode && (
          <label className="recipe-toggle">
            <input
              type="checkbox"
              checked={doubleSided}
              onChange={(event) => setDoubleSided(event.target.checked)}
            />
            <span>
              <strong>Two-sided</strong>
              <small>Longer recipes continue onto the back.</small>
            </span>
          </label>
        )}
        {hasRecipeBackSide && doubleSided && !projectMeta.meta.cookbookMode && (
          <p className="recipe-print-settings-banner" role="note">
            Turn on two-sided printing in your printer&apos;s settings, flipped on the{" "}
            <strong>long edge</strong>.
          </p>
        )}
      </>
    );
  }

  function renderBookDesignSettings() {
    if (!projectMeta.meta.cookbookMode) return null;
    return (
      <div className="recipe-config-section recipe-config-section--settings">
        <span className="recipe-config-label">Include</span>
        <label className="recipe-toggle">
          <input
            type="checkbox"
            checked={Boolean(projectMeta.meta.tableOfContents)}
            onChange={(event) => projectMeta.setTableOfContents(event.target.checked)}
          />
          <span>
            <strong>Table of contents</strong>
          </span>
        </label>
        <label className="recipe-toggle">
          <input
            type="checkbox"
            checked={Boolean(projectMeta.meta.frontMatter || projectMeta.meta.dedication)}
            onChange={toggleDedication}
          />
          <span>
            <strong>Opening page</strong>
          </span>
        </label>
        {anyRecipeHasSourceUrl && (
          <label className="recipe-toggle">
            <input
              type="checkbox"
              checked={showSourceUrl}
              onChange={(event) => setShowSourceUrl(event.target.checked)}
            />
            <span>
              <strong>Recipe link</strong>
            </span>
          </label>
        )}
      </div>
    );
  }

  usePrintSettingsPersistence(params, {
    cardSize,
    setCardSize,
    template,
    setTemplate,
    doubleSided,
    setDoubleSided,
    showCutLines,
    setShowCutLines,
    showPhoto,
    setShowPhoto,
    showSourceUrl,
    setShowSourceUrl,
  });

  // Auto-open the print dialog when the user chose Print instead of Preview.
  useEffect(() => {
    if (
      shouldPrint &&
      items &&
      items.length > 0 &&
      printLayoutReady &&
      (!selectedPremiumTemplate || revenueCatUserId) &&
      (!projectMeta.meta.cookbookMode || revenueCatUserId) &&
      !autoPrintAttemptedRef.current
    ) {
      autoPrintAttemptedRef.current = true;
      const t = window.setTimeout(() => void handlePrintRef.current(), 350);
      return () => window.clearTimeout(t);
    }
  }, [
    items,
    revenueCatUserId,
    selectedPremiumTemplate,
    shouldPrint,
    template,
    customerInfo,
    printLayoutReady,
    projectMeta.meta.cookbookMode,
  ]);

  useEffect(() => {
    if (cookPilotRedirectError) showToast(cookPilotRedirectError);
  }, [cookPilotRedirectError]);

  useEffect(() => {
    if (!cookPilotUser || revenueCatUserId !== cookPilotUser.uid) return;
    localStore.remove(UNPROTECTED_PURCHASE_STORAGE_KEY);
    setShowCookPilotLogin(false);
  }, [cookPilotUser, revenueCatUserId]);

  useEffect(() => {
    if (
      !cookPilotAuthReady ||
      cookPilotUser ||
      !items?.length ||
      unprotectedPromptShownRef.current ||
      localStore.get(UNPROTECTED_PURCHASE_STORAGE_KEY) !== "1"
    ) {
      return;
    }
    unprotectedPromptShownRef.current = true;
    setCookPilotLoginReason("purchase");
    setShowCookPilotLogin(true);
  }, [cookPilotAuthReady, cookPilotUser, items]);

  useEffect(() => {
    if (!cookPilotUser) {
      setFreeTemplateStatus(null);
      setIsRecipePrinterAdmin(false);
      return;
    }
    let cancelled = false;
    loadRecipePrinterUserProfile(cookPilotUser.uid)
      .then((profile) => {
        if (cancelled) return;
        setFreeTemplateStatus(profile.freeTemplateStatus);
        setIsRecipePrinterAdmin(profile.isAdmin);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("RecipePrinter: could not load free-template status", error);
        setIsRecipePrinterAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cookPilotUser]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    function handleAfterPrint() {
      if (!printRequestedRef.current) return;
      printRequestedRef.current = false;
      // Undo the cookbook filename override once the print dialog closes.
      if (previousDocTitleRef.current !== null) {
        document.title = previousDocTitleRef.current;
        previousDocTitleRef.current = null;
      }
      track("print_dialog_closed", {
        template,
        cardSize,
        cookbookPreset: cookbookMode ? activePreset.id : undefined,
      });
      // A cookbook's post-export screen is shown at purchase/print time, not
      // here: afterprint fires whether the user saved, printed, or cancelled, so
      // it can't stand in for "you exported a cookbook". Only plain-card prints
      // get the donate/feedback nudge.
      if (cookbookMode) return;
      const postPrintAction = postPrintActionRef.current;
      postPrintActionRef.current = "donate";
      const prompt = postPrintPrompt(postPrintAction, !shouldShowPostPrintDialog());
      if (!prompt) return;
      if (prompt === "protect-purchase") {
        setCookPilotLoginReason("purchase");
        window.setTimeout(() => setShowCookPilotLogin(true), 150);
        return;
      }

      markPostPrintDialogShown();
      window.setTimeout(() => setShowDonateDialog(true), 150);
    }

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
    // template/cardSize/cookbook state are read inside the handler, so the
    // listener has to be re-registered when they change or it would report a
    // stale configuration.
  }, [template, cardSize, cookbookMode, activePreset.id]);

  if (items === null) {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader onBack={handleBack} compact sticky />
        <div className="flex-1 grid place-items-center text-ink-soft">Preparing…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader onBack={handleBack} compact sticky />
        <div className="flex-1 flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
          <p className="font-bold text-cp-h2">Nothing to print</p>
          <p className="text-ink-soft max-w-sm">
            We couldn&apos;t find those recipes. They may have been removed, or this page was
            opened directly.
          </p>
          <Link href="/" className="btn btn-primary">
            Back to your recipes
          </Link>
        </div>
      </div>
    );
  }

  // ── Shared deck pieces (single-page deck + cookbook two-page-spread deck) ──
  // The floating controls for the active/focused page: side flip, per-recipe
  // layout picker, and the Edit/Done toggle. `navItem` is always the focused
  // item; `previewW` sizes the control bar to the page (or spread) width.
  const renderActiveControls = (
    navItem: NavItem,
    previewW: number,
    horizontalOffset = 0,
  ) => (
    <div
      className="recipe-page-canvas__controls no-print"
      style={{
        "--preview-w": `${previewW}px`,
        "--preview-offset": `${horizontalOffset}px`,
      } as CSSProperties}
    >
      <div className="recipe-page-canvas__controls-center">
        {navItem.flip && (
          <div className="recipe-card-side-nav" aria-label="Sheet sides">
            <button
              type="button"
              className="recipe-card-side-nav__button"
              aria-label="Show front"
              disabled={canvasSide === "front"}
              onClick={(event) => {
                event.stopPropagation();
                setCanvasSide("front");
              }}
            >
              <ChevronLeftIcon size={ICON_SIZE.md} />
            </button>
            <span>{canvasSide === "front" ? "Front" : "Back"}</span>
            <button
              type="button"
              className="recipe-card-side-nav__button"
              aria-label="Show back"
              disabled={canvasSide === "back"}
              onClick={(event) => {
                event.stopPropagation();
                setCanvasSide("back");
              }}
            >
              <ChevronRightIcon size={ICON_SIZE.md} />
            </button>
          </div>
        )}
      </div>
      {navItem.kind !== "image" && (
        <div className="recipe-page-canvas__controls-right">
          {/* The photo control only appears once you're editing the recipe —
              same "Edit first, then change the photo" flow as the cover and
              chapter pages, rather than an always-on control. */}
          {projectMeta.meta.cookbookMode &&
            navItem.kind === "recipe" &&
            pageEditMode &&
            renderPagePhotoControl(navItem.recipeId)}
          <button
            type="button"
            className={`recipe-page-edit-toggle ${
              (navItem.kind === "recipe" && pageEditMode) ||
              (navItem.kind === "divider" && editingSectionId === navItem.recipeId) ||
              (navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)) ||
              (navItem.kind === "toc" && editingToc)
                ? "is-active"
                : ""
            }`}
            aria-pressed={
              (navItem.kind === "recipe" && pageEditMode) ||
              (navItem.kind === "divider" && editingSectionId === navItem.recipeId) ||
              (navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)) ||
              (navItem.kind === "toc" && editingToc)
            }
            onClick={(event) => {
              event.stopPropagation();
              if (navItem.kind === "recipe") {
                togglePageEditMode();
              } else if (navItem.kind === "divider") {
                if (editingSectionId === navItem.recipeId) commitSectionEdit();
                else startSectionEdit(navItem.recipeId);
              } else if (navItem.kind === "toc") {
                setEditingToc((current) => !current);
              } else {
                const side = coverSideFromNavItem(navItem);
                setEditingCoverSide((current) => (current === side ? null : side));
              }
            }}
          >
            <EditIcon size={ICON_SIZE.xs} />
            {(navItem.kind === "recipe" && pageEditMode) ||
            (navItem.kind === "divider" && editingSectionId === navItem.recipeId) ||
            (navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)) ||
            (navItem.kind === "toc" && editingToc)
              ? "Done"
              : "Edit"}
          </button>
        </div>
      )}
    </div>
  );

  // One page's ScaledPage with all its edit wiring. `focused` = this is the page
  // the controls act on (drives the active side + which edit surface is live).
  const renderDeckPage = (
    navItem: NavItem,
    sheet: PageSheet,
    focused: boolean,
    role: "left" | "right" | "single" = "single",
  ) => (
    <ScaledPage
      sheet={sheet}
      isLastSheet={navItem.sheetIndex === sheets.length - 1}
      activeSlotIndex={navItem.slotIndex}
      activeSide={focused ? canvasSide : "front"}
      scale={deckScale}
      size={previewCardSize}
      template={previewTemplate}
      doubleSided={continueOnBack}
      gutterSide={gutterSideForRole(role)}
      cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
      showSourceUrl={
        sourceUrlOn ||
        (showSourceUrl && pageEditMode && focused && activeRecipeItem?.id === navItem.recipeId)
      }
      showCutLines={showCutLines && cardSize === "card-6x4"}
      inlineEdit={
        pageEditMode && focused && activeRecipeItem?.id === navItem.recipeId && activeInlineEdit
          ? {
              ...activeInlineEdit,
              // The recipe's own photo only (plus upload), not other recipes'.
              recipeImages: activeRecipeItem?.recipe?.image ? [activeRecipeItem.recipe.image] : [],
            }
          : undefined
      }
      dividerEdit={
        focused && navItem.kind === "divider" && editingSectionId === navItem.recipeId
          ? {
              sectionId: navItem.recipeId,
              value: editingSectionTitle,
              // Save the title live (like the subtitle/intro), so blurring the
              // field — to click the photo picker or another field — never loses
              // or dismisses the edit.
              onChange: (value) => {
                setEditingSectionTitle(value);
                projectMeta.renameSection(navItem.recipeId, value.trim() || undefined);
              },
              onCommit: commitSectionEdit,
              onCancel: () => {
                setEditingSectionId(null);
                setEditingSectionTitle("");
              },
              subtitle: sections.find((section) => section.id === navItem.recipeId)?.subtitle,
              onSubtitleChange: (value) =>
                projectMeta.updateSection(navItem.recipeId, { subtitle: value || undefined }),
              intro: sections.find((section) => section.id === navItem.recipeId)?.intro,
              onIntroChange: (value) => projectMeta.setSectionIntro(navItem.recipeId, value || undefined),
              photoUrl: sections.find((section) => section.id === navItem.recipeId)?.photoUrl,
              recipeImages: coverPhotoCandidates,
              onPhotoChange: (url) => projectMeta.setSectionPhoto(navItem.recipeId, url),
            }
          : undefined
      }
      coverEdit={
        focused && navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)
          ? {
              side: coverSideFromNavItem(navItem),
              cover: coverForSide(coverSideFromNavItem(navItem)) ?? defaultCover(),
              onChange: (cover) => setCoverForSide(coverSideFromNavItem(navItem), cover),
              recipeImages: coverPhotoCandidates,
            }
          : undefined
      }
      imageEdit={
        // The photo is the whole page, so it's repositionable as soon as it's
        // focused (drag), and its "Change photo" control lives right here on the
        // image — not orphaned inside the facing recipe card.
        focused && navItem.kind === "image"
          ? {
              focusX: projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroFocusX ?? 50,
              focusY: projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroFocusY ?? 50,
              onChange: (focusX, focusY) =>
                projectMeta.setItemPlacement(navItem.recipeId, { heroFocusX: focusX, heroFocusY: focusY }),
              current:
                projectMeta.meta.itemPlacements?.[navItem.recipeId]?.heroImageUrl ??
                items?.find((item) => item.id === navItem.recipeId)?.recipe?.image,
              // Only this recipe's own photo (plus upload) — never a grid of
              // OTHER recipes' images, which isn't what "change this photo" means.
              images: (() => {
                const own = items?.find((item) => item.id === navItem.recipeId)?.recipe?.image;
                return own ? [own] : [];
              })(),
              // Pick a new full-page photo, or clear it to drop back to no photo.
              onImageChange: (url) =>
                url
                  ? projectMeta.setItemPhotoMode(navItem.recipeId, "full", url)
                  : setRecipePhotoMode(navItem.recipeId, "none"),
            }
          : undefined
      }
      tocKicker={projectMeta.meta.tocKicker}
      tocTitle={projectMeta.meta.tocTitle}
      tocEdit={
        focused && navItem.kind === "toc" && editingToc
          ? {
              kicker: projectMeta.meta.tocKicker ?? "Contents",
              title: projectMeta.meta.tocTitle ?? "What's inside",
              onKickerChange: projectMeta.setTocKicker,
              onTitleChange: projectMeta.setTocTitle,
            }
          : undefined
      }
    />
  );

  return (
    <div className="h-dvh recipe-print-page">
      {measurers}
      <SiteHeader
        onBack={handleBack}
        compact
        sticky
        centerActions
        actions={renderModeSwitch()}
        saveStatus={saveStatus}
        onRetrySave={handleRetrySave}
      />

      {/* Print preview / printed content */}
      <main
        className={`recipe-print-shell px-cp-6 print:p-0 ${
          previewMeasuring ? "recipe-print-shell--measuring" : ""
        } ${showCookbookOfferDialog || cookbookBuilding ? "recipe-print-shell--entering-cookbook" : ""} ${
          showOrganizeCookbook ? "recipe-print-shell--organizing" : ""
        }`}
      >
        <OrganizeCookbookDialog
          open={showOrganizeCookbook}
          items={items ?? []}
          onApply={applyCookbookOrganization}
          onCancel={() => {
            track("relayout_cancelled", {});
            setShowOrganizeCookbook(false);
          }}
          onSectionCreated={() => track("section_created", { source: "organize" })}
          onOpenerToggled={(enabled) =>
            track("section_opener_toggled", { enabled, source: "organize" })
          }
        />
        <nav
          className={`recipe-page-rail recipe-page-rail--${previewCardSize} no-print`}
          aria-label="Pages"
        >
          {projectMeta.meta.cookbookMode && !projectMeta.meta.cover && (
            <button
              type="button"
              className="recipe-page-rail__add-cover"
              onClick={() => {
                setAddMenuOpen(false);
                addCover();
              }}
            >
              <PlusIcon size={ICON_SIZE.sm} />
              Add cover
            </button>
          )}
          {cookbookView
            ? (() => {
                const navFor = (sheetIndex: number | null) =>
                  sheetIndex != null && navIndexForSheet.has(sheetIndex)
                    ? navItems[navIndexForSheet.get(sheetIndex)!]
                    : null;
                const namedSectionIdFor = (nav: NavItem | null) => {
                  const found = nav?.kind === "recipe" ? sectionForNavItem(nav) : null;
                  return found && sections[found.index]?.title?.trim() ? found.id : null;
                };
                // One rail entry per LOGICAL unit: an image-spread (a recipe's
                // full-page photo + the recipe) is ONE unit shown as a mini
                // two-page thumbnail; a spread of two independent pages
                // (dedication + contents, or two different recipes) splits into
                // one single-page thumbnail each.
                type RailUnit = {
                  num: number;
                  index: number;
                  focusSheet: number | null;
                  nav: NavItem | null;
                  thumbSheets: number[];
                  label: string;
                  soleUnit: boolean;
                  sectionId: string | null;
                };
                const units: RailUnit[] = [];
                const addUnit = (unit: Omit<RailUnit, "num">) =>
                  units.push({ ...unit, num: units.length + 1 });
                spreads.forEach((spread, index) => {
                  const leftNav = navFor(spread.left);
                  const rightNav = navFor(spread.right);
                  const leftIsImage = spread.left != null && sheets[spread.left]?.layoutKind === "image";
                  const rightIsImage = spread.right != null && sheets[spread.right]?.layoutKind === "image";
                  if (leftIsImage || rightIsImage) {
                    const recipeSheet = leftIsImage ? spread.right : spread.left;
                    const recipeNav = [rightNav, leftNav].find((item) => item?.kind === "recipe") ?? null;
                    addUnit({
                      index,
                      focusSheet: recipeSheet,
                      nav: recipeNav,
                      thumbSheets: [spread.left, spread.right].filter((s): s is number => s != null),
                      label: recipeNav?.label ?? "Recipe",
                      soleUnit: true,
                      sectionId: namedSectionIdFor(recipeNav),
                    });
                  } else if (spread.single) {
                    const nav = rightNav ?? leftNav;
                    const sheet = spread.right ?? spread.left;
                    addUnit({
                      index,
                      focusSheet: sheet,
                      nav,
                      thumbSheets: sheet != null ? [sheet] : [],
                      label: nav?.label ?? "Page",
                      soleUnit: true,
                      sectionId: namedSectionIdFor(nav),
                    });
                  } else {
                    const sides = [
                      { sheet: spread.left, nav: leftNav },
                      { sheet: spread.right, nav: rightNav },
                    ].filter((side) => side.sheet != null && side.nav);
                    sides.forEach(({ sheet, nav }) =>
                      addUnit({
                        index,
                        focusSheet: sheet,
                        nav,
                        thumbSheets: [sheet as number],
                        label: nav!.label ?? "Page",
                        soleUnit: sides.length === 1,
                        sectionId: namedSectionIdFor(nav),
                      }),
                    );
                  }
                });
                const groups: Array<{ key: string; sectionId: string | null; units: RailUnit[] }> = [];
                units.forEach((unit) => {
                  const previous = groups[groups.length - 1];
                  if (previous && unit.sectionId && previous.sectionId === unit.sectionId) {
                    previous.units.push(unit);
                  } else {
                    groups.push({
                      key: unit.sectionId ? `${unit.sectionId}-${unit.num}` : `unit-${unit.num}`,
                      sectionId: unit.sectionId,
                      units: [unit],
                    });
                  }
                });
                return groups.map((group) => (
                  <div
                    key={group.key}
                    className={`recipe-page-rail__section-group ${
                      group.sectionId ? "recipe-page-rail__section-group--nested" : ""
                    }`}
                  >
                  {group.units.map((unit, unitIdx) => {
                const recipeNav = unit.nav?.kind === "recipe" ? unit.nav : null;
                const dividerNav = unit.nav?.kind === "divider" ? unit.nav : null;
                const dividerSection = dividerNav ? sectionForNavItem(dividerNav) : null;
                const section = unit.sectionId
                  ? sections.find((entry) => entry.id === unit.sectionId)
                  : undefined;
                const isFirstInSection =
                  Boolean(unit.sectionId) &&
                  (unitIdx === 0 || group.units[unitIdx - 1]?.sectionId !== unit.sectionId);
                // Header (with "Add opener") only for a named section that has no
                // opener page — the opener page is itself the section's title.
                const showSectionHeader =
                  Boolean(section?.title?.trim()) && isFirstInSection && !section?.showOpener;
                const isActive =
                  unit.index === activeNavIndex && (unit.soleUnit || focusedSheet === unit.focusSheet);
                const isSpreadThumb = unit.thumbSheets.length === 2;
                return (
                  <div
                    key={`rail-unit-${unit.num}`}
                    className={`recipe-page-rail__row ${
                      unit.sectionId ? "recipe-page-rail__row--section-child" : ""
                    } ${isFirstInSection ? "recipe-page-rail__row--section-first" : ""}`}
                  >
                    {showSectionHeader && section && (
                      <div
                        className="recipe-page-rail__section-header"
                        onDragOver={(event) => {
                          if (draggingItemId) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          handleDropIntoSection(section.id, 0);
                        }}
                      >
                        <span>{section.title}</span>
                        <button
                          type="button"
                          className="recipe-page-rail__section-opener"
                          aria-pressed={Boolean(section.showOpener)}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSectionOpener(section.id, !section.showOpener);
                          }}
                        >
                          {section.showOpener ? "Opener on" : "Add opener"}
                        </button>
                      </div>
                    )}
                    <div
                      className={`recipe-page-rail__item ${isActive ? "is-active" : ""} ${
                        draggingItemId === recipeNav?.recipeId ? "is-dragging" : ""
                      } ${recipeNav && railShake?.recipeId === recipeNav.recipeId ? "is-shaking" : ""} ${
                        recipeNav && effectiveRailSelection.has(recipeNav.recipeId) ? "is-selected" : ""
                      }`}
                    >
                      <button
                        type="button"
                        draggable={Boolean(recipeNav)}
                        onDragStart={() => recipeNav && setDraggingItemId(recipeNav.recipeId)}
                        onDragOver={(event) => {
                          if (draggingItemId && (recipeNav || dividerSection)) event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          if (recipeNav) handleDropOnItem(recipeNav.recipeId);
                          else if (dividerSection) handleDropIntoSection(dividerSection.id, 0);
                        }}
                        onDragEnd={() => setDraggingItemId(null)}
                        className="recipe-page-rail__item-main"
                        aria-current={isActive}
                        aria-pressed={recipeNav ? effectiveRailSelection.has(recipeNav.recipeId) : undefined}
                        onClick={(event) => {
                          // Shift-click range-selects; Cmd/Ctrl-click toggles one;
                          // a plain click clears any selection and navigates.
                          if (recipeNav && event.shiftKey) {
                            event.preventDefault();
                            event.stopPropagation();
                            selectRailRange(recipeNav.recipeId);
                            return;
                          }
                          if (recipeNav && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleRailSelection(recipeNav.recipeId);
                            return;
                          }
                          if (selectedRailIds.size) clearRailSelection();
                          setRailAnchorId(recipeNav?.recipeId ?? null);
                          goToSlide(unit.index);
                          if (unit.focusSheet != null) setFocusedSheetIndex(unit.focusSheet);
                        }}
                      >
                        <span className="recipe-page-rail__num">{unit.num}</span>
                        <span
                          className={`recipe-page-rail__thumb ${
                            isSpreadThumb ? "recipe-page-rail__thumb--spread" : ""
                          }`}
                        >
                          {unit.thumbSheets.map((sheetIndex, thumbIdx) =>
                            sheets[sheetIndex] ? (
                              <ScaledPage
                                key={thumbIdx}
                                sheet={sheets[sheetIndex]}
                                isLastSheet={sheetIndex === sheets.length - 1}
                                activeSlotIndex={0}
                                activeSide="front"
                                // Same zoom as a single thumb — a mini-spread just
                                // crops each page into a half-width window (see the
                                // --spread scaler rule) so both fit side by side.
                                scale={RAIL_SCALE[cardSize]}
                                size={previewCardSize}
                                template={previewTemplate}
                                doubleSided={continueOnBack}
                                showSourceUrl={previewSourceUrlOn}
                                showCutLines={false}
                                cookbookMode
                              />
                            ) : null,
                          )}
                        </span>
                        <span className="recipe-page-rail__label">
                          <span className="recipe-page-rail__title">{unit.label}</span>
                        </span>
                      </button>
                    </div>
                  </div>
                );
                  })}
                  </div>
                ));
              })()
            : railRows.map(({ header, navItem, index }) => {
            const headerSectionId =
              header && navItem.kind === "recipe" ? sectionAndIndexForItem(navItem.recipeId)?.sectionId : null;
            const currentSection = sectionForNavItem(navItem);
            const nextSection = sectionForNavItem(railRows[index + 1]?.navItem ?? null);
            const showSectionEndDrop =
              Boolean(currentSection) && currentSection?.id !== nextSection?.id;
            const isSectionChild =
              Boolean(currentSection && sections[currentSection.index]?.showOpener) &&
              navItem.kind === "recipe" &&
              Boolean(currentSection && sectionTitleForId(currentSection.id) !== "section");
            return (
              <div
                key={`${sheets[navItem.sheetIndex]?.id}-${navItem.slotIndex}`}
                className={isSectionChild ? "recipe-page-rail__row recipe-page-rail__row--section-child" : "recipe-page-rail__row"}
              >
                {header && headerSectionId && (
                  <div
                    className="recipe-page-rail__section-header"
                    onDragOver={(event) => {
                      if (draggingItemId) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDropIntoSection(headerSectionId, 0);
                    }}
                  >
                    <span>{header}</span>
                  </div>
                )}
                <div
                  className={`recipe-page-rail__item ${
                    index === activeNavIndex ? "is-active" : ""
                  } ${draggingItemId === navItem.recipeId ? "is-dragging" : ""} ${
                    navItem.kind === "recipe" && railShake?.recipeId === navItem.recipeId
                      ? "is-shaking"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    draggable={navItem.kind === "recipe"}
                    onDragStart={() => navItem.kind === "recipe" && setDraggingItemId(navItem.recipeId)}
                    onDragOver={(event) => {
                      if (draggingItemId && navItem.kind !== "cover") event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (navItem.kind === "recipe") handleDropOnItem(navItem.recipeId);
                      if (navItem.kind === "divider") handleDropIntoSection(navItem.recipeId, 0);
                    }}
                    onDragEnd={() => setDraggingItemId(null)}
                    className="recipe-page-rail__item-main"
                    aria-current={index === activeNavIndex}
                    onClick={() => goToSlide(index)}
                  >
                    <span className="recipe-page-rail__num">{index + 1}</span>
                    <span className="recipe-page-rail__thumb">
                      <ScaledPage
                        sheet={sheets[navItem.sheetIndex]}
                        isLastSheet={navItem.sheetIndex === sheets.length - 1}
                        activeSlotIndex={navItem.slotIndex}
                        activeSide="front"
                        scale={RAIL_SCALE[cardSize]}
                        size={previewCardSize}
                        template={previewTemplate}
                        doubleSided={continueOnBack}
                        showSourceUrl={previewSourceUrlOn}
                        showCutLines={false}
                        cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
                      />
                    </span>
                    <span className="recipe-page-rail__label">
                      <span className="recipe-page-rail__title">{navItem.label}</span>
                      <span className="recipe-page-rail__meta">{navItem.pageLabel}</span>
                    </span>
                  </button>
                </div>
                {showSectionEndDrop && currentSection && (
                  <div
                    className="recipe-page-rail__section-drop"
                    aria-label={`Drop at end of ${sectionTitleForId(currentSection.id)}`}
                    onDragOver={(event) => {
                      if (draggingItemId) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDropIntoSection(currentSection.id, itemIdsForSection(currentSection.id).length);
                    }}
                  />
                )}
              </div>
            );
          })}

          <div className="recipe-page-rail__footer">
            {/* Floating selection pill — sits above the Add recipe row instead of
                pushing the list down; one "Group (N)" control + a clear. */}
            {projectMeta.meta.cookbookMode && effectiveRailSelection.size >= 2 && (
              <div className="recipe-page-rail__bulk" ref={railBulkRef}>
                <button
                  type="button"
                  className="recipe-page-rail__bulk-group"
                  aria-haspopup="menu"
                  aria-expanded={railBulkMenu !== null}
                  onClick={() => setRailBulkMenu((menu) => (menu ? null : "root"))}
                >
                  Group ({effectiveRailSelection.size})
                </button>
                <button
                  type="button"
                  className="recipe-page-rail__bulk-clear"
                  aria-label="Clear selection"
                  onClick={clearRailSelection}
                >
                  <XIcon size={ICON_SIZE.sm} />
                </button>
                {railBulkMenu && (
                  <div className="recipe-page-rail__bulk-menu" role="menu">
                    <button type="button" role="menuitem" onClick={makeSectionFromSelection}>
                      <PlusIcon size={ICON_SIZE.sm} />
                      Make new section
                    </button>
                    {sections.some((section) => section.title?.trim()) && (
                      <>
                        <div className="recipe-page-rail__bulk-menu-label">Move to section</div>
                        {sections
                          .filter((section) => section.title?.trim())
                          .map((section) => (
                            <button
                              key={section.id}
                              type="button"
                              role="menuitem"
                              onClick={() => moveSelectionToSection(section.id)}
                            >
                              {section.title}
                            </button>
                          ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="recipe-page-rail__add-row" ref={addMenuRef}>
              <button
                type="button"
                className={`btn btn-secondary recipe-page-rail__add-main ${
                  projectMeta.meta.cookbookMode ? "recipe-page-rail__add-main--paired" : ""
                }`}
                onClick={() => {
                  setAddMenuOpen(false);
                  setPendingAddSectionId(sectionForNavItem(activeNavItem)?.id ?? sections[0]?.id ?? null);
                  setShowAddRecipeDialog(true);
                }}
              >
                <PlusIcon size={ICON_SIZE.md} />
                {projectMeta.meta.cookbookMode ? "Add recipe" : "Recipe"}
              </button>
              {/* In a cookbook the section action folds into a split-button
                  overflow, so the primary control reads plainly as "Add recipe". */}
              {projectMeta.meta.cookbookMode && (
                <>
                  <button
                    type="button"
                    className="recipe-page-rail__add-menu-trigger"
                    aria-haspopup="menu"
                    aria-expanded={addMenuOpen}
                    aria-label="More add options"
                    onClick={() => setAddMenuOpen((open) => !open)}
                  >
                    <ChevronDownIcon size={ICON_SIZE.sm} />
                  </button>
                  {addMenuOpen && (
                    <div className="recipe-page-rail__add-menu" role="menu">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAddMenuOpen(false);
                          addSectionDivider();
                        }}
                      >
                        <PlusIcon size={ICON_SIZE.sm} />
                        Add section
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
            {projectMeta.meta.cookbookMode && (
              <button
                type="button"
                className="recipe-page-rail__organize"
                onClick={openOrganizeCookbook}
              >
                <ReorderIcon size={ICON_SIZE.sm} />
                Reorder recipes
              </button>
            )}
          </div>
        </nav>

        {/* Center: large preview of the selected page */}
        <section
          className="recipe-page-canvas"
          aria-label="Selected page"
          data-single-recipe={singleRecipePrintView ? "true" : "false"}
        >
          {(sizeMenuOpen || settingsMenuOpen) && (
            <button
              type="button"
              className="recipe-mobile-size-menu-backdrop no-print"
              aria-label="Close menu"
              onClick={() => {
                setSizeMenuOpen(false);
                setSettingsMenuOpen(false);
              }}
            />
          )}
          <div className="recipe-mobile-topbar no-print">
            <button
              type="button"
              onClick={handleBack}
              className="recipe-mobile-back-button"
              aria-label="Back"
            >
              <ChevronLeftIcon size={28} />
            </button>
            <div className="recipe-mobile-topbar__actions">
              {renderModeSwitch()}
              {hasPrintSettingsFields && (
                <div className="recipe-mobile-toolbar__btn-wrap">
                  <button
                    type="button"
                    className={`recipe-mobile-topbar__icon-btn ${settingsMenuOpen ? "is-active" : ""}`}
                    aria-haspopup="true"
                    aria-expanded={settingsMenuOpen}
                    aria-label="Print settings"
                    onClick={() => {
                      setSizeMenuOpen(false);
                      setSettingsMenuOpen((open) => !open);
                    }}
                  >
                    <SettingsIcon size={ICON_SIZE.lg} />
                  </button>
                  {settingsMenuOpen && (
                    <div className="recipe-mobile-settings-menu" role="menu" aria-label="Print settings">
                      {renderPrintSettingsFields()}
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary btn-compact recipe-mobile-topbar__print"
                onClick={handleMobilePrint}
                disabled={printBlocked}
              >
                {printSpinner ? (
                  <SpinnerIcon size={ICON_SIZE.md} />
                ) : (
                  <PrintIcon size={ICON_SIZE.md} />
                )}
                {cookbookLocked
                  ? "Purchase & Print"
                  : templateLocked
                    ? "Unlock & Print"
                    : "Print"}
              </button>
            </div>
          </div>
          <div
            className={`recipe-page-deck ${cookbookView ? "recipe-page-deck--book" : ""} ${deckExportClass}`}
            style={deckExportStyle}
            id="recipe-page-deck"
            ref={deckRef}
          >
            {cookbookView
              ? spreads.map((spread, index) => {
                  const isActive = index === activeNavIndex;
                  // A full-page-photo spread (image verso facing its recipe
                  // recto) is ONE logical page even though it's two physical
                  // pages: editing it edits the recipe, and its facing photo has
                  // no controls of its own. So focus/outline treat the pair as a
                  // unit — clicking either page focuses the recipe, and both get
                  // the focus ring together.
                  const leftSheet = spread.left != null ? sheets[spread.left] : null;
                  const rightSheet = spread.right != null ? sheets[spread.right] : null;
                  const isImageSpread =
                    leftSheet?.layoutKind === "image" || rightSheet?.layoutKind === "image";
                  const imageSpreadFocusSheet = isImageSpread
                    ? leftSheet?.layoutKind === "image"
                      ? spread.right
                      : spread.left
                    : null;
                  // `trailing` = a parity blank with no real page after it (the
                  // pad on the last spread when there's no back cover). It still
                  // holds the spread's layout on screen, but must NOT print — a
                  // printed empty last page is the stray-trailing-blank bug.
                  const leftSlot =
                    leftSheet?.slots.find((slot): slot is SheetSlot => slot !== null) ?? null;
                  const sectionGridImages =
                    leftSlot?.kind === "divider"
                      ? sections
                          .find((section) => section.id === leftSlot.id)
                          ?.items.map((item) => item.recipe?.image)
                          .filter((url): url is string => Boolean(url))
                          .slice(0, 9) ?? []
                      : [];
                  const designedBlank =
                    sectionGridImages.length > 0 || leftSlot?.kind === "toc";
                  // A chapter opener whose facing page is a photo grid built from
                  // this section's recipes is one logical unit — focus/outline
                  // them together (like an image spread), since those photos come
                  // straight from the section the opener titles.
                  const isSectionSpread =
                    leftSlot?.kind === "divider" && sectionGridImages.length > 0;
                  const renderBlank = (trailing = false) => (
                    <div
                      className={`recipe-spread__blank recipe-template--${previewTemplate} ${
                        designedBlank ? "recipe-spread__blank--designed" : ""
                      } ${sectionGridImages.length ? "recipe-spread__blank--photo-grid" : ""} ${
                        trailing ? "recipe-spread__blank--trailing" : ""
                      } ${isSectionSpread && !trailing ? "recipe-spread__blank--linked" : ""}`}
                      onClick={
                        isSectionSpread && !trailing
                          ? (event) => {
                              event.stopPropagation();
                              if (!isActive) goToSlide(index);
                              if (spread.left != null) setFocusedSheetIndex(spread.left);
                            }
                          : undefined
                      }
                      aria-label={
                        sectionGridImages.length
                          ? `Photo page for ${leftSlot?.kind === "divider" ? leftSlot.title : "section"}`
                          : leftSlot?.kind === "toc"
                            ? `${RECIPE_PRINT_TEMPLATE_OPTIONS.find((option) => option.id === previewTemplate)?.label ?? "Template"} decorative page`
                            : undefined
                      }
                      aria-hidden={designedBlank ? undefined : true}
                      style={{
                        width: `${previewDims.w * deckScale}px`,
                        height: `${previewDims.h * deckScale}px`,
                      }}
                    >
                      {sectionGridImages.length > 0 ? (
                        <div className="recipe-spread__blank-grid">
                          {sectionGridImages.map((url, photoIndex) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={`${url}-${photoIndex}`} src={url} alt="" draggable={false} />
                          ))}
                        </div>
                      ) : leftSlot?.kind === "toc" ? (
                        <div className="recipe-spread__blank-decoration" aria-hidden />
                      ) : null}
                    </div>
                  );
                  const renderSide = (
                    sheetIndex: number | null,
                    role: "left" | "right" | "single",
                  ) => {
                    if (sheetIndex === null) return renderBlank();
                    const pageSheet = sheets[sheetIndex];
                    if (!pageSheet) return renderBlank();
                    const ni = navIndexForSheet.get(sheetIndex);
                    const pageNav = ni != null ? navItems[ni] : null;
                    if (!pageNav) return renderBlank();
                    // For an image spread, either page focused outlines both;
                    // for a normal spread, only the specific page.
                    const isFocused =
                      isActive &&
                      (isImageSpread
                        ? focusedSheet === spread.left || focusedSheet === spread.right
                        : focusedSheet === sheetIndex);
                    return (
                      <div
                        className={`recipe-spread__page ${isFocused ? "is-focused" : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isActive) goToSlide(index);
                          // Focus the recipe of an image spread no matter which
                          // half was clicked, so its Edit controls are available.
                          setFocusedSheetIndex(
                            isImageSpread ? imageSpreadFocusSheet ?? sheetIndex : sheetIndex,
                          );
                        }}
                      >
                        {renderDeckPage(pageNav, pageSheet, isFocused, role)}
                      </div>
                    );
                  };
                  return (
                    <div
                      key={`spread-${index}`}
                      ref={(el) => {
                        slideRefs.current[index] = el;
                      }}
                      className={`recipe-page-slide recipe-page-slide--spread ${isActive ? "is-active" : ""} ${
                        spread.single ? "recipe-page-slide--single" : ""
                      }`}
                      data-first={index === 0 ? "true" : undefined}
                      onClick={() => {
                        if (!isActive) goToSlide(index);
                      }}
                      role="button"
                      tabIndex={0}
                      aria-current={isActive}
                    >
                      {isActive &&
                        activeNavItem &&
                        renderActiveControls(
                          activeNavItem,
                          isImageSpread || isSectionSpread
                            ? spreadWidth * deckScale
                            : previewDims.w * deckScale,
                          isImageSpread || isSectionSpread || spread.single
                            ? 0
                            : focusedSheet === spread.left
                              ? -((previewDims.w * deckScale + 12) / 2)
                              : (previewDims.w * deckScale + 12) / 2,
                        )}
                      <div
                        className={`recipe-spread ${spread.single ? "recipe-spread--single" : ""} ${
                          isActive &&
                          ((isImageSpread &&
                            (focusedSheet === spread.left || focusedSheet === spread.right)) ||
                            (isSectionSpread && focusedSheet === spread.left))
                            ? "recipe-spread--image-focused"
                            : ""
                        }`}
                      >
                        {spread.single
                          ? renderSide(spread.right ?? spread.left, "single")
                          : (
                            <>
                              {renderSide(spread.left, "left")}
                              {spread.right === null && index === spreads.length - 1
                                ? renderBlank(!designedBlank)
                                : renderSide(spread.right, "right")}
                            </>
                          )}
                      </div>
                    </div>
                  );
                })
              : navItems.map((navItem, index) => {
              const sheet = sheets[navItem.sheetIndex];
              if (!sheet) return null;
              const isActive = index === activeNavIndex;
              // Only the first nav item for a given sheet renders the markup
              // that actually prints (the whole sheet, both slots). A second
              // recipe sharing that sheet gets its own on-screen-only slide
              // (`.no-print`) so scrolling can reach it like any other
              // recipe, without the sheet printing twice.
              const isFirstOnSheet = firstNavIndexBySheet.get(navItem.sheetIndex) === index;
              return (
                <div
                  key={`${sheet.id}-${navItem.slotIndex}`}
                  ref={(el) => {
                    slideRefs.current[index] = el;
                  }}
                  className={`recipe-page-slide ${isActive ? "is-active" : ""} ${
                    isFirstOnSheet ? "" : "no-print"
                  }`}
                  data-first={index === 0 ? "true" : undefined}
                  onClick={() => {
                    if (isActive) return;
                    goToSlide(index);
                  }}
                  role="button"
                  tabIndex={0}
                  aria-current={isActive}
                  aria-label={navItem.label}
                  onKeyDown={(event) => {
                    if (
                      event.target instanceof HTMLInputElement ||
                      event.target instanceof HTMLTextAreaElement ||
                      event.target instanceof HTMLButtonElement
                    ) {
                      return;
                    }
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    if (isActive) return;
                    goToSlide(index);
                  }}
                >
                  {isActive && (
                    <div
                      className="recipe-page-canvas__controls no-print"
                      style={
                        {
                          "--preview-w": `${PAGE_DIMS[previewCardSize].w * deckScale}px`,
                        } as CSSProperties
                      }
                    >
                      <div className="recipe-page-canvas__controls-center">
                        {navItem.flip && (
                          <div className="recipe-card-side-nav" aria-label="Sheet sides">
                            <button
                              type="button"
                              className="recipe-card-side-nav__button"
                              aria-label="Show front"
                              disabled={canvasSide === "front"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setCanvasSide("front");
                              }}
                            >
                              ←
                            </button>
                            <span>{canvasSide === "front" ? "Front" : "Back"}</span>
                            <button
                              type="button"
                              className="recipe-card-side-nav__button"
                              aria-label="Show back"
                              disabled={canvasSide === "back"}
                              onClick={(event) => {
                                event.stopPropagation();
                                setCanvasSide("back");
                              }}
                            >
                              →
                            </button>
                          </div>
                        )}
                      </div>
                      {activeNavItem && activeNavItem.kind !== "image" && (
                        <div className="recipe-page-canvas__controls-right">
                          {projectMeta.meta.cookbookMode &&
                            activeNavItem.kind === "recipe" &&
                            pageEditMode &&
                            renderPagePhotoControl(activeNavItem.recipeId)}
                          <button
                            type="button"
                            className={`recipe-page-edit-toggle ${
                              (activeNavItem.kind === "recipe" && pageEditMode) ||
                              (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                              (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem)) ||
                              (activeNavItem.kind === "toc" && editingToc)
                                ? "is-active"
                                : ""
                            }`}
                            aria-pressed={
                              (activeNavItem.kind === "recipe" && pageEditMode) ||
                              (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                              (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem)) ||
                              (activeNavItem.kind === "toc" && editingToc)
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (activeNavItem.kind === "recipe") {
                                togglePageEditMode();
                              } else if (activeNavItem.kind === "divider") {
                                if (editingSectionId === activeNavItem.recipeId) commitSectionEdit();
                                else startSectionEdit(activeNavItem.recipeId);
                              } else if (activeNavItem.kind === "toc") {
                                setEditingToc((current) => !current);
                              } else {
                                const side = coverSideFromNavItem(activeNavItem);
                                setEditingCoverSide((current) => (current === side ? null : side));
                              }
                            }}
                          >
                            <EditIcon size={ICON_SIZE.xs} />
                            {(activeNavItem.kind === "recipe" && pageEditMode) ||
                            (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                            (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem)) ||
                            (activeNavItem.kind === "toc" && editingToc)
                              ? "Done"
                              : "Edit"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <ScaledPage
                    sheet={sheet}
                    isLastSheet={navItem.sheetIndex === sheets.length - 1}
                    activeSlotIndex={navItem.slotIndex}
                    activeSide={isActive ? canvasSide : "front"}
                    scale={deckScale}
                    size={previewCardSize}
                    template={previewTemplate}
                    doubleSided={continueOnBack}
                    cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
                    // While actively editing with the checkbox on, keep the link
                    // field visible even if deleting it just made this the only
                    // recipe without one (which flips the cross-recipe
                    // `sourceUrlOn` gate off) — otherwise clearing it mid-edit
                    // hides the very field that would let the user type it back
                    // in. Gated on the checkbox itself so Edit never shows a
                    // link field the user has turned off.
                    showSourceUrl={
                      sourceUrlOn ||
                      (showSourceUrl && pageEditMode && isActive && activeRecipeItem?.id === navItem.recipeId)
                    }
                    showCutLines={showCutLines && cardSize === "card-6x4"}
                    inlineEdit={
                      pageEditMode && isActive && activeRecipeItem?.id === navItem.recipeId && activeInlineEdit
                        ? {
              ...activeInlineEdit,
              // The recipe's own photo only (plus upload), not other recipes'.
              recipeImages: activeRecipeItem?.recipe?.image ? [activeRecipeItem.recipe.image] : [],
            }
                        : undefined
                    }
                    dividerEdit={
                      isActive && navItem.kind === "divider" && editingSectionId === navItem.recipeId
                        ? {
                            sectionId: navItem.recipeId,
                            value: editingSectionTitle,
                            onChange: (value) => {
                              setEditingSectionTitle(value);
                              projectMeta.renameSection(navItem.recipeId, value.trim() || undefined);
                            },
                            onCommit: commitSectionEdit,
                            onCancel: () => {
                              setEditingSectionId(null);
                              setEditingSectionTitle("");
                            },
                            subtitle: sections.find((section) => section.id === navItem.recipeId)?.subtitle,
                            onSubtitleChange: (value) =>
                              projectMeta.updateSection(navItem.recipeId, { subtitle: value || undefined }),
                            intro: sections.find((section) => section.id === navItem.recipeId)?.intro,
                            onIntroChange: (value) =>
                              projectMeta.setSectionIntro(navItem.recipeId, value || undefined),
                            photoUrl: sections.find((section) => section.id === navItem.recipeId)?.photoUrl,
                            recipeImages: coverPhotoCandidates,
                            onPhotoChange: (url) => projectMeta.setSectionPhoto(navItem.recipeId, url),
                          }
                        : undefined
                    }
                    coverEdit={
                      isActive && navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)
                        ? {
                            side: coverSideFromNavItem(navItem),
                            cover: coverForSide(coverSideFromNavItem(navItem)) ?? defaultCover(),
                            onChange: (cover) => setCoverForSide(coverSideFromNavItem(navItem), cover),
                            recipeImages: coverPhotoCandidates,
                          }
                        : undefined
                    }
                    tocKicker={projectMeta.meta.tocKicker}
                    tocTitle={projectMeta.meta.tocTitle}
                    tocEdit={
                      isActive && navItem.kind === "toc" && editingToc
                        ? {
                            kicker: projectMeta.meta.tocKicker ?? "Contents",
                            title: projectMeta.meta.tocTitle ?? "What's inside",
                            onKickerChange: projectMeta.setTocKicker,
                            onTitleChange: projectMeta.setTocTitle,
                          }
                        : undefined
                    }
                  />
                </div>
              );
            })}
          </div>
        </section>

        {/* Right: print setup */}
        {mobileDrawer && (
          <button
            type="button"
            className="recipe-mobile-settings-backdrop no-print"
            aria-label="Close print settings"
            onClick={() => setMobileDrawer(null)}
          />
        )}

        <aside
          ref={configPanelRef}
          className={`recipe-config-panel no-print ${
            mobileDrawer ? "is-mobile-open" : ""
          }`}
          aria-label="Recipe print settings"
          role={mobileDrawer ? "dialog" : undefined}
          aria-modal={mobileDrawer ? "true" : undefined}
          tabIndex={mobileDrawer ? -1 : undefined}
          data-mobile-drawer={mobileDrawer ?? undefined}
        >
          <div className="recipe-config-panel__header">
            <h2 className="text-cp-h2 font-extrabold tracking-[-0.02em]">
              {mobileDrawer === "template"
                ? "Themes"
                : projectMeta.meta.cookbookMode
                  ? "Book Settings"
                  : "Print setup"}
            </h2>
            <button
              type="button"
              className="recipe-config-panel__close icon-close-btn"
              aria-label="Close print settings"
              onClick={() => setMobileDrawer(null)}
            >
              <XIcon size={ICON_SIZE.md} />
            </button>
          </div>

          <div className="recipe-config-panel__scroll">
          {/* Size is a recipe-card concept only. A cookbook is always bound
              letter pages, so the size control is hidden in cookbook mode. */}
          {!projectMeta.meta.cookbookMode && (
            <div className="recipe-config-section recipe-config-section--size">
              <label className="recipe-config-label" htmlFor="recipe-print-size">
                Size
              </label>
              <Select
                id="recipe-print-size"
                className="field"
                variant="compact"
                value={cardSize}
                onChange={(event) => setCardSize(event.target.value as PrintCardSize)}
              >
                {PRINT_CARD_SIZE_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {/* Cookbook photos are a book-wide choice (None / header / full page),
              overridable per page; plain cards keep the simple on/off checkbox. */}
          {anyRecipeHasImage && cookbookMode && (
            <div className="recipe-config-section recipe-config-section--photos">
              <span className="recipe-config-label" id="recipe-photos-label">
                Photos
              </span>
              <div
                className="recipe-photo-style"
                role="radiogroup"
                aria-labelledby="recipe-photos-label"
              >
                {PHOTO_STYLE_OPTIONS.map((option) => (
                  <label
                    key={option.id}
                    className={`recipe-photo-style__tile ${photoStyle === option.id ? "is-active" : ""}`}
                    title={option.hint}
                  >
                    <input
                      type="radio"
                      name="recipe-photo-style"
                      className="sr-only"
                      checked={photoStyle === option.id}
                      onChange={() => projectMeta.setPhotoStyle(option.id)}
                    />
                    <PhotoStylePreview id={option.id} />
                    <span className="recipe-photo-style__tile-label">{option.short}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {renderBookDesignSettings()}

          {!cookbookMode && (anyRecipeHasImage || anyRecipeHasSourceUrl) && (
            <div className="recipe-config-section recipe-config-section--settings">
              <span className="recipe-config-label">Include</span>
              {anyRecipeHasImage && (
                <label className="recipe-toggle">
                  <input
                    type="checkbox"
                    checked={showPhoto}
                    onChange={(event) => setShowPhoto(event.target.checked)}
                  />
                  <span>
                    <strong>Recipe photo</strong>
                  </span>
                </label>
              )}
              {anyRecipeHasSourceUrl && (
                <label className="recipe-toggle">
                  <input
                    type="checkbox"
                    checked={showSourceUrl}
                    onChange={(event) => setShowSourceUrl(event.target.checked)}
                  />
                  <span>
                    <strong>Recipe link</strong>
                  </span>
                </label>
              )}
            </div>
          )}



          <div className="recipe-config-section recipe-config-section--template">
            {hasUnclaimedFreeTemplate && !freeTemplateBannerDismissed && !projectMeta.meta.cookbookMode && (
              <div className="recipe-free-template-banner" role="status">
                <CrownIcon size={ICON_SIZE.md} />
                <div className="recipe-free-template-banner__copy">
                  <strong>Thanks for being a CookPilot member!</strong>
                  <span>Enjoy a free lifetime template, on us — pick any premium design below.</span>
                </div>
                <button
                  type="button"
                  className="recipe-free-template-banner__dismiss icon-close-btn"
                  aria-label="Dismiss"
                  onClick={() => setFreeTemplateBannerDismissed(true)}
                >
                  <XIcon size={ICON_SIZE.xs} />
                </button>
              </div>
            )}
            <h3 className="recipe-config-label">Themes</h3>
            <div className="recipe-template-list">
              {RECIPE_PRINT_TEMPLATE_OPTIONS.map((option) => {
                const premiumTemplate = isPremiumTemplate(option.id) ? option.id : null;
                // In cookbook mode every theme comes with the cookbook, so none
                // read as locked (no crown, no paywall).
                const locked =
                  premiumTemplate !== null &&
                  !hasTemplateEntitlement(customerInfo, premiumTemplate) &&
                  !projectMeta.meta.cookbookMode;
                const owned =
                  premiumTemplate !== null &&
                  hasTemplateEntitlement(customerInfo, premiumTemplate) &&
                  !projectMeta.meta.cookbookMode;

                // A real card renders <div>s, which aren't valid inside a
                // <button> (its content model is phrasing only) — so the option
                // is a role="button" div with matching keyboard behavior.
                const selectTemplate = () => {
                  setTemplate(option.id);
                  track("template_selected", {
                    template: option.id,
                    premium: premiumTemplate !== null,
                  });
                  setToastMessage(null);
                  setMobileDrawer(null);
                };

                return (
                  <div
                    key={option.id}
                    role="button"
                    tabIndex={0}
                    className={`recipe-template-option recipe-template-option--${option.id} ${
                      template === option.id ? "is-active" : ""
                    }`}
                    aria-pressed={template === option.id}
                    aria-label={`${option.label}${locked ? " premium" : owned ? " owned" : ""}`}
                    onClick={selectTemplate}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectTemplate();
                      }
                    }}
                  >
                    {/* Status only — no price here. The picker's job is "pick how it
                        looks"; cost only ever appears at the moment printing this
                        template is actually requested (see the Print button below). */}
                    {locked && (
                      <span className="recipe-template-option__premium" aria-label="Premium">
                        <CrownIcon size={ICON_SIZE.xs} />
                      </span>
                    )}
                    {owned && (
                      <span className="recipe-template-option__owned" aria-label="Owned">
                        <CheckIcon size={ICON_SIZE.xs} />
                      </span>
                    )}
                    <TemplateThumbnail template={option.id} />
                  </div>
                );
              })}
            </div>
          </div>
          </div>

          <div className="recipe-config-panel__footer">
            {/* Print (or Unlock/Purchase & Print) is the primary action, so it
                always sits above the secondary "Save project". */}
            <button
              onClick={() => void handlePrint()}
              className="btn btn-primary recipe-print-button"
              disabled={printBlocked}
            >
              {printSpinner ? (
                <SpinnerIcon size={ICON_SIZE.md} />
              ) : (
                <PrintIcon size={ICON_SIZE.md} />
              )}
              {cookbookLocked
                ? "Purchase & Print"
                : selectedTemplateLocked
                  ? "Unlock & Print"
                  : "Print"}
            </button>
            {/* Hidden for this release alongside the rest of the account/cookbook
                surface — gated by COOKBOOK_ENABLED so it returns at launch. */}
            {COOKBOOK_ENABLED && !cookbookMode && (
              <button
                type="button"
                className="btn btn-secondary recipe-print-button"
                disabled={projectSaveBusy}
                onClick={() => void handleSaveProject()}
              >
                {projectSaveBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <BookIcon size={ICON_SIZE.md} />}
                {savedProjectId ? "Saved to account" : "Save project"}
              </button>
            )}
            {isRecipePrinterAdmin && activeRecipeItem?.recipe && (
              <button
                type="button"
                className="recipe-print-settings-link"
                aria-haspopup="dialog"
                onClick={() => setShowShareDialog(true)}
              >
                Save as share link
              </button>
            )}
            {hasPrintSettingsFields && (
              <button
                type="button"
                className="recipe-print-settings-link"
                aria-haspopup="dialog"
                onClick={() => setPrintSettingsOpen(true)}
              >
                Print settings
              </button>
            )}
          </div>
        </aside>

        <Dialog
          open={printSettingsOpen}
          onClose={() => setPrintSettingsOpen(false)}
          labelledBy="print-settings-dialog-title"
          className="print-success-dialog no-print"
          backdropClassName="print-success-dialog__backdrop"
          panelClassName="print-success-dialog__panel"
        >
          <button
            type="button"
            className="print-success-dialog__close icon-close-btn"
            aria-label="Close"
            onClick={() => setPrintSettingsOpen(false)}
          >
            <XIcon size={ICON_SIZE.md} />
          </button>
          <h2 id="print-settings-dialog-title">Print settings</h2>
          <div className="print-settings-dialog__body">{renderPrintSettingsFields()}</div>
        </Dialog>

        <div className="recipe-mobile-actions no-print">
          <div className="recipe-mobile-toolbar">
            <button
              type="button"
              className="recipe-mobile-toolbar__btn"
              onClick={() => setShowAddRecipeDialog(true)}
            >
              <span className="recipe-mobile-toolbar__btn-icon">
                <PlusIcon size={ICON_SIZE.lg} />
              </span>
              Recipe
            </button>
            {/* Pages/structure — the mobile stand-in for the drag-only desktop
                rail, which is hidden on touch. Cookbook mode only. */}
            {cookbookMode && (
              <button
                type="button"
                className={`recipe-mobile-toolbar__btn ${structureSheetOpen ? "is-active" : ""}`}
                aria-pressed={structureSheetOpen}
                aria-haspopup="dialog"
                onClick={() => {
                  setSizeMenuOpen(false);
                  setSettingsMenuOpen(false);
                  setStructureSheetOpen((open) => !open);
                }}
              >
                <span className="recipe-mobile-toolbar__btn-icon">
                  <BookIcon size={ICON_SIZE.lg} />
                </span>
                Book
              </button>
            )}
            {/* Size is a recipe-card concept only — hidden in cookbook mode,
                where every page is a bound letter page. */}
            {!projectMeta.meta.cookbookMode && (
              <div className="recipe-mobile-toolbar__btn-wrap">
                <button
                  type="button"
                  className={`recipe-mobile-toolbar__btn ${sizeMenuOpen ? "is-active" : ""}`}
                  aria-haspopup="true"
                  aria-expanded={sizeMenuOpen}
                  onClick={() => {
                    setSettingsMenuOpen(false);
                    setSizeMenuOpen((open) => !open);
                  }}
                >
                  <span className="recipe-mobile-toolbar__btn-icon">
                    <SizeIcon size={ICON_SIZE.lg} />
                  </span>
                  Size
                </button>
                {sizeMenuOpen && (
                  <div className="recipe-mobile-size-menu" role="menu" aria-label="Card size">
                    {PRINT_CARD_SIZE_OPTIONS.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={cardSize === option.id}
                        className={`recipe-mobile-size-menu__option ${
                          cardSize === option.id ? "is-active" : ""
                        }`}
                        onClick={() => {
                          setCardSize(option.id);
                          setSizeMenuOpen(false);
                        }}
                      >
                        {option.label}
                        {cardSize === option.id && <CheckIcon size={ICON_SIZE.xs} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button
              type="button"
              className={`recipe-mobile-toolbar__btn ${mobileDrawer === "template" ? "is-active" : ""}`}
              aria-pressed={mobileDrawer === "template"}
              onClick={() => {
                setSizeMenuOpen(false);
                setSettingsMenuOpen(false);
                setMobileDrawer((drawer) => (drawer === "template" ? null : "template"));
              }}
            >
              <span className="recipe-mobile-toolbar__btn-icon">
                <TemplateIcon size={ICON_SIZE.lg} />
              </span>
              Themes
            </button>
            {anyRecipeHasImage && !cookbookMode && (
              <button
                type="button"
                className="recipe-mobile-toolbar__btn"
                aria-pressed={showPhoto}
                onClick={() => setShowPhoto((value) => !value)}
              >
                <span
                  className={`recipe-mobile-toolbar__btn-icon ${
                    showPhoto ? "" : "recipe-mobile-toolbar__btn-icon--off"
                  }`}
                >
                  <ImageIcon size={ICON_SIZE.lg} />
                </span>
                Photo
              </button>
            )}
            {anyRecipeHasSourceUrl && (
              <button
                type="button"
                className="recipe-mobile-toolbar__btn"
                aria-pressed={showSourceUrl}
                onClick={() => setShowSourceUrl((value) => !value)}
              >
                <span
                  className={`recipe-mobile-toolbar__btn-icon ${
                    showSourceUrl ? "" : "recipe-mobile-toolbar__btn-icon--off"
                  }`}
                >
                  <LinkIcon size={ICON_SIZE.lg} />
                </span>
                Link
              </button>
            )}
          </div>
        </div>

        {renderMobileStructureSheet()}
      </main>

      <PrintDialogs
        showDonateDialog={showDonateDialog}
        onCloseDonateDialog={() => setShowDonateDialog(false)}
        onOpenFeedbackDialog={() => setShowFeedbackDialog(true)}
        showUnlockDialog={showUnlockDialog}
        onCloseUnlockDialog={() => setShowUnlockDialog(false)}
        selectedPremiumTemplate={selectedPremiumTemplate}
        selectedTemplateLabel={selectedTemplateLabel}
        selectedTemplatePrice={selectedPremiumTemplate ? templatePrices[selectedPremiumTemplate] : undefined}
        purchaseBusy={purchaseBusy}
        onUnlockTemplate={(premiumTemplate) => void unlockTemplateAndPrint(premiumTemplate)}
        canClaimFree={canClaimSelectedTemplateFree}
        claimBusy={claimBusy}
        onClaimTemplate={(premiumTemplate) => void claimTemplateAndPrint(premiumTemplate)}
        showCookbookUnlockDialog={showCookbookUnlockDialog}
        onCloseCookbookUnlockDialog={() => setShowCookbookUnlockDialog(false)}
        cookbookPrice={cookbookPrice}
        cookbookPurchaseBusy={cookbookPurchaseBusy}
        onUnlockCookbook={() =>
          void purchaseCookbookAndContinue((freshPurchase) => {
            if (freshPurchase) setCookbookJustPurchased(true);
            void handlePrint();
          })
        }
        showCookbookPrintDialog={false}
        cookbookJustPurchased={cookbookJustPurchased}
        onCloseCookbookPrintDialog={() => {
          setShowCookbookPrintDialog(false);
          setCookbookJustPurchased(false);
        }}
        onExportFormat={exportCookbookAs}
        showDeleteRecipeDialog={pendingDelete !== null}
        deleteItemTitle={pendingDelete?.title ?? "this item"}
        deleteItemDescription={
          pendingDelete?.kind === "section"
            ? "The section page and grouping will be removed from this print project."
            : pendingDelete?.kind === "cover"
              ? "The cover page will be removed from this print project."
              : "It'll be removed from your print list. This can't be undone."
        }
        deletePrimaryLabel={
          pendingDelete?.kind === "section"
            ? "Delete section"
            : pendingDelete?.kind === "cover"
              ? "Delete cover"
              : "Delete recipe"
        }
        sectionRecipeCount={pendingDelete?.kind === "section" ? pendingDelete.recipeIds.length : undefined}
        onCancelDeleteRecipe={() => setPendingDelete(null)}
        onConfirmDeleteRecipe={confirmPendingDelete}
        onConfirmDeleteSectionRecipes={confirmDeleteSectionRecipes}
        showExitCookbookDialog={showExitCookbookConfirm}
        onCancelExitCookbook={() => setShowExitCookbookConfirm(false)}
        onConfirmExitCookbook={confirmExitCookbook}
      />
      <CookbookWelcomeDialog
        open={showCookbookOfferDialog}
        cover={projectMeta.meta.cover ?? defaultCover()}
        price={cookbookPrice}
        onClose={() => {
          track("cookbook_onboarding_dismissed", {});
          setShowCookbookOfferDialog(false);
        }}
        onStart={() => {
          beginCookbookBuild();
        }}
      />
      <CookbookBuildReveal
        open={cookbookBuilding}
        cover={projectMeta.meta.cover ?? defaultCover()}
      />
      {cookbookRestoring && (
        <div className="cookbook-restore-overlay no-print" role="status" aria-live="polite">
          <SpinnerIcon size={30} />
          <span>Loading your cookbook…</span>
        </div>
      )}
      <CookbookReadyDialog
        open={showCookbookPrintDialog}
        justPurchased={cookbookJustPurchased}
        cover={projectMeta.meta.cover ?? defaultCover()}
        onClose={() => {
          setShowCookbookPrintDialog(false);
          setCookbookJustPurchased(false);
        }}
        onExport={exportCookbookAs}
        onPrinterClick={(printer, url) => {
          track("cookbook_printer_clicked", { printer, preset: activePreset.id });
          window.open(url, "_blank", "noopener,noreferrer");
        }}
      />
      <AddRecipeDialog
        open={showAddRecipeDialog}
        onClose={() => setShowAddRecipeDialog(false)}
        items={queue.items}
        onAddUrl={queue.addUrl}
        onAddImages={queue.addImages}
        onAddText={queue.addText}
        onAddCookPilotRecipes={queue.addCookPilotRecipes}
        onRemoveRecipe={queue.remove}
      />
      {showShareDialog && activeRecipeItem?.recipe && cookPilotUser && (
        <AdminShareLinkDialog
          recipe={activeRecipeItem.recipe}
          settings={{ template, cardSize, showPhoto, showSourceUrl, showCutLines, doubleSided }}
          uid={cookPilotUser.uid}
          onClose={() => setShowShareDialog(false)}
        />
      )}
      <FeedbackDialog
        open={showFeedbackDialog}
        onClose={() => setShowFeedbackDialog(false)}
        initialType="print_issue"
      />
      {showCookPilotLogin && !cookPilotUser && (
        <CookPilotLoginDialog
          onClose={() => setShowCookPilotLogin(false)}
          onAuthenticated={() => setShowCookPilotLogin(false)}
          reason={cookPilotLoginReason}
        />
      )}
      {toastMessage && (
        <div className="recipe-toast no-print" role="status" aria-live="polite">
          <span>{toastMessage}</span>
          {organizationUndo && toastMessage === "Cookbook organized" && (
            <button type="button" className="recipe-toast__action" onClick={undoCookbookOrganization}>
              Undo
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setToastMessage(null)}>
            <XIcon size={ICON_SIZE.sm} />
          </button>
        </div>
      )}
    </div>
  );
}
