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
  type RecipeCardInlineEdit,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { usePrintSheets, type NavItem, type PageSheet, type SheetSlot } from "@/lib/usePrintSheets";
import {
  buildSections,
  namedSectionCount,
  useProjectMeta,
} from "@/lib/project";
import { createPrintProjectId, savePrintProject, assemblePrintProject } from "@/lib/printProjects";
import { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import { useDeckScroller } from "@/lib/useDeckScroller";
import { usePremiumTemplatePurchase } from "@/lib/usePremiumTemplatePurchase";
import { useCookbookPurchase } from "@/lib/useCookbookPurchase";
import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
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
const RAIL_SCALE: Record<PrintCardSize, number> = {
  letter: RAIL_THUMB_WIDTH / PAGE_DIMS.letter.w,
  "card-6x4": RAIL_THUMB_WIDTH / PAGE_DIMS["card-6x4"].w,
};

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
  showImage,
  showSourceUrl,
  showCutLines,
  showDecoration = true,
  inlineEdit,
  dividerEdit,
  coverEdit,
}: {
  sheet: PageSheet;
  isLastSheet: boolean;
  activeSlotIndex: number;
  activeSide: "front" | "back";
  scale: number;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  doubleSided: boolean;
  showImage: boolean;
  showSourceUrl: boolean;
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
  };
  coverEdit?: {
    side: "front" | "back";
    cover: CoverConfig;
    onChange: (cover: CoverConfig) => void;
  };
}) {
  const dims = PAGE_DIMS[size];
  const anySlot = sheet.slots.find((slot): slot is SheetSlot => slot !== null) ?? null;
  if (!anySlot) return null;

  // Divider and cover sheets are always a single slot, single-sided, on their
  // own dedicated page — render the whole sheet as one face rather than the
  // front/back card-page structure below, which only recipes need.
  if (anySlot.kind === "divider" || anySlot.kind === "cover") {
    return (
      <div
        className="recipe-page-scaler"
        style={{ "--page-scale": scale, "--page-w": `${dims.w}px`, "--page-h": `${dims.h}px` } as CSSProperties}
      >
        <div className="recipe-page-scaler__inner">
          <div
            className={`recipe-print-preview recipe-print-preview--${size}`}
            data-double-sided="false"
          >
            <div className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}>
              <div className={`recipe-card-page recipe-card-page--front ${isLastSheet ? "recipe-card-page--no-break" : ""}`}>
                {anySlot.kind === "divider" ? (
                  <DividerFace
                    title={anySlot.title}
                    recipeTitles={anySlot.recipeTitles}
                    template={template}
                    showDecoration={showDecoration}
                    inlineEdit={dividerEdit?.sectionId === anySlot.id ? dividerEdit : undefined}
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
          className={`recipe-print-preview recipe-print-preview--${size} ${
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
                    showImage={showImage}
                    showSourceUrl={showSourceUrl}
                    continued={slot.isContinuation}
                    template={template}
                    showDecoration={showDecoration}
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
  const photosOn = showPhoto && anyRecipeHasImage;
  const sourceUrlOn = showSourceUrl && anyRecipeHasSourceUrl;

  const {
    hasRecipeBackSide,
    continueOnBack,
    printLayoutReady,
    measuredRecipeItems,
    sheets,
    navItems,
    previewConfig,
    awaitingFirstLayout,
    measurers,
  } = usePrintSheets({
    sections,
    cover: projectMeta.meta.cover,
    backCover: projectMeta.meta.backCover,
    sectionDividers: projectMeta.meta.sectionDividers,
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
  const previewPhotosOn = previewConfig?.photosOn ?? photosOn;
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
    return { title: "Untitled Cookbook", template };
  }

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

  const { canvasSide, setCanvasSide, deckScale, deckRef, slideRefs, goToSlide } = useDeckScroller({
    activeNavIndex,
    setActiveNavIndex,
    navItemsLength: navItems.length,
    cardSize: previewCardSize,
    sheetsLength: sheets.length,
    continueOnBack,
    singleRecipePrintView,
    pageWidth: PAGE_DIMS[previewCardSize].w,
    pageHeight: PAGE_DIMS[previewCardSize].h,
  });

  const activeRecipeId = navItems[activeNavIndex]?.recipeId ?? null;
  const activeNavItem = navItems[activeNavIndex] ?? null;
  const activeRecipeItem =
    activeRecipeId && items
      ? items.find((item) => item.id === activeRecipeId && item.recipe)
      : null;

  const { pageEditMode, togglePageEditMode, activeInlineEdit } = useRecipeInlineEditor({
    items,
    setItems,
    activeRecipeId,
    activeRecipeItem,
  });

  function printNow() {
    printRequestedRef.current = true;
    track("print_started", {
      template,
      cardSize,
      showPhoto,
      doubleSided,
      recipeCount: items?.filter((item) => item.recipe).length ?? 0,
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
      const project = assemblePrintProject({
        id: projectIdRef.current,
        ownerUid: cookPilotUser.uid,
        title: defaultTitle,
        sections,
        cover: projectMeta.meta.cover,
        backCover: projectMeta.meta.backCover,
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
        },
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
      showToast("Preparing the print layout. Try again in a moment.");
      return;
    }
    if (cookbookLocked) {
      track("paywall_shown", { product: "cookbook" });
      setShowCookbookUnlockDialog(true);
      return;
    }
    if (selectedPremiumTemplate) {
      if (selectedTemplateLocked) {
        track("paywall_shown", {
          product: "premium_template",
          template: selectedPremiumTemplate,
        });
        setShowUnlockDialog(true);
        return;
      }
      printNow();
      return;
    }
    printNow();
  }

  function handleMobilePrint() {
    setMobileDrawer(null);
    void handlePrint();
  }

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

  // Whether the "Print settings" trigger itself should be reachable at all —
  // originally just card-format concerns (a back side to toggle, or 6x4's
  // cut lines), now also true once book-only settings (section dividers,
  // table of contents) become applicable. Without this, a sectioned
  // letter-page project with no back-side content would have no way to
  // reach those toggles even though renderPrintSettingsFields renders them.
  const hasPrintSettingsFields =
    hasRecipeBackSide ||
    cardSize === "card-6x4" ||
    // `|| sections.length > 1` used to be here for the table-of-contents
    // toggle, which applied to any multi-section project, named or not. With
    // that toggle gone the only book-only field left is section dividers, so
    // keeping the clause would open a "Print settings" dialog with nothing in
    // it for an unnamed multi-section project.
    (projectMeta.meta.cookbookMode && namedSectionCount(sections) >= 1);

  // Shared between the desktop "Print settings" popover and the mobile
  // settings menu, so both surfaces stay in sync rather than drifting into
  // two separately-maintained lists of the same controls.
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
        {hasRecipeBackSide && (
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
        {hasRecipeBackSide && doubleSided && (
          <p className="recipe-print-settings-banner" role="note">
            Turn on two-sided printing in your printer&apos;s settings, flipped on the{" "}
            <strong>long edge</strong>.
          </p>
        )}
        {/* Book-only settings — hidden entirely outside cookbook mode, and
            within cookbook mode simply don't render until they're
            applicable. A plain print-cards project's settings panel stays
            exactly as short as it is today. */}
        {projectMeta.meta.cookbookMode && namedSectionCount(sections) >= 1 && (
          <label className="recipe-toggle">
            <input
              type="checkbox"
              checked={Boolean(projectMeta.meta.sectionDividers)}
              onChange={(event) => projectMeta.setSectionDividers(event.target.checked)}
            />
            <span>
              <strong>Section divider pages</strong>
              <small>Give each named section its own page when printed.</small>
            </span>
          </label>
        )}
        {/* No table-of-contents toggle: nothing renders a TOC yet. It used to
            sit here, fully wired to `projectMeta.tableOfContents` — persisted,
            saved into the project, and with no effect whatsoever on what
            printed. A control that remembers your choice and then ignores it is
            worse than no control, so it's out until there's a TOC page behind
            it. The stored flag itself is deliberately kept (see
            ProjectMeta.tableOfContents) so already-saved projects still
            round-trip. */}
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
      track("print_dialog_closed", { template, cardSize });
      if (!shouldShowPostPrintDialog()) return;

      markPostPrintDialogShown();
      window.setTimeout(() => setShowDonateDialog(true), 150);
    }

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
    // template/cardSize are read inside the handler, so the listener has to be
    // re-registered when they change or it would report a stale configuration.
  }, [template, cardSize]);

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

  return (
    <div className="h-dvh recipe-print-page">
      {measurers}
      <SiteHeader
        onBack={cameFromSharedLink ? undefined : () => router.back()}
        compact
        sticky
        actions={
          COOKBOOK_ENABLED && !projectMeta.meta.cookbookMode && (
            <button
              type="button"
              className="btn btn-ghost btn-compact recipe-make-cookbook-btn"
              onClick={() => setShowCookbookOfferDialog(true)}
            >
              <BookIcon size={ICON_SIZE.md} />
              Make it a cookbook
            </button>
          )
        }
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
          {railRows.map(({ header, navItem, index }) => {
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
                        showImage={previewPhotosOn}
                        showSourceUrl={previewSourceUrlOn}
                        showCutLines={false}
                        showDecoration={false}
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
              {COOKBOOK_ENABLED && !projectMeta.meta.cookbookMode && (
                <button
                  type="button"
                  className="recipe-mobile-topbar__icon-btn"
                  aria-label="Make it a cookbook"
                  onClick={() => setShowCookbookOfferDialog(true)}
                >
                  <BookIcon size={ICON_SIZE.lg} />
                </button>
              )}
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
                disabled={purchaseBusy || cookbookPurchaseBusy || !printLayoutReady}
              >
                {purchaseBusy || cookbookPurchaseBusy || !printLayoutReady ? (
                  <SpinnerIcon size={ICON_SIZE.md} />
                ) : (
                  <PrintIcon size={ICON_SIZE.md} />
                )}
                {cookbookLocked || selectedTemplateLocked ? "Unlock & Print" : "Print"}
              </button>
            </div>
          </div>
          <div className="recipe-page-deck" id="recipe-page-deck" ref={deckRef}>
            {navItems.map((navItem, index) => {
              const sheet = sheets[navItem.sheetIndex];
              if (!sheet) return null;
              const isActive = index === activeNavIndex;
              // Only the first nav item for a given sheet renders the markup
              // that actually prints (the whole sheet, both slots). A second
              // recipe sharing that sheet gets its own on-screen-only slide
              // (`.no-print`) so scrolling can reach it like any other
              // recipe, without the sheet printing twice.
              const isFirstOnSheet =
                navItems.findIndex((item) => item.sheetIndex === navItem.sheetIndex) === index;
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
                      {activeNavItem && (
                        <div className="recipe-page-canvas__controls-right">
                          <button
                            type="button"
                            className={`recipe-page-edit-toggle ${
                              (activeNavItem.kind === "recipe" && pageEditMode) ||
                              (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                              (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem))
                                ? "is-active"
                                : ""
                            }`}
                            aria-pressed={
                              (activeNavItem.kind === "recipe" && pageEditMode) ||
                              (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                              (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem))
                            }
                            onClick={(event) => {
                              event.stopPropagation();
                              if (activeNavItem.kind === "recipe") {
                                togglePageEditMode();
                              } else if (activeNavItem.kind === "divider") {
                                if (editingSectionId === activeNavItem.recipeId) commitSectionEdit();
                                else startSectionEdit(activeNavItem.recipeId);
                              } else {
                                const side = coverSideFromNavItem(activeNavItem);
                                setEditingCoverSide((current) => (current === side ? null : side));
                              }
                            }}
                          >
                            <EditIcon size={ICON_SIZE.xs} />
                            {(activeNavItem.kind === "recipe" && pageEditMode) ||
                            (activeNavItem.kind === "divider" && editingSectionId === activeNavItem.recipeId) ||
                            (activeNavItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(activeNavItem))
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
                    showImage={previewPhotosOn}
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
                          }
                        : undefined
                    }
                    coverEdit={
                      isActive && navItem.kind === "cover" && editingCoverSide === coverSideFromNavItem(navItem)
                        ? {
                            side: coverSideFromNavItem(navItem),
                            cover: coverForSide(coverSideFromNavItem(navItem)) ?? defaultCover(),
                            onChange: (cover) => setCoverForSide(coverSideFromNavItem(navItem), cover),
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
              {mobileDrawer === "template" ? "Themes" : "Print setup"}
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

          {(anyRecipeHasImage || anyRecipeHasSourceUrl) && (
            <div className="recipe-config-section recipe-config-section--settings">
              {anyRecipeHasImage && (
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
            {hasUnclaimedFreeTemplate && !freeTemplateBannerDismissed && (
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
                const locked =
                  premiumTemplate !== null &&
                  !hasTemplateEntitlement(customerInfo, premiumTemplate);
                const owned =
                  premiumTemplate !== null &&
                  hasTemplateEntitlement(customerInfo, premiumTemplate);

                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`recipe-template-option recipe-template-option--${option.id} ${
                      template === option.id ? "is-active" : ""
                    }`}
                    aria-pressed={template === option.id}
                    aria-label={`${option.label}${locked ? " premium" : owned ? " owned" : ""}`}
                    onClick={() => {
                      setTemplate(option.id);
                      track("template_selected", {
                        template: option.id,
                        premium: premiumTemplate !== null,
                      });
                      setToastMessage(null);
                      setMobileDrawer(null);
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
                    <span className="recipe-template-option__preview" aria-hidden>
                      <span className="recipe-template-option__sample-title">Lemon Pasta</span>
                      <span className="recipe-template-option__sample-meta">25 min · Serves 4</span>
                      <span className="recipe-template-option__sample-grid">
                        <span>
                          <strong>Ingredients</strong>
                          <i>Spaghetti</i>
                          <i>Lemon</i>
                          <i>Parmesan</i>
                        </span>
                        <span>
                          <strong>Steps</strong>
                          <i>Boil pasta.</i>
                          <i>Toss with sauce.</i>
                          <i>Finish warm.</i>
                        </span>
                      </span>
                    </span>
                  </button>
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
              disabled={purchaseBusy || cookbookPurchaseBusy || !printLayoutReady}
            >
              {purchaseBusy || cookbookPurchaseBusy || !printLayoutReady ? (
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
            {anyRecipeHasImage && (
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
          projectMeta.setCookbookMode(true);
          addCover();
          setShowCookbookOfferDialog(false);
        }}
        showCookbookUnlockDialog={showCookbookUnlockDialog}
        onCloseCookbookUnlockDialog={() => setShowCookbookUnlockDialog(false)}
        cookbookPrice={cookbookPrice}
        cookbookPurchaseBusy={cookbookPurchaseBusy}
        onUnlockCookbook={() => void purchaseCookbookAndContinue(() => void handlePrint())}
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
