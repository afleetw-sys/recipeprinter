"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { Select } from "@/components/Select";
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
  type PhotoStyle,
} from "@/lib/project";
import { materializeProjectPhotos } from "@/lib/photoStorage";
import { createPrintProjectId, savePrintProject, assemblePrintProject } from "@/lib/printProjects";
import { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
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
  presetSheetDims,
  type CookbookPreset,
} from "@/lib/cookbookPresets";
import { CookbookPresetPicker } from "@/components/CookbookPresetPicker";
import { localStore } from "@/lib/storage";
import { track } from "@/lib/analytics";
import {
  BookIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CrownIcon,
  EditIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  PrintIcon,
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
import { getFirebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
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
import type { CoverConfig, QueueItem, Recipe } from "@/types/recipe";

const PrintDialogs = dynamic(
  () => import("@/components/PrintDialogs").then((mod) => mod.PrintDialogs),
  { ssr: false, loading: () => null },
);
const AddRecipeDialog = dynamic(
  () => import("@/components/AddRecipeDialog").then((mod) => mod.AddRecipeDialog),
  { ssr: false, loading: () => null },
);
const AdminShareLinkDialog = dynamic(
  () => import("@/components/AdminShareLinkDialog").then((mod) => mod.AdminShareLinkDialog),
  { ssr: false, loading: () => null },
);

const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:post-print-dialog:last-shown:v1";
const POST_PRINT_DIALOG_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;


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
  tocKicker,
  tocTitle,
  tocEdit,
  preset,
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
    intro?: string;
    onIntroChange?: (value: string) => void;
    photoUrl?: string;
    recipeImages?: string[];
    onPhotoChange?: (url: string | undefined) => void;
  };
  coverEdit?: {
    side: "front" | "back";
    cover: CoverConfig;
    onChange: (cover: CoverConfig) => void;
    recipeImages?: string[];
  };
  tocKicker?: string;
  tocTitle?: string;
  tocEdit?: {
    kicker: string;
    title: string;
    onKickerChange: (value: string) => void;
    onTitleChange: (value: string) => void;
  };
  /** Active cookbook print-format preset. When set, the page renders on the
      preset's physical sheet (trim + bleed) with the Letter content scaled and
      inset into the safe area; undefined = today's Letter / 6x4 behavior. */
  preset?: CookbookPreset;
  /** Which edge carries the binding gutter (verso→right, recto→left,
      single/cover→none). */
  gutterSide?: "left" | "right" | "none";
}) {
  const dims = PAGE_DIMS[size];
  const anySlot = sheet.slots.find((slot): slot is SheetSlot => slot !== null) ?? null;
  if (!anySlot) return null;

  // Cookbook preset geometry (presentation only — the measurement engine never
  // sees this). The scaler grows from the Letter card to the preset's physical
  // sheet, and the `--rp-*` vars + `--book-*` classes tell print.css how to
  // scale/inset the Letter content into the safe area and bleed the artwork.
  const sheetDims = preset ? presetSheetDims(preset) : null;
  const pageW = sheetDims ? sheetDims.w : dims.w;
  const pageH = sheetDims ? sheetDims.h : dims.h;
  const presetInsetVars = preset ? presetInsets(preset) : null;
  const presetStyle = (preset
    ? {
        "--rp-card-scale": presetCardScale(preset),
        "--rp-art-scale": presetArtScale(preset),
        "--rp-inset-block": presetInsetVars!.block,
        "--rp-inset-outer": presetInsetVars!.outer,
        "--rp-inset-bind": presetInsetVars!.bind,
      }
    : {}) as CSSProperties;
  const gutterClass = !preset
    ? ""
    : gutterSide === "left"
      ? "rp-bind-left"
      : gutterSide === "right"
        ? "rp-bind-right"
        : "";
  // Base class (paper bleed + binding side) plus the per-page bucket: `safe`
  // scales text into the margins; `art` fills the sheet so covers/photos bleed.
  const presetBaseClass = preset ? `recipe-print-preview--book-preset ${gutterClass}` : "";
  const presetSafeClass = preset ? "recipe-print-preview--book-safe" : "";
  const presetArtClass = preset ? "recipe-print-preview--book-art" : "";

  // ── Image-spread facing photo ────────────────────────────────────────────
  // A full-bleed photo alone on a letter page, facing the recipe's card page.
  if (sheet.layoutKind === "image") {
    const imageSlot = sheet.slots.find(
      (slot): slot is ImageSheetSlot => slot?.kind === "image",
    );
    if (!imageSlot) return null;
    return (
      <div
        className="recipe-page-scaler"
        style={{ "--page-scale": scale, "--page-w": `${pageW}px`, "--page-h": `${pageH}px` } as CSSProperties}
      >
        <div className="recipe-page-scaler__inner">
          <div
            className={`recipe-print-preview recipe-print-preview--letter ${presetBaseClass} ${presetArtClass}`}
            style={presetStyle}
            data-double-sided="false"
          >
            <div className={`recipe-card-set recipe-card-set--letter recipe-template--${template}`}>
              <div
                className={`recipe-card-page recipe-card-page--front recipe-card-page--image ${
                  isLastSheet ? "recipe-card-page--no-break" : ""
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="recipe-image-spread__photo" src={imageSlot.imageUrl} alt="" />
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
        style={{ "--page-scale": scale, "--page-w": `${pageW}px`, "--page-h": `${pageH}px` } as CSSProperties}
      >
        <div className="recipe-page-scaler__inner">
          <div
            className={`recipe-print-preview recipe-print-preview--${size} ${presetBaseClass} ${bucketClass}`}
            style={presetStyle}
            data-double-sided="false"
          >
            <div className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}>
              <div className={`recipe-card-page recipe-card-page--front ${isLastSheet ? "recipe-card-page--no-break" : ""}`}>
                {anySlot.kind === "divider" ? (
                  <DividerFace
                    title={anySlot.title}
                    recipeTitles={anySlot.recipeTitles}
                    chapterNumber={anySlot.chapterNumber}
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
          "--page-w": `${pageW}px`,
          "--page-h": `${pageH}px`,
        } as CSSProperties
      }
    >
      <div className="recipe-page-scaler__inner">
        <div
          className={`recipe-print-preview recipe-print-preview--${size} ${presetBaseClass} ${presetSafeClass} ${
            showCutLines ? "recipe-print-preview--cut-lines" : ""
          }`}
          style={presetStyle}
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
  // Unreadable or never shown both mean "show it" — the dialog is dismissible,
  // so erring toward showing it is the cheap direction to be wrong in.
  const lastShown = Number(localStore.get(POST_PRINT_DIALOG_STORAGE_KEY));
  return !lastShown || Date.now() - lastShown >= POST_PRINT_DIALOG_INTERVAL_MS;
}

function markPostPrintDialogShown() {
  localStore.set(POST_PRINT_DIALOG_STORAGE_KEY, String(Date.now()));
}

function initialPrintCardSize(value: string | null): PrintCardSize {
  return isPrintCardSize(value) ? value : "letter";
}

function initialRecipePrintTemplate(value: string | null): RecipePrintTemplate {
  return isRecipePrintTemplate(value) ? value : "classic";
}

export default function PrintPage() {
  const router = useRouter();
  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const shouldPrint = params.get("print") === "1";
  // Set by the /print/[slug] loader after seeding a shared recipe into this
  // session's queue — there's nothing behind this tab to go back to, so the
  // header drops the back arrow (the logo still links home).
  const cameFromSharedLink = params.get("shared") === "1";
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
  const [showCookbookPrintDialog, setShowCookbookPrintDialog] = useState(false);
  const [showExitCookbookConfirm, setShowExitCookbookConfirm] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showAddRecipeDialog, setShowAddRecipeDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "recipe"; id: string; title: string }
    | { kind: "section"; id: string; title: string; recipeIds: string[] }
    | { kind: "cover"; side: "front" | "back"; title: string }
    | null
  >(null);
  const [pendingFocusRecipeId, setPendingFocusRecipeId] = useState<string | null>(null);
  const [pendingFocusNavId, setPendingFocusNavId] = useState<string | null>(null);
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
  const [editingCoverSide, setEditingCoverSide] = useState<"front" | "back" | null>(null);
  const [editingToc, setEditingToc] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [pendingAddSectionId, setPendingAddSectionId] = useState<string | null>(null);
  const [projectSaveBusy, setProjectSaveBusy] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
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
  const printRequestedRef = useRef(false);
  const autoPrintAttemptedRef = useRef(false);
  // The cookbook offer is a one-time pitch PER PAGE VISIT: show it the first
  // time they make a cookbook here, then never again this session — flipping
  // back and forth between recipe cards and cookbook won't re-prompt.
  const cookbookOfferShownRef = useRef(false);
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
  // The cookbook's print-format preset (US Letter / 8×10 hardcover). Only ever
  // applied in cookbook mode — it changes the exported page geometry, not how
  // recipes are measured. `activePreset` falls back to the default for older
  // books; `presetForRender` is the value actually threaded into the pages
  // (undefined outside cookbook mode, so plain-card output is untouched).
  const activePreset = getCookbookPreset(projectMeta.meta.cookbookPreset);
  const presetForRender: CookbookPreset | undefined = cookbookMode ? activePreset : undefined;
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
    const map = new Map<string, string | undefined>();
    sections.forEach((section) => section.items.forEach((item) => map.set(item.id, section.title)));
    return map;
  }, [sections]);

  const railRows = useMemo(() => {
    const rows: Array<{ header?: string; navItem: NavItem; index: number }> = [];
    let lastSectionTitle: string | undefined = undefined;
    let seenFirstRecipe = false;
    navItems.forEach((navItem, index) => {
      let header: string | undefined;
      if (navItem.kind === "recipe") {
        const title = sectionTitleByItemId.get(navItem.recipeId);
        if (!projectMeta.meta.sectionDividers && title && (!seenFirstRecipe || title !== lastSectionTitle)) {
          header = title;
        }
        lastSectionTitle = title;
        seenFirstRecipe = true;
      }
      rows.push({ header, navItem, index });
    });
    return rows;
  }, [navItems, sectionTitleByItemId, projectMeta.meta.sectionDividers]);

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
    projectMeta.setSectionDividers(true);
    setEditingSectionId(sectionId);
    setEditingSectionTitle(title);
    setPendingFocusNavId(sectionId);
  }

  function coverSideFromNavItem(navItem: NavItem): "front" | "back" {
    return navItem.recipeId === "cover-back" ? "back" : "front";
  }

  function defaultCover(): CoverConfig {
    // Default to a collage of the book's first few recipe photos (6 → 4 → 2 as
    // available). One photo → a single-image cover; none → a photo-free
    // typographic cover (CoverFace renders each mode; no placeholder fill).
    const images = coverPhotoCandidates;
    const gridCount = images.length >= 6 ? 6 : images.length >= 4 ? 4 : images.length >= 2 ? 2 : 0;
    return {
      title: "Untitled Cookbook",
      subtitle: "A family cookbook",
      template,
      style: "photo",
      ...(gridCount > 0
        ? { gridImages: images.slice(0, gridCount) }
        : images.length === 1
          ? { imageUrl: images[0] }
          : {}),
    };
  }

  // Group the current recipes into chapters for the "Make it a cookbook"
  // scaffold: by course when recipes carry one (Mains, Desserts, …), otherwise
  // a single "Recipes" chapter. Group order follows first appearance so the
  // cook's ordering is preserved within and across chapters.
  function groupItemsIntoChapters(source: QueueItem[]): Array<{ title: string; itemIds: string[] }> {
    const withRecipe = source.filter((item) => item.recipe);
    if (withRecipe.length === 0) return [];
    const byLabel = new Map<string, string[]>();
    const order: string[] = [];
    for (const item of withRecipe) {
      const raw = item.recipe?.course?.trim();
      const label = raw
        ? raw.charAt(0).toUpperCase() + raw.slice(1)
        : "Recipes";
      if (!byLabel.has(label)) {
        byLabel.set(label, []);
        order.push(label);
      }
      byLabel.get(label)!.push(item.id);
    }
    return order.map((label) => ({ title: label, itemIds: byLabel.get(label)! }));
  }

  // Turning a print job into a cookbook shouldn't drop the cook into an empty
  // shell — scaffold the book they'd have built by hand: a cover, a table of
  // contents, and recipes grouped into chapters with dividers on. Anything they
  // already set up (a cover, named sections) is respected, not overwritten.
  function scaffoldCookbook() {
    projectMeta.setCookbookMode(true);
    // A cookbook is a bound book, never a 4×6 card — and it wants its photos.
    // Force a book page size and turn recipe photos on so the scaffolded book
    // looks finished rather than bare. The source link stays OFF by default —
    // a bound cookbook rarely wants a URL under every recipe; the cook can turn
    // it on if they do.
    if (cardSize === "card-6x4") setCardSize("letter");
    // Give the book a default print format (US Letter) so export geometry is
    // set from the start; a returning book keeps whatever it chose.
    if (!projectMeta.meta.cookbookPreset) projectMeta.setCookbookPreset(DEFAULT_COOKBOOK_PRESET_ID);
    setShowPhoto(true);
    // Book-wide photo default: a header photo in each card. Respected if the
    // cook already chose a style (e.g. came back into a book).
    if (!projectMeta.meta.photoStyle) projectMeta.setPhotoStyle("card");
    if (!projectMeta.meta.cover) {
      projectMeta.setCover(defaultCover());
    }
    if (!projectMeta.meta.backCover) {
      // A minimal closing page (template band on the theme's paper); the cook
      // can add a blurb / "from the kitchen of" line by editing it.
      projectMeta.setBackCover({ title: "", template });
    }
    projectMeta.setTableOfContents(true);
    projectMeta.setSectionDividers(true);
    const alreadyNamed = projectMeta.meta.sections.some((section) => section.title?.trim());
    if (!alreadyNamed) {
      const chapters = groupItemsIntoChapters(items ?? []);
      if (chapters.length > 0) projectMeta.replaceSections(chapters);
    }
    // Every recipe gets its own full page — no auto-pairing. The cook can turn
    // an individual recipe into a full-page photo spread from the page controls.
  }

  // Entry point for the "Make it a cookbook" button. The offer dialog is a
  // one-time pitch this visit: show it the first time, then scaffold straight
  // away on any later switch (see `cookbookOfferShownRef`).
  function startCookbook() {
    if (cookbookOfferShownRef.current) {
      scaffoldCookbook();
      return;
    }
    cookbookOfferShownRef.current = true;
    setShowCookbookOfferDialog(true);
  }

  // Leaving cookbook mode wipes the cover, chapters, and page layouts (see
  // `exitCookbook`), so it goes through a confirm rather than firing on the
  // first stray click of the Recipe cards ↔ Cookbook switch.
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

  function coverForSide(side: "front" | "back"): CoverConfig | undefined {
    return side === "back" ? projectMeta.meta.backCover : projectMeta.meta.cover;
  }

  function setCoverForSide(side: "front" | "back", cover: CoverConfig | undefined) {
    if (side === "back") projectMeta.setBackCover(cover);
    else projectMeta.setCover(cover);
  }

  function addCover() {
    const cover = projectMeta.meta.cover ?? defaultCover();
    projectMeta.setCover(cover);
    setEditingCoverSide("front");
    setPendingFocusNavId("cover-front");
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

  // Close the print-settings dialog if its trigger disappears (e.g. size
  // switches to letter with no back side), so it doesn't reopen stale next
  // time the trigger comes back.
  useEffect(() => {
    if (!hasRecipeBackSide && cardSize !== "card-6x4") {
      setPrintSettingsOpen(false);
    }
  }, [hasRecipeBackSide, cardSize]);


  const singleRecipePrintView =
    (items?.filter((item) => Boolean(item.recipe)).length ?? 0) === 1;

  // Cookbook "book view": the deck shows two-page SPREADS, so a deck slide is a
  // spread (not a single page). `activeNavIndex` then indexes `spreads`, and the
  // controls/editing target a FOCUSED page within the active spread.
  const cookbookView = spreads.length > 0;
  // In cookbook mode the deck pages are the preset's physical sheet (trim +
  // bleed), not the plain Letter card — so on-screen sizing keys off the sheet.
  const previewDims = cookbookMode ? presetSheetDims(activePreset) : PAGE_DIMS[previewCardSize];
  const spreadWidth = previewDims.w * 2;
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
      cookbookPreset: cookbookMode ? activePreset.id : undefined,
    });
    window.print();
  }

  function showToast(message: string) {
    setToastMessage(message);
  }

  // Free for any signed-in CookPilot user, at any project size — not tied to
  // payment. Persists a snapshot of the current sections/cover/title/settings
  // so the project survives past this session and shows up on another device.
  // There's no title field in the UI yet, so this just picks a sensible
  // default (the cover's title if one exists, else the first recipe's) —
  // renaming a saved project is a later phase's problem.
  async function handleSaveProject() {
    if (!cookPilotUser) return;
    setProjectSaveBusy(true);
    try {
      const defaultTitle =
        projectMeta.meta.cover?.title ||
        items?.find((item) => item.recipe)?.recipe?.title ||
        `Recipe cards — ${new Date().toLocaleDateString()}`;
      // Evict any base64 image to Firebase Storage first, so the saved document
      // holds only URLs and never exceeds Firestore's 1MB per-doc limit.
      const materialized = await materializeProjectPhotos({
        sections,
        cover: projectMeta.meta.cover,
        backCover: projectMeta.meta.backCover,
        itemPlacements: projectMeta.meta.itemPlacements,
      });
      const project = assemblePrintProject({
        id: projectIdRef.current,
        ownerUid: cookPilotUser.uid,
        title: defaultTitle,
        sections: materialized.sections,
        cover: materialized.cover,
        backCover: materialized.backCover,
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
        },
        itemPlacements: materialized.itemPlacements,
      });
      await savePrintProject(project);
      setSavedProjectId(project.id);
      showToast("Project saved");
    } catch (error) {
      console.warn("RecipePrinter: could not save project", error);
      showToast("Couldn't save this project — try again in a moment.");
    } finally {
      setProjectSaveBusy(false);
    }
  }

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
    refreshCustomerInfo,
    showToast,
    clearToast: () => setToastMessage(null),
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
    goToSlide(index);
    if (pendingFocusNavId) setPendingFocusNavId(null);
    if (pendingFocusRecipeId === pendingId) setPendingFocusRecipeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocusNavId, pendingFocusRecipeId, navItems]);

  async function handlePrint() {
    if (purchaseBusy || cookbookPurchaseBusy) return;
    if (!printLayoutReady) {
      // Remember it and let the effect below fire once the layout settles,
      // instead of turning them away — the button shows a spinner meanwhile.
      setPrintPending(true);
      return;
    }
    setPrintPending(false);
    if (cookbookLocked) {
      track("paywall_shown", { product: "cookbook" });
      setShowCookbookUnlockDialog(true);
      return;
    }
    if (selectedPremiumTemplate && templateLocked) {
      track("paywall_shown", {
        product: "premium_template",
        template: selectedPremiumTemplate,
      });
      setShowUnlockDialog(true);
      return;
    }
    // An unlocked cookbook export lands on the "Print your cookbook" screen
    // (format recap → Save as PDF → printer recommendations) rather than jumping
    // straight to the OS dialog. Plain cards print immediately, as before.
    if (cookbookMode) {
      openCookbookPrintDialog();
      return;
    }
    printNow();
  }

  function openCookbookPrintDialog() {
    track("cookbook_print_options_shown", { preset: activePreset.id });
    setShowCookbookPrintDialog(true);
  }

  function saveCookbookPdf() {
    setShowCookbookPrintDialog(false);
    printNow();
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

  const moveProjectItem = projectMeta.moveItem;

  useEffect(() => {
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
  }, [idsParam]);

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
    setToastMessage(newlyErrored.error || "Couldn't add that recipe.");
  }, [queue.items]);

  // Whether the "Print settings" trigger is reachable — purely card-format
  // concerns now (a back side to toggle, or 6x4's cut lines). Cookbook book
  // settings live inline in the Print setup panel (see `renderBookSettings`), so
  // in a cookbook there's nothing behind this trigger and it stays hidden.
  const hasPrintSettingsFields = hasRecipeBackSide || cardSize === "card-6x4";

  // Before it's a cookbook, this is a single call-to-action button — making a
  // cookbook is a deliberate step, not a symmetric toggle. Once you're in one,
  // it becomes a Recipe cards ↔ Cookbook segmented switch so you can flip back.
  function renderModeSwitch() {
    if (!COOKBOOK_ENABLED) return null;
    const inCookbook = Boolean(projectMeta.meta.cookbookMode);
    if (!inCookbook) {
      return (
        <button type="button" className="btn btn-primary btn-compact" onClick={startCookbook}>
          <BookIcon size={ICON_SIZE.sm} />
          Make it a cookbook
        </button>
      );
    }
    return (
      <div className="recipe-mode-switch" role="group" aria-label="Layout">
        <button
          type="button"
          className="recipe-mode-switch__option"
          onClick={() => setShowExitCookbookConfirm(true)}
        >
          Recipe cards
        </button>
        <button
          type="button"
          className="recipe-mode-switch__option is-active"
          aria-pressed
        >
          Cookbook
        </button>
      </div>
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

  // Cookbook "Book" settings, shown INLINE in the Print setup panel rather than
  // hidden behind a dialog — table of contents, and (once a section is named)
  // chapter opener pages.
  function renderBookSettings() {
    if (!projectMeta.meta.cookbookMode) return null;
    return (
      <>
        <CookbookPresetPicker
          value={activePreset.id}
          onChange={(id) => {
            projectMeta.setCookbookPreset(id);
            track("cookbook_preset_selected", { preset: id });
          }}
        />
        <div className="recipe-config-section recipe-config-section--settings">
        <span className="recipe-config-label">Book</span>
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
        {namedSectionCount(sections) >= 1 && (
          <label className="recipe-toggle">
            <input
              type="checkbox"
              checked={Boolean(projectMeta.meta.sectionDividers)}
              onChange={(event) => projectMeta.setSectionDividers(event.target.checked)}
            />
            <span>
              <strong>Chapter pages</strong>
              <small>Give each named section its own opener page.</small>
            </span>
          </label>
        )}
        </div>
      </>
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
      if (!shouldShowPostPrintDialog()) return;

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
        <SiteHeader onBack={cameFromSharedLink ? undefined : () => router.back()} compact sticky />
        <div className="flex-1 grid place-items-center text-ink-soft">Preparing…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader onBack={cameFromSharedLink ? undefined : () => router.back()} compact sticky />
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
  const renderActiveControls = (navItem: NavItem, previewW: number) => (
    <div
      className="recipe-page-canvas__controls no-print"
      style={{ "--preview-w": `${previewW}px` } as CSSProperties}
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
      preset={presetForRender}
      gutterSide={gutterSideForRole(role)}
      cookbookMode={Boolean(projectMeta.meta.cookbookMode)}
      showSourceUrl={
        sourceUrlOn ||
        (showSourceUrl && pageEditMode && focused && activeRecipeItem?.id === navItem.recipeId)
      }
      showCutLines={showCutLines && cardSize === "card-6x4"}
      inlineEdit={
        pageEditMode && focused && activeRecipeItem?.id === navItem.recipeId ? activeInlineEdit : undefined
      }
      dividerEdit={
        focused && navItem.kind === "divider" && editingSectionId === navItem.recipeId
          ? {
              sectionId: navItem.recipeId,
              value: editingSectionTitle,
              onChange: setEditingSectionTitle,
              onCommit: commitSectionEdit,
              onCancel: () => {
                setEditingSectionId(null);
                setEditingSectionTitle("");
              },
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
        onBack={cameFromSharedLink ? undefined : () => router.back()}
        compact
        sticky
        centerActions
        actions={renderModeSwitch()}
      />

      {/* Print preview / printed content */}
      <main
        className={`recipe-print-shell px-cp-6 print:p-0 ${
          previewMeasuring ? "recipe-print-shell--measuring" : ""
        }`}
      >
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
            ? spreads.map((spread, index) => {
                const primarySheet = spread.right ?? spread.left;
                const navFor = (sheetIndex: number | null) =>
                  sheetIndex != null && navIndexForSheet.has(sheetIndex)
                    ? navItems[navIndexForSheet.get(sheetIndex)!]
                    : null;
                const leftNav = navFor(spread.left);
                const rightNav = navFor(spread.right);
                const labelParts = Array.from(
                  new Set([leftNav?.label, rightNav?.label].filter(Boolean) as string[]),
                );
                const primarySheetObj = primarySheet != null ? sheets[primarySheet] : null;
                return (
                  <div key={`rail-spread-${index}`} className="recipe-page-rail__row">
                    <div className={`recipe-page-rail__item ${index === activeNavIndex ? "is-active" : ""}`}>
                      <button
                        type="button"
                        className="recipe-page-rail__item-main"
                        aria-current={index === activeNavIndex}
                        onClick={() => goToSlide(index)}
                      >
                        <span className="recipe-page-rail__num">{index + 1}</span>
                        <span className="recipe-page-rail__thumb">
                          {primarySheetObj && (
                            <ScaledPage
                              sheet={primarySheetObj}
                              isLastSheet={primarySheet === sheets.length - 1}
                              activeSlotIndex={0}
                              activeSide="front"
                              scale={RAIL_SCALE[cardSize]}
                              size={previewCardSize}
                              template={previewTemplate}
                              doubleSided={continueOnBack}
                              showSourceUrl={previewSourceUrlOn}
                              showCutLines={false}
                              cookbookMode
                            />
                          )}
                        </span>
                        <span className="recipe-page-rail__label">
                          <span className="recipe-page-rail__title">{labelParts.join(" · ") || "Spread"}</span>
                          <span className="recipe-page-rail__meta">
                            {spread.single ? (rightNav ?? leftNav)?.pageLabel ?? "" : "Spread"}
                          </span>
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })
            : railRows.map(({ header, navItem, index }) => {
            const headerSectionId =
              header && navItem.kind === "recipe" ? sectionAndIndexForItem(navItem.recipeId)?.sectionId : null;
            const currentSection = sectionForNavItem(navItem);
            const nextSection = sectionForNavItem(railRows[index + 1]?.navItem ?? null);
            const showSectionEndDrop =
              Boolean(currentSection) && currentSection?.id !== nextSection?.id;
            const isSectionChild =
              projectMeta.meta.sectionDividers &&
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
                  } ${draggingItemId === navItem.recipeId ? "is-dragging" : ""}`}
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

          <div className="recipe-page-rail__add-row">
            <button
              type="button"
              className={`recipe-page-rail__add recipe-page-rail__add-main ${
                projectMeta.meta.cookbookMode ? "recipe-page-rail__add-main--paired" : ""
              }`}
              onClick={() => {
                setAddMenuOpen(false);
                setPendingAddSectionId(sectionForNavItem(activeNavItem)?.id ?? sections[0]?.id ?? null);
                setShowAddRecipeDialog(true);
              }}
            >
              <PlusIcon size={ICON_SIZE.md} />
              Add recipe
            </button>
            {projectMeta.meta.cookbookMode && (
              <>
                <button
                  type="button"
                  className="recipe-page-rail__add-menu-trigger"
                  aria-label="More add options"
                  aria-haspopup="menu"
                  aria-expanded={addMenuOpen}
                  onClick={() => setAddMenuOpen((open) => !open)}
                >
                  <ChevronDownIcon size={ICON_SIZE.md} />
                </button>
                {addMenuOpen && (
                  <div className="recipe-page-rail__add-menu" role="menu" aria-label="Add options">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setAddMenuOpen(false);
                        addSectionDivider();
                      }}
                    >
                      Add section
                    </button>
                  </div>
                )}
              </>
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
            <Link href="/" className="recipe-mobile-back-button" aria-label="Back to recipes">
              <ChevronLeftIcon size={28} />
            </Link>
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
                {cookbookLocked || templateLocked ? "Unlock & Print" : "Print"}
              </button>
            </div>
          </div>
          <div
            className={`recipe-page-deck ${cookbookView ? "recipe-page-deck--book" : ""} ${
              cookbookMode ? activePreset.pageClass : ""
            }`}
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
                  const renderBlank = (trailing = false) => (
                    <div
                      className={`recipe-spread__blank ${trailing ? "recipe-spread__blank--trailing" : ""}`}
                      aria-hidden
                      style={{
                        width: `${previewDims.w * deckScale}px`,
                        height: `${previewDims.h * deckScale}px`,
                      }}
                    />
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
                      {isActive && activeNavItem && renderActiveControls(activeNavItem, spreadWidth * deckScale)}
                      <div
                        className={`recipe-spread ${spread.single ? "recipe-spread--single" : ""} ${
                          isImageSpread &&
                          isActive &&
                          (focusedSheet === spread.left || focusedSheet === spread.right)
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
                                ? renderBlank(true)
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
                      pageEditMode && isActive && activeRecipeItem?.id === navItem.recipeId
                        ? activeInlineEdit
                        : undefined
                    }
                    dividerEdit={
                      isActive && navItem.kind === "divider" && editingSectionId === navItem.recipeId
                        ? {
                            sectionId: navItem.recipeId,
                            value: editingSectionTitle,
                            onChange: setEditingSectionTitle,
                            onCommit: commitSectionEdit,
                            onCancel: () => {
                              setEditingSectionId(null);
                              setEditingSectionTitle("");
                            },
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
                className="field !min-h-[38px] !py-0 !pl-3 text-cp-small font-semibold"
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

          {renderBookSettings()}

          {((anyRecipeHasImage && !cookbookMode) || anyRecipeHasSourceUrl) && (
            <div className="recipe-config-section recipe-config-section--settings">
              {anyRecipeHasImage && !cookbookMode && (
                <label className="recipe-toggle">
                  <input
                    type="checkbox"
                    checked={showPhoto}
                    onChange={(event) => setShowPhoto(event.target.checked)}
                  />
                  <span>
                    <strong>Include recipe photo</strong>
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
                    <strong>Include link</strong>
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
                  hasTemplateEntitlement(customerInfo, premiumTemplate);

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
            <div className="recipe-cookpilot-account">
              {cookPilotUser ? (
                <p className="recipe-cookpilot-account__signed-in">
                  Signed in as {cookPilotUser.email ?? "your CookPilot account"}
                  {" · "}
                  <button
                    type="button"
                    className="recipe-cookpilot-account__link"
                    onClick={() => void signOut(getFirebaseAuth())}
                  >
                    Sign out
                  </button>
                </p>
              ) : (
                <div className="recipe-cookpilot-account__prompt">
                  <span className="recipe-cookpilot-account__hint">Already purchased?</span>
                  <button
                    type="button"
                    className="recipe-cookpilot-account__link"
                    onClick={() => setShowCookPilotLogin(true)}
                  >
                    Log in
                  </button>
                </div>
              )}
            </div>
          </div>
          </div>

          <div className="recipe-config-panel__footer">
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
              {cookbookLocked || selectedTemplateLocked ? "Unlock & Print" : "Print"}
            </button>
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
              Add recipe
            </button>
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
        showCookbookOfferDialog={showCookbookOfferDialog}
        onCloseCookbookOfferDialog={() => setShowCookbookOfferDialog(false)}
        onConfirmMakeCookbook={() => {
          scaffoldCookbook();
          setShowCookbookOfferDialog(false);
        }}
        showCookbookUnlockDialog={showCookbookUnlockDialog}
        onCloseCookbookUnlockDialog={() => setShowCookbookUnlockDialog(false)}
        cookbookPrice={cookbookPrice}
        cookbookPurchaseBusy={cookbookPurchaseBusy}
        onUnlockCookbook={() => void purchaseCookbookAndContinue(() => void handlePrint())}
        cookbookPreset={activePreset}
        onChangeFormat={() => setShowCookbookUnlockDialog(false)}
        showCookbookPrintDialog={showCookbookPrintDialog}
        onCloseCookbookPrintDialog={() => setShowCookbookPrintDialog(false)}
        onSaveCookbookPdf={saveCookbookPdf}
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
        <CookPilotLoginDialog onClose={() => setShowCookPilotLogin(false)} />
      )}
      {toastMessage && (
        <div className="recipe-toast no-print" role="status" aria-live="polite">
          <span>{toastMessage}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setToastMessage(null)}>
            <XIcon size={ICON_SIZE.sm} />
          </button>
        </div>
      )}
    </div>
  );
}
