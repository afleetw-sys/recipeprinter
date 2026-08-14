"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type MutableRefObject, type ReactNode, type RefObject, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import type { AccountSaveStatus } from "@/components/AccountControl";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { PrintDialogs } from "@/components/PrintDialogs";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";
import { CookbookBuildReveal, CookbookWelcomeDialog } from "@/components/CookbookWelcomeDialog";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import { ImagePicker } from "@/components/ImagePicker";
import { Dialog } from "@/components/Dialog";
import { Checkbox, CheckboxGroup, IconButton, SegmentedControl } from "@/components/Controls";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { useModalFocus } from "@/components/useModalFocus";
import {
  PRINT_CARD_SIZE_OPTIONS,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { TemplateThumbnail } from "@/components/print/TemplateThumbnail";
import { PHOTO_STYLE_OPTIONS } from "@/components/print/photoStyle";
import { MobileStructureSheet } from "@/components/print/MobileStructureSheet";
import { PrintConfigPanel } from "@/components/print/PrintConfigPanel";
import { PageRail } from "@/components/print/PageRail";
import { PrintDeck } from "@/components/print/PrintDeck";
import {
  usePrintSheets,
  type NavItem,
  type ImageSheetSlot,
} from "@/lib/usePrintSheets";
import {
  buildSections,
  namedSectionCount,
  resolveSectionPhotoMode,
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
import { useRailDrag, type RailDragKind, type RailDropResolved } from "@/lib/useRailDrag";
import { useRailSelection } from "@/lib/useRailSelection";
import { PAGE_DIMS } from "@/lib/printGeometry";
import { useDeckScroller } from "@/lib/useDeckScroller";
import { usePremiumTemplatePurchase } from "@/lib/usePremiumTemplatePurchase";
import { useCookbookPurchase } from "@/lib/useCookbookPurchase";
import { COOKBOOK_ENABLED } from "@/lib/cookbookProduct";
import {
  DEFAULT_COOKBOOK_PRESET_ID,
  getCookbookPreset,
  presetArtScale,
  presetSheetInches,
} from "@/lib/cookbookPresets";
import { localStore } from "@/lib/storage";
import { track } from "@/lib/analytics";
import {
  organizationSectionsForApply,
  suggestCookbookOrganization,
} from "@/lib/cookbookOrganizer";
import {
  CheckIcon,
  BookIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  SizeIcon,
  SpinnerIcon,
  TemplateIcon,
  TrashIcon,
  XIcon,
} from "@/components/icons";
import { isPremiumTemplate } from "@/lib/premiumTemplates";
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
import type {
  CookbookPresetId,
  CoverConfig,
  PrintProject,
  QueueItem,
  Recipe,
  Section,
  SectionPhotoMode,
} from "@/types/recipe";
import { postPrintPrompt, purchaseGate, type PostPrintAction } from "@/lib/purchaseAccess";
import { isCookbookProjectUnlocked } from "@/lib/cookbookUnlocks";
import {
  markPrintPreviewStable,
  PRINT_PREVIEW_STABILITY_MS,
} from "@/lib/printErrorRecovery";

const AdminShareLinkDialog = dynamic(
  () => import("@/components/AdminShareLinkDialog").then((mod) => mod.AdminShareLinkDialog),
  { ssr: false, loading: () => null },
);

const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:post-print-dialog:last-shown:v1";


// Per-recipe cookbook page-layout choices. `full` = a plain full-page card;
// `image-spread` = the card facing a full-bleed photo page. A cookbook always
// gives each recipe its own full page.

// The section opener's photo placement — the SAME None/In-card/Full-page row as
// a recipe, so the two pickers read identically. A collage isn't a fourth
// top-level choice: under Full page the cook can turn the single facing photo
// into a grid of this chapter's photos (see `buildSectionPhotoEdit`).
const SECTION_PHOTO_OPTIONS: Array<{ id: SectionPhotoMode; label: string; hint: string }> = [
  { id: "none", label: "None", hint: "No opener photo" },
  { id: "band", label: "In card", hint: "A photo in the opener’s band" },
  { id: "full", label: "Full page", hint: "A full-page photo facing the opener" },
];

/** This section's own recipe photos, in item order, capped for a collage. Scopes
    the opener picker to the chapter (unlike the whole-book `coverPhotoCandidates`). */
function sectionRecipeImages(section: Section): string[] {
  return section.items
    .map((item) => item.recipe?.image)
    .filter((url): url is string => Boolean(url))
    .slice(0, 9);
}


// Fresh cookbooks open on a premium theme (unlocked inside the $19.99 book, so
// no paywall — see `templateLocked`), rotating through them so the first view
// looks designed rather than the plain Classic default. The rotation index
// persists in localStorage so each new book lands on the next theme.
const COOKBOOK_TEMPLATE_ROTATION: RecipePrintTemplate[] = [
  "heirloom",
  "bistro",
  "counter",
  "keepsake",
];
const COOKBOOK_TEMPLATE_ROTATION_KEY = "recipeprinter:cookbook-template-rotation";

// A ready-made dedication seeded when the page is turned on — real, editable
// content (not a hidden placeholder), so a cook who likes it can just keep it
// and it prints as-is.
const DEFAULT_DEDICATION_BODY = "For the ones who taught us to cook — and who made every table feel like home.";
function nextCookbookTemplate(): RecipePrintTemplate {
  if (typeof window === "undefined") return COOKBOOK_TEMPLATE_ROTATION[0];
  const prev = Number(window.localStorage.getItem(COOKBOOK_TEMPLATE_ROTATION_KEY));
  const next = ((Number.isFinite(prev) ? prev : -1) + 1) % COOKBOOK_TEMPLATE_ROTATION.length;
  try {
    window.localStorage.setItem(COOKBOOK_TEMPLATE_ROTATION_KEY, String(next));
  } catch {
    /* private mode / quota: a non-persisted rotation is still fine */
  }
  return COOKBOOK_TEMPLATE_ROTATION[next];
}

// A short, generic recipe used only to fill each theme's picker preview. Kept
// intentionally small so it lays out as a clean single front face at 6x4.
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
  return (
    <SegmentedControl
      className="recipe-mode-switch"
      label="Layout"
      value={inCookbook ? "cookbook" : "cards"}
      options={[
        { id: "cards", label: "Recipe cards" },
        { id: "cookbook", label: <>Cookbook <span className="recipe-mode-switch__badge">New</span></> },
      ]}
      onChange={(value) => value === "cookbook" ? onSwitchToCookbook() : onSwitchToCards()}
    />
  );
}

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

interface PrintWorkspaceProps {
  activeNavIndexResetRef: { current: ((index: number) => void) | null };
  doubleSided: boolean;
  setItems: Dispatch<SetStateAction<QueueItem[] | null>>;
  addCover: () => void;
  addMenuOpen: boolean;
  addMenuRef: MutableRefObject<HTMLDivElement | null>;
  addSectionDivider: () => void;
  addStructureSection: () => void;
  anyRecipeHasImage: boolean;
  anyRecipeHasSourceUrl: boolean;
  applyBookPhotoStyle: (mode: PhotoStyle) => void;
  bookPhotoStyle: PhotoStyle | null;
  cardSize: PrintCardSize;
  commitSectionEdit: () => void;
  continueOnBack: boolean;
  cookPilotUser: ReturnType<typeof useCookPilotAuth>["user"];
  cookbookBuilding: boolean;
  cookbookLocked: ReturnType<typeof useCookbookPurchase>["cookbookLocked"];
  cookbookMode: boolean;
  coverForSide: (side: "front" | "back" | "dedication") => CoverConfig | undefined;
  coverPhotoCandidates: string[];
  coverSideFromNavItem: (navItem: NavItem) => "front" | "back" | "dedication";
  customerInfo: ReturnType<typeof usePremiumTemplatePurchase>["customerInfo"];
  defaultCover: () => CoverConfig;
  draggingItemId: string | null;
  editingCoverSide: "front" | "back" | "dedication" | null;
  editingSectionId: string | null;
  editingSectionTitle: string;
  editingToc: boolean;
  enterOrganizeMode: () => void;
  exitOrganizeMode: () => void;
  exportPreset: CookbookPresetId | null;
  firstNavIndexBySheet: Map<number, number>;
  freeTemplateBannerDismissed: ReturnType<typeof usePremiumTemplatePurchase>["freeTemplateBannerDismissed"];
  handleDropIntoSection: (sectionId: string, toIndex: number) => void;
  handleDropOnItem: (targetItemId: string) => void;
  handleMobilePrint: () => void;
  handlePrint: () => Promise<void>;
  handleSaveProject: () => Promise<void>;
  hasPrintSettingsFields: boolean;
  hasRecipeBackSide: boolean;
  hasUnclaimedFreeTemplate: ReturnType<typeof usePremiumTemplatePurchase>["hasUnclaimedFreeTemplate"];
  isRecipePrinterAdmin: boolean;
  itemIdsForSection: (sectionId: string) => string[];
  items: QueueItem[] | null;
  mobileDrawer: "template" | null;
  moveProjectItem: ReturnType<typeof useProjectMeta>["moveItem"];
  moveRecipeInBook: (itemId: string, direction: -1 | 1) => void;
  moveSectionInBook: (sectionId: string, direction: -1 | 1) => void;
  navItems: ReturnType<typeof usePrintSheets>["navItems"];
  organizeAnimating: boolean;
  organizeMode: boolean;
  organizeWide: boolean;
  pendingAddAfterRecipeId: string | null;
  pendingDelete: { kind: "recipe"; id: string; title: string } | { kind: "section"; id: string; title: string; recipeIds: string[] } | { kind: "cover"; side: "front" | "back" | "dedication"; title: string } | null;
  pendingFocusNavId: string | null;
  pendingFocusRecipeId: string | null;
  pendingImportItems: QueueItem[];
  photoModeFor: (recipeId: string) => PhotoStyle;
  photoStyle: PhotoStyle;
  previewCardSize: PrintCardSize;
  previewMeasuring: boolean;
  previewSourceUrlOn: boolean;
  previewTemplate: RecipePrintTemplate;
  printBlocked: boolean;
  printSettingsOpen: boolean;
  printSpinner: boolean;
  projectMeta: ReturnType<typeof useProjectMeta>;
  projectSaveBusy: boolean;
  queue: ReturnType<typeof useQueue>;
  railDrag: ReturnType<typeof useRailDrag>;
  railRows: Array<{ header?: string; navItem: NavItem; index: number }>;
  railScrollRef: MutableRefObject<HTMLElement | null>;
  railShake: { recipeId: string; nonce: number } | null;
  renameSectionEverywhere: (sectionId: string, value: string) => void;
  renderBookDesignSettings: () => ReactNode;
  renderModeSwitch: () => ReactNode;
  renderPrintSettingsFields: () => ReactNode;
  renderSectionPhotoControl: (sectionId: string) => ReactNode;
  requestDeleteNavItem: (navItem: NavItem) => void;
  requestDeleteSection: (sectionId: string) => void;
  savedProjectId: string | null;
  sectionAndIndexForItem: (itemId: string) => { sectionId: string; index: number } | null;
  sectionForNavItem: (navItem: NavItem | null) => { id: string; index: number } | null;
  sectionTitleForId: (sectionId: string) => string;
  sections: Section[];
  setAddMenuOpen: Dispatch<SetStateAction<boolean>>;
  setCardSize: Dispatch<SetStateAction<PrintCardSize>>;
  setCoverForSide: (side: "front" | "back" | "dedication", cover: CoverConfig | undefined) => void;
  setDraggingItemId: Dispatch<SetStateAction<string | null>>;
  setEditingCoverSide: Dispatch<SetStateAction<"front" | "back" | "dedication" | null>>;
  setEditingSectionId: Dispatch<SetStateAction<string | null>>;
  setEditingSectionTitle: Dispatch<SetStateAction<string>>;
  setEditingToc: Dispatch<SetStateAction<boolean>>;
  setFreeTemplateBannerDismissed: ReturnType<typeof usePremiumTemplatePurchase>["setFreeTemplateBannerDismissed"];
  setMobileDrawer: Dispatch<SetStateAction<"template" | null>>;
  setPendingAddAfterRecipeId: Dispatch<SetStateAction<string | null>>;
  setPendingAddIndex: Dispatch<SetStateAction<number | null>>;
  setPendingAddSectionId: Dispatch<SetStateAction<string | null>>;
  setPendingFocusNavId: Dispatch<SetStateAction<string | null>>;
  setPendingFocusRecipeId: Dispatch<SetStateAction<string | null>>;
  setPrintSettingsOpen: Dispatch<SetStateAction<boolean>>;
  setShowAddRecipeDialog: Dispatch<SetStateAction<boolean>>;
  setShowPhoto: Dispatch<SetStateAction<boolean>>;
  setShowShareDialog: Dispatch<SetStateAction<boolean>>;
  setShowSourceUrl: Dispatch<SetStateAction<boolean>>;
  setTemplate: Dispatch<SetStateAction<RecipePrintTemplate>>;
  setToastMessage: Dispatch<SetStateAction<string | null>>;
  sheets: ReturnType<typeof usePrintSheets>["sheets"];
  showAddRecipeDialog: boolean;
  showCookPilotLogin: boolean;
  showCookbookOfferDialog: boolean;
  showCutLines: boolean;
  showDonateDialog: boolean;
  showFeedbackDialog: boolean;
  showPhoto: boolean;
  showShareDialog: boolean;
  showSourceUrl: boolean;
  sourceUrlOn: boolean;
  spreads: ReturnType<typeof usePrintSheets>["spreads"];
  startSectionEdit: (sectionId: string) => void;
  suggestCookbookLayout: () => void;
  template: RecipePrintTemplate;
  templateLocked: boolean;
  toggleDedication: () => void;
}

// Content signature used for autosave change-detection. A single source of truth
// so the debounced autosave check and the post-save baseline (in handleSaveProject)
// can never drift into non-comparable strings. Called lazily — only when there is
// actually a project to save, and only once per debounce settle — never eagerly on
// every keystroke (this is a JSON.stringify of the entire book).
function printProjectFingerprint(
  items: QueueItem[] | null,
  meta: ProjectMeta,
  cardSize: PrintCardSize,
  template: RecipePrintTemplate,
  doubleSided: boolean,
  showPhoto: boolean,
  showSourceUrl: boolean,
  showCutLines: boolean,
): string {
  return JSON.stringify({
    items,
    meta,
    cardSize,
    template,
    doubleSided,
    showPhoto,
    showSourceUrl,
    showCutLines,
  });
}

function PrintWorkspace(props: PrintWorkspaceProps) {
  const {
    activeNavIndexResetRef,
    doubleSided,
    setItems,
    addCover,
    addMenuOpen,
    addMenuRef,
    addSectionDivider,
    addStructureSection,
    anyRecipeHasImage,
    anyRecipeHasSourceUrl,
    applyBookPhotoStyle,
    bookPhotoStyle,
    cardSize,
    commitSectionEdit,
    continueOnBack,
    cookPilotUser,
    cookbookBuilding,
    cookbookLocked,
    cookbookMode,
    coverForSide,
    coverPhotoCandidates,
    coverSideFromNavItem,
    customerInfo,
    defaultCover,
    draggingItemId,
    editingCoverSide,
    editingSectionId,
    editingSectionTitle,
    editingToc,
    enterOrganizeMode,
    exitOrganizeMode,
    exportPreset,
    firstNavIndexBySheet,
    freeTemplateBannerDismissed,
    handleDropIntoSection,
    handleDropOnItem,
    handleMobilePrint,
    handlePrint,
    handleSaveProject,
    hasPrintSettingsFields,
    hasRecipeBackSide,
    hasUnclaimedFreeTemplate,
    isRecipePrinterAdmin,
    itemIdsForSection,
    items,
    mobileDrawer,
    moveProjectItem,
    moveRecipeInBook,
    moveSectionInBook,
    navItems,
    organizeAnimating,
    organizeMode,
    organizeWide,
    pendingAddAfterRecipeId,
    pendingDelete,
    pendingFocusNavId,
    pendingFocusRecipeId,
    pendingImportItems,
    photoModeFor,
    photoStyle,
    previewCardSize,
    previewMeasuring,
    previewSourceUrlOn,
    previewTemplate,
    printBlocked,
    printSettingsOpen,
    printSpinner,
    projectMeta,
    projectSaveBusy,
    queue,
    railDrag,
    railRows,
    railScrollRef,
    railShake,
    renameSectionEverywhere,
    renderBookDesignSettings,
    renderModeSwitch,
    renderPrintSettingsFields,
    renderSectionPhotoControl,
    requestDeleteNavItem,
    requestDeleteSection,
    savedProjectId,
    sectionAndIndexForItem,
    sectionForNavItem,
    sectionTitleForId,
    sections,
    setAddMenuOpen,
    setCardSize,
    setCoverForSide,
    setDraggingItemId,
    setEditingCoverSide,
    setEditingSectionId,
    setEditingSectionTitle,
    setEditingToc,
    setFreeTemplateBannerDismissed,
    setMobileDrawer,
    setPendingAddAfterRecipeId,
    setPendingAddIndex,
    setPendingAddSectionId,
    setPendingFocusNavId,
    setPendingFocusRecipeId,
    setPrintSettingsOpen,
    setShowAddRecipeDialog,
    setShowPhoto,
    setShowShareDialog,
    setShowSourceUrl,
    setTemplate,
    setToastMessage,
    sheets,
    showAddRecipeDialog,
    showCookPilotLogin,
    showCookbookOfferDialog,
    showCutLines,
    showDonateDialog,
    showFeedbackDialog,
    showPhoto,
    showShareDialog,
    showSourceUrl,
    sourceUrlOn,
    spreads,
    startSectionEdit,
    suggestCookbookLayout,
    template,
    templateLocked,
    toggleDedication,
  } = props;
  // The photo-placement fields of a section opener's `dividerEdit`, shared by
  // both deck call sites (spread deck + single-page deck) so the two can never
  // drift. Drives the unified ImagePicker: the same None/In-card/Full-page row as
  // a recipe. A collage is NOT a top-level choice — under Full page the cook can
  // toggle the single facing photo into a grid of this chapter's own photos
  // (scoped to the section, not the whole-book candidates).
  const buildSectionPhotoEdit = (section: Section | undefined) => {
    const mode = resolveSectionPhotoMode(section ?? {});
    const ownImages = section ? sectionRecipeImages(section) : [];
    const seedGridCount = ownImages.length >= 6 ? 6 : ownImages.length >= 4 ? 4 : 2;
    const isGrid = mode === "grid";
    return {
      // Materialize the inherited image for the live editor too. The visible
      // deck is double-buffered, so relying only on the next generated sheet
      // lets the placement control say "In card" while the current opener is
      // still handed no image at all.
      photoUrl: section?.photoUrl ?? ownImages[0],
      recipeImages: ownImages,
      // A single photo tile is only pickable in band / single Full-page mode
      // (grid has its own multi-select, none has no tiles) — keep the current
      // placement and set the one photo it names.
      onPhotoChange: (url: string | undefined) => {
        if (!section) return;
        projectMeta.setSectionPhotoMode(section.id, mode === "band" ? "band" : "full", {
          photoUrl: url,
        });
      },
      // Grid is a Full-page sub-mode, so it reports "Full page" as the active
      // placement and exposes the collage separately via `gridActive`.
      placement: isGrid ? "full" : mode,
      placementOptions: SECTION_PHOTO_OPTIONS,
      onPlacementChange: (next: string) => {
        if (!section) return;
        const m = next as SectionPhotoMode;
        if (m === "none") {
          projectMeta.setSectionPhotoMode(section.id, "none");
        } else {
          // band or full — seed the photo from the section's first recipe image
          // so the page/band is never blank (like a recipe's Full page seeds its
          // hero). Clicking Full page while in a grid collapses back to one photo.
          projectMeta.setSectionPhotoMode(section.id, m, {
            photoUrl: section.photoUrl ?? ownImages[0],
          });
        }
      },
      // The Full-page → Photo grid toggle: on curates a collage seeded from this
      // chapter's photos; off collapses back to a single facing photo.
      gridActive: isGrid,
      onSelectGrid:
        section && ownImages.length >= 2
          ? () => {
              projectMeta.setSectionPhotoMode(section.id, "grid", {
                gridImages: section.gridImages?.length
                  ? section.gridImages
                  : ownImages.slice(0, seedGridCount),
              });
            }
          : undefined,
      onExitGrid: section
        ? () =>
            projectMeta.setSectionPhotoMode(section.id, "full", {
              photoUrl: section.photoUrl ?? section.gridImages?.[0] ?? ownImages[0],
            })
        : undefined,
      gridImages: section?.gridImages,
      onGridChange: (urls: string[]) => {
        if (!section) return;
        projectMeta.setSectionPhotoMode(section.id, "grid", { gridImages: urls });
      },
      gridMax: 9,
    };
  };
  function openAddRecipeBelow(navItem: NavItem | null = activeNavItem) {
    const location = sectionForNavItem(navItem);
    const anchorId = navItem?.kind === "recipe" || navItem?.kind === "divider" ? navItem.recipeId : null;
    const insertionIndex = navItem?.kind === "recipe"
      ? (sectionAndIndexForItem(navItem.recipeId)?.index ?? -1) + 1
      : 0;
    setPendingAddSectionId(location?.id ?? sections[0]?.id ?? null);
    setPendingAddIndex(Math.max(0, insertionIndex));
    setPendingAddAfterRecipeId(anchorId);
    setShowAddRecipeDialog(true);
  }
  function navigateToRecipe(itemId: string) {
    const index = navItems.findIndex(
      (nav) => nav.kind === "recipe" && nav.recipeId === itemId,
    );
    if (index !== -1) goToSlide(index);
    setStructureSheetOpen(false);
  }
  // ── Rail multi-select (cookbook) ─────────────────────────────────────────
  function makeSectionFromSelection(selection: ReadonlySet<string> = effectiveRailSelection) {
    const ids = orderedRailSelection(selection);
    if (ids.length === 0) return;
    const sectionId = projectMeta.addSection("New section");
    ids.forEach((id, index) => moveProjectItem(id, sectionId, index));
    clearRailSelection();
    setEditingSectionId(sectionId);
    setEditingSectionTitle("New section");
    setPendingFocusNavId(sectionId);
    track("cookbook_section_created_from_selection", { count: ids.length });
  }
  // Set one recipe's photo mode. Picking the book default clears the override so
  // the page keeps following the book; anything else pins an explicit choice.
  // The recipe usually moves to a different page (its full-page photo appears or
  // vanishes), so follow it there and keep it selected — and, if we're mid-edit,
  // keep it in edit mode across the jump.
  function setRecipePhotoMode(recipeId: string, mode: PhotoStyle) {
    if (pageEditMode && activeRecipeId === recipeId) keepEditingRef.current = recipeId;
    setPendingFocusRecipeId(recipeId);
    if (mode === photoStyle) {
      projectMeta.setItemPlacement(recipeId, undefined);
      return;
    }
    const hero = mode === "full" ? items?.find((item) => item.id === recipeId)?.recipe?.image : undefined;
    projectMeta.setItemPhotoMode(recipeId, mode, hero);
  }
  // The per-recipe photo placement toggle (cookbook): an always-present
  // None / In-card / Full-page switch that sits next to the Edit button, so
  // placement is one click away in every mode (not only when the photo is off).
  // The floating "Photo" button on the page still opens the fuller dialog
  // (placement + which photo). Shared desktop + mobile.
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
  const [activeNavIndex, setActiveNavIndex] = useState(0);
  activeNavIndexResetRef.current = setActiveNavIndex;
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
  // `.rp-coil` marks a spiral/coil export so the coil-only binding decoration
  // fires (see print.css); it stays off for hardcover. Both are gated behind
  // `.rp-exporting`, so NONE of this touches the on-screen deck — the preview
  // always shows the plain Letter template.
  const deckExportClass = exportPresetObj
    ? `rp-exporting ${exportPresetObj.pageClass}${exportPresetObj.coilBound ? " rp-coil" : ""}`
    : "";
  const deckExportStyle = (exportPresetObj
    ? {
        // Every cookbook page — text and art alike — fills the sheet at this
        // scale so paper/art bleeds to every edge; content is inset only by the
        // card's own padding + the binding decoration (see print.css).
        "--rp-art-scale": presetArtScale(exportPresetObj),
        // The exact physical sheet size, so the print page box (`.recipe-card-page`)
        // is a fixed `in` height that matches this preset's `@page size` in every
        // engine — never `100vh`, which WebKit resolves against the on-screen
        // viewport in print and collapsed the custom hardcover sheet to a top
        // sliver (see `presetSheetInches` + print.css).
        "--rp-sheet-w": presetSheetInches(exportPresetObj).w,
        "--rp-sheet-h": presetSheetInches(exportPresetObj).h,
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
  // When a click navigates to another spread AND wants a specific page focused
  // (e.g. the left/verso page of a two-page spread — the dedication facing the
  // contents), the `activeNavIndex` change below would otherwise reset focus to
  // the default recto. Stash the intended page here so the reset honors it.
  const pendingFocusSheetRef = useRef<number | null>(null);
  useEffect(() => {
    if (pendingFocusSheetRef.current !== null) {
      setFocusedSheetIndex(pendingFocusSheetRef.current);
      pendingFocusSheetRef.current = null;
    } else {
      setFocusedSheetIndex(null);
    }
  }, [activeNavIndex]);
  // Focus a specific page within a spread, navigating there first if needed.
  // Direct focus when already on the spread; otherwise the ref survives the
  // navigation reset so the left page can be reached from another spread.
  const focusSheetInSpread = (spreadIndex: number, sheetIndex: number | null) => {
    if (spreadIndex === activeNavIndex) {
      if (sheetIndex != null) setFocusedSheetIndex(sheetIndex);
      return;
    }
    pendingFocusSheetRef.current = sheetIndex;
    goToSlide(spreadIndex);
  };
  const activeSpread = cookbookView ? spreads[activeNavIndex] ?? null : null;
  const focusedSheet = cookbookView
    ? activeSpread &&
      focusedSheetIndex !== null &&
      (activeSpread.left === focusedSheetIndex || activeSpread.right === focusedSheetIndex)
      ? focusedSheetIndex
      : activeSpread
        ? // Default to the LEFT (verso) page — you read a spread left-to-right —
          // EXCEPT an image spread (full-bleed photo on the left) whose editable
          // recipe lives on the right, so focus follows the recipe there.
          activeSpread.left != null && sheets[activeSpread.left]?.layoutKind === "image"
          ? activeSpread.right ?? activeSpread.left
          : activeSpread.left ?? activeSpread.right
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
  const railSelection = useRailSelection({
    sections,
    organizeMode,
    enterOrganizeMode,
    activeSelectableRecipeId,
  });
  const {
    selectedRailIds,
    effectiveRailSelection,
    setRailAnchorId,
    toggleRailSelection,
    selectRailRange,
    clearRailSelection,
    orderedRailSelection,
  } = railSelection;

  // Set when a recipe is moved by a placement change while being edited, so the
  // inline editor keeps it in edit mode as focus follows it to its new page.
  const keepEditingRef = useRef<string | null>(null);
  const { pageEditMode, togglePageEditMode, activeInlineEdit } = useRecipeInlineEditor({
    items,
    setItems,
    activeRecipeId,
    activeRecipeItem,
    resetKey: String(activeNavIndex),
    keepEditingRef,
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
    // If the recipe didn't actually move pages, no navigation reset fires to
    // consume the keep-editing ref, so clear it here to avoid a stale skip.
    if (targetIndex === activeNavIndex) keepEditingRef.current = null;
    goToSlide(targetIndex);
    if (pendingFocusNavId) setPendingFocusNavId(null);
    if (pendingFocusRecipeId === pendingId) setPendingFocusRecipeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocusNavId, pendingFocusRecipeId, navItems, cookbookView, spreads]);
  // Close the rail's Add overflow on an outside click. Escape also clears any
  // organizer selection; normal recipe clicks manage selection themselves.
  useEffect(() => {
    const hasSelection = effectiveRailSelection.size >= 2;
    if (!addMenuOpen && !hasSelection) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (addMenuOpen && !addMenuRef.current?.contains(target)) setAddMenuOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setAddMenuOpen(false);
      clearRailSelection();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [addMenuOpen, effectiveRailSelection.size]);
  // Selection is a cookbook-only, page-scoped concern: drop it whenever we leave
  // cookbook mode or the recipe set changes, so stale ids can't linger.
  useEffect(() => {
    clearRailSelection();
  }, [cookbookMode, items]);
  // ── Shared deck pieces (single-page deck + cookbook two-page-spread deck) ──
  // The floating controls for the active/focused page: side flip, per-recipe
  // layout picker, and the Edit/Done toggle. `navItem` is always the focused
  // item; `previewW` sizes the control bar to the page (or spread) width.

  return (
    <>
      <main
        className={`recipe-print-shell px-cp-6 print:p-0 ${
          previewMeasuring ? "recipe-print-shell--measuring" : ""
        } ${showCookbookOfferDialog || cookbookBuilding ? "recipe-print-shell--entering-cookbook" : ""} ${
          organizeMode ? "recipe-print-shell--organizing" : ""
        } ${organizeWide ? "recipe-print-shell--organize-wide" : ""} ${
          organizeAnimating ? "recipe-print-shell--organize-animating" : ""
        }`}
      >
        <PageRail
          railScrollRef={railScrollRef}
          railDrag={railDrag}
          railSelection={railSelection}
          previewCardSize={previewCardSize}
          cardSize={cardSize}
          previewTemplate={previewTemplate}
          continueOnBack={continueOnBack}
          previewSourceUrlOn={previewSourceUrlOn}
          organizeMode={organizeMode}
          enterOrganizeMode={enterOrganizeMode}
          exitOrganizeMode={exitOrganizeMode}
          projectMeta={projectMeta}
          addCover={addCover}
          cookbookView={cookbookView}
          navItems={navItems}
          navIndexForSheet={navIndexForSheet}
          railRows={railRows}
          sheets={sheets}
          spreads={spreads}
          sections={sections}
          sectionForNavItem={sectionForNavItem}
          sectionAndIndexForItem={sectionAndIndexForItem}
          sectionTitleForId={sectionTitleForId}
          itemIdsForSection={itemIdsForSection}
          renameSectionEverywhere={renameSectionEverywhere}
          requestDeleteSection={requestDeleteSection}
          activeNavIndex={activeNavIndex}
          focusedSheet={focusedSheet}
          focusSheetInSpread={focusSheetInSpread}
          goToSlide={goToSlide}
          railShake={railShake}
          draggingItemId={draggingItemId}
          setDraggingItemId={setDraggingItemId}
          handleDropOnItem={handleDropOnItem}
          handleDropIntoSection={handleDropIntoSection}
          pendingAddAfterRecipeId={pendingAddAfterRecipeId}
          pendingImportItems={pendingImportItems}
          queue={queue}
          setPendingAddSectionId={setPendingAddSectionId}
          setPendingAddIndex={setPendingAddIndex}
          setPendingAddAfterRecipeId={setPendingAddAfterRecipeId}
          setShowAddRecipeDialog={setShowAddRecipeDialog}
          openAddRecipeBelow={openAddRecipeBelow}
          addSectionDivider={addSectionDivider}
          makeSectionFromSelection={makeSectionFromSelection}
          addMenuOpen={addMenuOpen}
          setAddMenuOpen={setAddMenuOpen}
          addMenuRef={addMenuRef}
        />

        {/* Center: large preview of the selected page */}
        <PrintDeck
          singleRecipePrintView={singleRecipePrintView}
          cookbookView={cookbookView}
          previewMeasuring={previewMeasuring}
          previewDims={previewDims}
          spreadWidth={spreadWidth}
          deckExportClass={deckExportClass}
          deckExportStyle={deckExportStyle}
          previewCardSize={previewCardSize}
          previewTemplate={previewTemplate}
          continueOnBack={continueOnBack}
          cardSize={cardSize}
          showCutLines={showCutLines}
          showSourceUrl={showSourceUrl}
          sourceUrlOn={sourceUrlOn}
          sheets={sheets}
          navItems={navItems}
          spreads={spreads}
          sections={sections}
          items={items}
          navIndexForSheet={navIndexForSheet}
          firstNavIndexBySheet={firstNavIndexBySheet}
          activeNavIndex={activeNavIndex}
          activeNavItem={activeNavItem}
          activeRecipeItem={activeRecipeItem}
          focusedSheet={focusedSheet}
          focusSheetInSpread={focusSheetInSpread}
          canvasSide={canvasSide}
          setCanvasSide={setCanvasSide}
          deckScale={deckScale}
          deckRef={deckRef}
          slideRefs={slideRefs}
          goToSlide={goToSlide}
          projectMeta={projectMeta}
          pageEditMode={pageEditMode}
          togglePageEditMode={togglePageEditMode}
          activeInlineEdit={activeInlineEdit}
          editingSectionId={editingSectionId}
          setEditingSectionId={setEditingSectionId}
          editingSectionTitle={editingSectionTitle}
          setEditingSectionTitle={setEditingSectionTitle}
          commitSectionEdit={commitSectionEdit}
          startSectionEdit={startSectionEdit}
          editingCoverSide={editingCoverSide}
          setEditingCoverSide={setEditingCoverSide}
          editingToc={editingToc}
          setEditingToc={setEditingToc}
          coverSideFromNavItem={coverSideFromNavItem}
          coverForSide={coverForSide}
          defaultCover={defaultCover}
          setCoverForSide={setCoverForSide}
          coverPhotoCandidates={coverPhotoCandidates}
          renderPagePhotoControl={renderPagePhotoControl}
          renderSectionPhotoControl={renderSectionPhotoControl}
          buildSectionPhotoEdit={buildSectionPhotoEdit}
          photoModeFor={photoModeFor}
          setRecipePhotoMode={setRecipePhotoMode}
          sizeMenuOpen={sizeMenuOpen}
          setSizeMenuOpen={setSizeMenuOpen}
          settingsMenuOpen={settingsMenuOpen}
          setSettingsMenuOpen={setSettingsMenuOpen}
          renderModeSwitch={renderModeSwitch}
          hasPrintSettingsFields={hasPrintSettingsFields}
          renderPrintSettingsFields={renderPrintSettingsFields}
          handleMobilePrint={handleMobilePrint}
          printBlocked={printBlocked}
          printSpinner={printSpinner}
          cookbookLocked={cookbookLocked}
          templateLocked={templateLocked}
        />

        {/* Right: print setup */}
        {mobileDrawer && (
          <button
            type="button"
            className="recipe-mobile-settings-backdrop no-print"
            aria-label="Close print settings"
            onClick={() => setMobileDrawer(null)}
          />
        )}

        <PrintConfigPanel
          configPanelRef={configPanelRef}
          mobileDrawer={mobileDrawer}
          setMobileDrawer={setMobileDrawer}
          cookbookMode={cookbookMode}
          cookbookLocked={cookbookLocked}
          cardSize={cardSize}
          setCardSize={setCardSize}
          anyRecipeHasImage={anyRecipeHasImage}
          anyRecipeHasSourceUrl={anyRecipeHasSourceUrl}
          bookPhotoStyle={bookPhotoStyle}
          applyBookPhotoStyle={applyBookPhotoStyle}
          showPhoto={showPhoto}
          setShowPhoto={setShowPhoto}
          showSourceUrl={showSourceUrl}
          setShowSourceUrl={setShowSourceUrl}
          bookDesignSettings={renderBookDesignSettings()}
          template={template}
          setTemplate={setTemplate}
          customerInfo={customerInfo}
          hasUnclaimedFreeTemplate={hasUnclaimedFreeTemplate}
          freeTemplateBannerDismissed={freeTemplateBannerDismissed}
          setFreeTemplateBannerDismissed={setFreeTemplateBannerDismissed}
          setToastMessage={setToastMessage}
          handlePrint={handlePrint}
          printBlocked={printBlocked}
          printSpinner={printSpinner}
          templateLocked={templateLocked}
          projectSaveBusy={projectSaveBusy}
          handleSaveProject={handleSaveProject}
          savedProjectId={savedProjectId}
          isRecipePrinterAdmin={isRecipePrinterAdmin}
          canShareActiveRecipe={Boolean(activeRecipeItem?.recipe)}
          setShowShareDialog={setShowShareDialog}
          hasPrintSettingsFields={hasPrintSettingsFields}
          setPrintSettingsOpen={setPrintSettingsOpen}
        />

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
              onClick={() => openAddRecipeBelow()}
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

        <MobileStructureSheet
          projectMeta={projectMeta}
          sections={sections}
          toggleDedication={toggleDedication}
          anyRecipeHasImage={anyRecipeHasImage}
          bookPhotoStyle={bookPhotoStyle}
          applyBookPhotoStyle={applyBookPhotoStyle}
          renameSectionEverywhere={renameSectionEverywhere}
          moveSectionInBook={moveSectionInBook}
          requestDeleteSection={requestDeleteSection}
          navigateToRecipe={navigateToRecipe}
          moveRecipeInBook={moveRecipeInBook}
          addStructureSection={addStructureSection}
          suggestCookbookLayout={suggestCookbookLayout}
          structureSheetOpen={structureSheetOpen}
          setStructureSheetOpen={setStructureSheetOpen}
        />
      </main>
      {showShareDialog && activeRecipeItem?.recipe && cookPilotUser && (
        <AdminShareLinkDialog
          recipe={activeRecipeItem.recipe}
          settings={{ template, cardSize, showPhoto, showSourceUrl, showCutLines, doubleSided }}
          uid={cookPilotUser.uid}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </>
  );
}

export default function PrintPage() {
  useEffect(() => {
    const stableTimer = window.setTimeout(markPrintPreviewStable, PRINT_PREVIEW_STABILITY_MS);
    return () => window.clearTimeout(stableTimer);
  }, []);

  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const accountProjectId = params.get("project");
  const shouldPrint = params.get("print") === "1";
  const activeNavIndexResetRef = useRef<((index: number) => void) | null>(null);
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
  const [organizeMode, setOrganizeMode] = useState(false);
  // `organizeWide` drives the panel width, `organizeMode` the rail's internal
  // grid layout. They toggle together, but entering/leaving runs a FLIP first
  // (see enterOrganizeMode) so the recipe tiles physically slide between their
  // page-list positions and their organizer-grid positions — a rearrange, not
  // a fade. `organizeAnimating` marks that window so the width can snap to its
  // target instantly (the FLIP is what animates), instead of transitioning.
  const [organizeWide, setOrganizeWide] = useState(false);
  const [organizeAnimating, setOrganizeAnimating] = useState(false);
  const organizeTimers = useRef<number[]>([]);
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
  const [pendingAddSectionId, setPendingAddSectionId] = useState<string | null>(null);
  const [pendingAddIndex, setPendingAddIndex] = useState<number | null>(null);
  const [pendingAddAfterRecipeId, setPendingAddAfterRecipeId] = useState<string | null>(null);
  const [projectSaveBusy, setProjectSaveBusy] = useState(false);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  // State drives the UI; the ref is the authoritative identity inside queued
  // async saves, which can run before React commits the state update.
  const savedProjectIdRef = useRef<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AccountSaveStatus | null>(null);
  const [projectLoading, setProjectLoading] = useState(Boolean(accountProjectId));
  const projectRevisionRef = useRef(0);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const lastAttemptedFingerprintRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const latestSaveRef = useRef<() => void>(() => undefined);
  const flushOnHideRef = useRef<() => void>(() => undefined);
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
    sectionPhotoMode: photoStyle === "card" ? "band" : photoStyle,
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

  // Every named section has an opener page, so its divider nav item carries the
  // title and recipe rows never need a synthetic section header.
  const sectionTitleByItemId = useMemo(() => {
    const map = new Map<string, { title?: string; showOpener: boolean }>();
    sections.forEach((section) =>
      section.items.forEach((item) =>
        map.set(item.id, {
          title: section.title,
          showOpener: Boolean(section.title?.trim()),
        }),
      ),
    );
    return map;
  }, [sections]);

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
  // with `navItems.findIndex` was O(n²) on every render of the workspace, which
  // re-renders on each scroll page-crossing as `activeNavIndex` updates (that
  // selection state now lives in `PrintWorkspace`, so it no longer re-renders
  // `PrintPage`).
  const firstNavIndexBySheet = useMemo(() => {
    const map = new Map<number, number>();
    navItems.forEach((navItem, index) => {
      if (!map.has(navItem.sheetIndex)) map.set(navItem.sheetIndex, index);
    });
    return map;
  }, [navItems]);

  const [draggingItemId, setDraggingItemId] = useState<string | null>(null);

  // Precomputed once per `sections` change: recipe item id → its section id,
  // that section's index in `sections`, and the item's index within the
  // section; plus section id → section index. Replaces the per-call linear
  // scans the two lookups below used to do, which ran O(sections × items) for
  // every rail row on every render (i.e. every scroll-driven re-render).
  const sectionLookup = useMemo(() => {
    const byItemId = new Map<string, { sectionId: string; sectionIndex: number; itemIndex: number }>();
    const indexById = new Map<string, number>();
    sections.forEach((section, sectionIndex) => {
      indexById.set(section.id, sectionIndex);
      section.items.forEach((item, itemIndex) => {
        byItemId.set(item.id, { sectionId: section.id, sectionIndex, itemIndex });
      });
    });
    return { byItemId, indexById };
  }, [sections]);

  function sectionAndIndexForItem(itemId: string): { sectionId: string; index: number } | null {
    const hit = sectionLookup.byItemId.get(itemId);
    return hit ? { sectionId: hit.sectionId, index: hit.itemIndex } : null;
  }

  function sectionForNavItem(navItem: NavItem | null): { id: string; index: number } | null {
    if (!navItem) return null;
    if (navItem.kind === "divider") {
      const sectionIndex = sectionLookup.indexById.get(navItem.recipeId);
      return sectionIndex === undefined ? null : { id: navItem.recipeId, index: sectionIndex };
    }
    if (navItem.kind === "recipe") {
      const hit = sectionLookup.byItemId.get(navItem.recipeId);
      return hit ? { id: hit.sectionId, index: hit.sectionIndex } : null;
    }
    return null;
  }


  const itemIdsForSection = useCallback((sectionId: string): string[] => {
    return sections.find((section) => section.id === sectionId)?.items.map((item) => item.id) ?? [];
  }, [sections]);

  // Pointer drag-to-reorder for the cookbook rail: recipes (within/across
  // sections) and whole sections (carrying their recipes). `resolve` measures
  // the live rows and returns where the drop would land + how to commit it.
  const railScrollRef = useRef<HTMLElement | null>(null);
  const resolveRailDrop = (
    kind: RailDragKind,
    id: string,
    clientX: number,
    clientY: number,
  ): RailDropResolved | null => {
    const scroller = railScrollRef.current;
    if (!scroller) return null;
    const midpointIndex = (rects: DOMRect[]) => {
      const i = rects.findIndex((rect) => clientY < rect.top + rect.height / 2);
      return i === -1 ? rects.length : i;
    };
    if (kind === "recipe") {
      const rows = Array.from(scroller.querySelectorAll<HTMLElement>("[data-rail-recipe]")).map(
        (el) => ({ id: el.dataset.railRecipe as string, rect: el.getBoundingClientRect() }),
      );
      if (rows.length === 0) return null;

      // The expanded organizer is a 2D card grid, so resolve against the card
      // nearest the pointer and use its left/right half as before/after. The
      // normal page rail below remains a vertical midpoint list.
      if (organizeMode) {
        const contains = (rect: DOMRect) =>
          clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        const newSection = scroller.querySelector<HTMLElement>("[data-rail-new-section]");
        if (newSection) {
          const rect = newSection.getBoundingClientRect();
          if (contains(rect)) {
            return {
              indicator: { top: rect.top, left: rect.left, width: rect.width },
              commit: () => {
                const sectionId = projectMeta.addSection("New section");
                projectMeta.moveItem(id, sectionId, 0);
                setEditingSectionId(sectionId);
                setEditingSectionTitle("New section");
                setPendingFocusNavId(sectionId);
              },
            };
          }
        }

        const sectionAdd = Array.from(
          scroller.querySelectorAll<HTMLElement>("[data-rail-section-add]"),
        ).find((element) => contains(element.getBoundingClientRect()));
        if (sectionAdd?.dataset.railSectionAdd) {
          const sectionId = sectionAdd.dataset.railSectionAdd;
          const rect = sectionAdd.getBoundingClientRect();
          return {
            indicator: { top: rect.top, left: rect.left, width: rect.width },
            commit: () => projectMeta.moveItem(id, sectionId, itemIdsForSection(sectionId).filter((x) => x !== id).length),
          };
        }

        const candidates = rows.filter((row) => row.id !== id && row.rect.width > 0 && row.rect.height > 0);
        if (candidates.length === 0) return null;
        const distanceTo = (rect: DOMRect) => {
          const dx = Math.max(rect.left - clientX, 0, clientX - rect.right);
          const dy = Math.max(rect.top - clientY, 0, clientY - rect.bottom);
          return dx * dx + dy * dy;
        };
        const target = candidates.reduce((closest, row) =>
          distanceTo(row.rect) < distanceTo(closest.rect) ? row : closest,
        );
        const useHorizontalEdge = clientY >= target.rect.top && clientY <= target.rect.bottom;
        const after = useHorizontalEdge
          ? clientX >= target.rect.left + target.rect.width / 2
          : clientY >= target.rect.top + target.rect.height / 2;
        const indicator = useHorizontalEdge
          ? {
              top: target.rect.top,
              left: after ? target.rect.right + 4 : target.rect.left - 7,
              width: 3,
              height: target.rect.height,
            }
          : {
              top: after ? target.rect.bottom + 4 : target.rect.top - 7,
              left: target.rect.left,
              width: target.rect.width,
              height: 3,
            };
        return {
          indicator,
          commit: () => {
            const location = sectionAndIndexForItem(target.id);
            if (!location) return;
            const ids = itemIdsForSection(location.sectionId).filter((x) => x !== id);
            const targetIndex = ids.indexOf(target.id);
            projectMeta.moveItem(
              id,
              location.sectionId,
              Math.max(0, targetIndex + (after ? 1 : 0)),
            );
          },
        };
      }

      const k = midpointIndex(rows.map((r) => r.rect));
      const before = k < rows.length ? rows[k] : rows[rows.length - 1];
      const indicator = {
        top: (k < rows.length ? before.rect.top : before.rect.bottom) - (k < rows.length ? 5 : -5),
        left: before.rect.left,
        width: before.rect.width,
      };
      const commit = () => {
        if (k < rows.length) {
          const target = sectionAndIndexForItem(rows[k].id);
          if (!target) return;
          const ids = itemIdsForSection(target.sectionId).filter((x) => x !== id);
          const idx = ids.indexOf(rows[k].id);
          projectMeta.moveItem(id, target.sectionId, idx < 0 ? ids.length : idx);
        } else {
          const last = sectionAndIndexForItem(rows[rows.length - 1].id);
          if (!last) return;
          projectMeta.moveItem(id, last.sectionId, itemIdsForSection(last.sectionId).filter((x) => x !== id).length);
        }
      };
      return { indicator, commit };
    }
    const groups = Array.from(scroller.querySelectorAll<HTMLElement>("[data-rail-section]")).map(
      (el) => ({ id: el.dataset.railSection as string, rect: el.getBoundingClientRect() }),
    );
    if (groups.length === 0) return null;
    const k = midpointIndex(groups.map((g) => g.rect));
    const anchor = k < groups.length ? groups[k] : groups[groups.length - 1];
    const indicator = {
      top: (k < groups.length ? anchor.rect.top : anchor.rect.bottom) - (k < groups.length ? 6 : -6),
      left: anchor.rect.left,
      width: anchor.rect.width,
    };
    const targetId = k < groups.length ? groups[k].id : null;
    const commit = () => {
      const metaIds = projectMeta.meta.sections.map((section) => section.id);
      const from = metaIds.indexOf(id);
      if (from === -1) return;
      const without = metaIds.filter((x) => x !== id);
      const at = targetId && without.includes(targetId) ? without.indexOf(targetId) : without.length;
      projectMeta.reorderSections(from, at);
    };
    return { indicator, commit };
  };
  const railDrag = useRailDrag(railScrollRef, resolveRailDrop, (kind) => {
    if (kind === "recipe" && !organizeMode) enterOrganizeMode();
  });

  // Imports started from this page stay in the rail until they either become a
  // real page or the cook removes them. In particular, an error must not vanish
  // merely because it is no longer in the parsing state.
  const pendingImportItems = queue.items.filter(
    (item) => item.status !== "ready" && !initialQueueIdsRef.current.has(item.id),
  );


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


  function addStructureSection() {
    projectMeta.addSection("New section");
  }

  // Bottom-sheet reorder/structure surface for phones — the touch-native
  // replacement for the drag-only desktop rail (hidden on mobile). Rendered
  // only in cookbook mode; the CSS keeps it off desktop entirely.

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

  function renameSectionEverywhere(sectionId: string, value: string) {
    projectMeta.renameSection(sectionId, value || undefined);
    // A section created from the organizer is also the active opener edit.
    // Keep that local textarea value synchronized so it cannot mask the title
    // just written to project metadata when the user returns to the page.
    if (editingSectionId === sectionId) setEditingSectionTitle(value);
  }

  function addSectionDivider() {
    const title = "New section";
    const sectionId = projectMeta.addSection(title);
    setEditingSectionId(sectionId);
    setEditingSectionTitle(title);
    setPendingFocusNavId(sectionId);
    showToast("Section added. Drag recipes beneath it to group them.");
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
    if (projectMeta.restoreCookbook()) return undefined;
    projectMeta.setCookbookMode(true);
    // Open a fresh book on a rotating premium theme so the first view looks
    // designed. A premium theme the cook already chose is respected; anything
    // else (the plain Classic default) rotates to the next premium one.
    const bookTemplate = isPremiumTemplate(template) ? template : nextCookbookTemplate();
    if (bookTemplate !== template) setTemplate(bookTemplate);
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
      projectMeta.setCover({ ...defaultCover(), template: bookTemplate });
    }
    if (!projectMeta.meta.backCover) {
      // A minimal closing page (template band on the theme's paper); the cook
      // can add a blurb / "from the kitchen of" line by editing it.
      projectMeta.setBackCover({ title: "", template: bookTemplate });
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
    return bookTemplate;
  }

  function beginCookbookBuild() {
    setShowCookbookOfferDialog(false);
    setCookbookBuilding(true);
    window.setTimeout(() => {
      const bookTemplate = scaffoldCookbook();
      // Always reveal a new cookbook from its cover, regardless of where the
      // user had scrolled in Recipe Cards.
      activeNavIndexResetRef.current?.(0);
      setPendingFocusNavId("cover-front");
      track("cookbook_workspace_entered", {
        recipeCount: items?.length ?? 0,
        template: bookTemplate ?? template,
      });
    }, 180);
    window.setTimeout(() => setCookbookBuilding(false), 1650);
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
          activeNavIndexResetRef.current?.(0);
          setPendingFocusNavId("cover-front");
        }, 140);
        window.setTimeout(() => setCookbookRestoring(false), 650);
        return;
      }
      scaffoldCookbook();
      return;
    }
    track("cookbook_welcome_shown", { price: cookbookPrice, recipeCount: items?.length ?? 0 });
    setShowCookbookOfferDialog(true);
  }

  // Switching back to recipe cards is non-destructive — the book is tucked into
  // a stash (see `exitCookbook`/`restoreCookbook`) — but still goes through a
  // confirm so a stray click of the Recipe cards ↔ Cookbook switch doesn't
  // yank the cook out of their book.
  function confirmExitCookbook() {
    track("cookbook_exited", { recipeCount: items?.length ?? 0 });
    // A saved cookbook is a durable document, not merely the current editor
    // mode. Recipe cards made from it are a new print project and must never
    // autosave over the book the cook opened. Detach before changing the meta
    // so the autosave effect treats the card version as an unsaved project.
    if (savedProjectIdRef.current) {
      const cardProjectId = createPrintProjectId();
      projectRevisionRef.current = 0;
      savedProjectIdRef.current = null;
      setSavedProjectId(null);
      projectMeta.setProjectId(cardProjectId);
      lastSavedFingerprintRef.current = null;
      lastAttemptedFingerprintRef.current = null;
      setSaveStatus(null);
    }
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


  // What the book-wide "Photos" control shows as active: if every recipe with a
  // photo currently resolves to the SAME mode (whether by the book default or
  // because the cook set them all by hand), reflect that; otherwise fall back to
  // the stored book default. So setting all recipes to "In card" flips the
  // book-wide control to "In card" too.
  // Returns null when recipes use a MIX of photo modes, so the book-wide control
  // shows nothing selected rather than pretending one option applies to all.
  const bookPhotoStyle = useMemo<PhotoStyle | null>(() => {
    const withImage = (items ?? []).filter((item) => item.recipe?.image);
    if (withImage.length === 0) return photoStyle;
    const modes = new Set(withImage.map((item) => photoModeFor(item.id)));
    return modes.size === 1 ? (Array.from(modes)[0] as PhotoStyle) : null;
  }, [items, photoModeFor, photoStyle]);

  // Picking a book-wide Photos option overrides every per-recipe choice: set the
  // default AND clear the individual placement overrides so the whole book snaps
  // to it (custom facing photos / focal points are kept).
  function applyBookPhotoStyle(mode: PhotoStyle) {
    projectMeta.setPhotoStyle(mode);
    projectMeta.clearItemPhotoOverrides();
    // The book-wide choice applies to chapter openers too. Store the chosen
    // placement explicitly so it also replaces any older per-opener override;
    // keep the selected source around when photos are hidden, just as recipe
    // images remain available after choosing None.
    const openerMode: SectionPhotoMode = mode === "card" ? "band" : mode;
    sections.forEach((section) => {
      const seedPhoto = section.photoUrl ?? sectionRecipeImages(section)[0];
      projectMeta.updateSection(section.id, {
        photoMode: openerMode,
        photoUrl: seedPhoto,
        gridImages: openerMode === "full" || openerMode === "band" ? undefined : section.gridImages,
      });
    });
  }


  // The section-opener counterpart to renderPagePhotoControl: the same inline
  // None / In card / Full page switch next to Edit, so an opener's photo
  // placement is one click away on the page (not only inside the picker dialog).
  // A curated collage is a Full-page sub-mode, so it reads as "Full page" active
  // here — the grid itself is still curated from the dialog's "Select multiple".
  const renderSectionPhotoControl = (sectionId: string) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) return null;
    const ownImages = sectionRecipeImages(section);
    // Nothing to place if the section has neither a chosen photo nor any recipe
    // image to seed one from — hide the toggle rather than offer a blank page.
    if (!section.photoUrl && ownImages.length === 0) return null;
    const resolved = resolveSectionPhotoMode(section);
    const active: SectionPhotoMode = resolved === "grid" ? "full" : resolved;
    return (
      <div className="recipe-page-layout-control">
        <div className="recipe-page-layout-picker" role="group" aria-label="Photo">
          {SECTION_PHOTO_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`recipe-page-layout-picker__btn ${active === option.id ? "is-active" : ""}`}
              aria-pressed={active === option.id}
              onClick={(event) => {
                event.stopPropagation();
                if (option.id === "none") {
                  projectMeta.setSectionPhotoMode(sectionId, "none");
                } else {
                  // band / full — seed the photo so the band/page is never blank,
                  // matching buildSectionPhotoEdit's placement change.
                  projectMeta.setSectionPhotoMode(sectionId, option.id, {
                    photoUrl: section.photoUrl ?? ownImages[0],
                  });
                }
              }}
            >
              {option.label}
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
          author: frontMatter.signature,
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
              signature: cover.author || undefined,
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
    projectMeta.setFrontMatter({ kind: "dedication", heading: "Dedication", body: DEFAULT_DEDICATION_BODY });
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

  const requestDeleteSection = useCallback((sectionId: string) => {
    setPendingDelete({
      kind: "section",
      id: sectionId,
      title: sectionTitleForId(sectionId),
      recipeIds: itemIdsForSection(sectionId),
    });
  }, [itemIdsForSection, sectionTitleForId]);

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

  const [mobileDrawer, setMobileDrawer] = useState<"template" | null>(null);

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

  // Organize is now an in-page MODE (the rail expands to a full drag-drop
  // surface, center + right panels collapse), not a modal. Entering it never
  // computes or applies a suggestion — the user's live sections are the truth.
  //
  // Entering/leaving plays a FLIP WHILE the panel expands: the shell's columns
  // animate (CSS transition, so the rail visibly grows to the right), and every
  // frame each recipe tile is re-projected from its old page-list position
  // toward wherever it currently lays out — so the tiles slide and resize into
  // their new grid cells in step with the expansion, a rearrange rather than a
  // fade. Chrome that exists in only one mode (the organizer header, add-recipe
  // cards) fades in behind the moving tiles.
  const ORGANIZE_FLIP_MS = 460;
  // The in-flight FLIP (its rAF id + a finalizer that clears the tiles' inline
  // transforms), so a rapid re-toggle can cancel and clean up before restarting.
  const organizeFlipRef = useRef<{ raf: number; finalize: () => void } | null>(null);

  useEffect(
    () => () => {
      organizeTimers.current.forEach((id) => window.clearTimeout(id));
      organizeFlipRef.current?.finalize();
    },
    [],
  );

  function clearOrganizeTimers() {
    organizeTimers.current.forEach((id) => window.clearTimeout(id));
    organizeTimers.current = [];
  }

  function organizeReducedMotion() {
    return (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function runOrganizeFlip(mutate: () => void) {
    const shell = railScrollRef.current?.closest(".recipe-print-shell") as HTMLElement | null;
    if (!shell || organizeReducedMotion() || typeof document === "undefined") {
      mutate();
      return;
    }
    // Cancel + clean up any FLIP still running before measuring the "before".
    organizeFlipRef.current?.finalize();

    const parseCols = () =>
      window
        .getComputedStyle(shell)
        .gridTemplateColumns.split(" ")
        .map((v) => parseFloat(v));
    // Whether we can drive the 3-column expansion (desktop grid layout only).
    const fromCols = parseCols();
    const canAnimateWidth = fromCols.length === 3 && fromCols.every((v) => !Number.isNaN(v));

    const selector = "[data-organize-flip]";
    const firstRects = new Map<string, DOMRect>();
    shell.querySelectorAll<HTMLElement>(selector).forEach((node) => {
      firstRects.set(node.dataset.organizeFlip!, node.getBoundingClientRect());
    });

    // Apply the layout change (grid vs list, plus the --organize-wide end state).
    flushSync(() => {
      setOrganizeAnimating(true);
      mutate();
    });

    // Read the target column widths, then pin the columns back to their start so
    // the panel can be widened frame by frame instead of snapping. Done with the
    // shell's own transition suppressed so neither read nor pin animates.
    let toCols: number[] = [];
    const prevShellTransition = shell.style.transition;
    if (canAnimateWidth) {
      shell.style.transition = "none";
      shell.style.gridTemplateColumns = "";
      toCols = parseCols();
      shell.style.gridTemplateColumns = fromCols.map((v) => `${v}px`).join(" ");
      // Commit the pinned start width before the first frame paints.
      void shell.offsetWidth;
    }

    const nodes = Array.from(shell.querySelectorAll<HTMLElement>(selector))
      .map((el) => ({ el, prev: firstRects.get(el.dataset.organizeFlip!) }))
      .filter(
        (n): n is { el: HTMLElement; prev: DOMRect } =>
          Boolean(n.prev) && n.prev!.width > 0 && n.prev!.height > 0,
      );

    const widthOk = canAnimateWidth && toCols.length === 3 && toCols.every((v) => !Number.isNaN(v));
    if (nodes.length === 0 && !widthOk) {
      shell.style.gridTemplateColumns = "";
      shell.style.transition = prevShellTransition;
      setOrganizeAnimating(false);
      return;
    }

    // Suppress the tiles' own transform transition so our per-frame writes land
    // immediately instead of lagging behind.
    nodes.forEach((n) => {
      n.el.style.transition = "none";
    });

    const finalize = () => {
      if (organizeFlipRef.current) window.cancelAnimationFrame(organizeFlipRef.current.raf);
      // Hand the columns back to CSS (the --organize-wide / base class value).
      shell.style.gridTemplateColumns = "";
      shell.style.transition = prevShellTransition;
      nodes.forEach((n) => {
        n.el.style.transform = "";
        n.el.style.transformOrigin = "";
        n.el.style.transition = "";
      });
      organizeFlipRef.current = null;
      setOrganizeAnimating(false);
    };

    // Cubic-out easing shared by the width expansion and the tile FLIP.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);
    const start = performance.now();

    const frame = (nowTs: number) => {
      const t = Math.min(1, (nowTs - start) / ORGANIZE_FLIP_MS);
      const e = ease(t);
      // Widen (or narrow) the panel columns for this frame.
      if (widthOk) {
        shell.style.gridTemplateColumns = fromCols
          .map((from, i) => `${from + (toCols[i] - from) * e}px`)
          .join(" ");
      }
      // Clear transforms first so getBoundingClientRect reads each tile's true
      // laid-out position at the current (this-frame) width.
      nodes.forEach((n) => {
        n.el.style.transform = "";
      });
      const nowRects = nodes.map((n) => n.el.getBoundingClientRect());
      nodes.forEach((n, i) => {
        const now = nowRects[i];
        if (now.width === 0 || now.height === 0) return;
        // Rendered = lerp(old, live, e): exactly the old spot at t=0, the final
        // cell at t=1, tracking the expanding layout in between.
        const tx = (1 - e) * (n.prev.left - now.left);
        const ty = (1 - e) * (n.prev.top - now.top);
        const sx = e + (1 - e) * (n.prev.width / now.width);
        const sy = e + (1 - e) * (n.prev.height / now.height);
        n.el.style.transformOrigin = "top left";
        n.el.style.transform = `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})`;
      });
      if (t < 1) {
        organizeFlipRef.current = { raf: window.requestAnimationFrame(frame), finalize };
      } else {
        finalize();
      }
    };

    organizeFlipRef.current = { raf: window.requestAnimationFrame(frame), finalize };
  }

  function enterOrganizeMode() {
    if (organizeMode) return;
    track("relayout_started", {});
    clearOrganizeTimers();
    runOrganizeFlip(() => {
      setOrganizeMode(true);
      setOrganizeWide(true);
    });
  }

  function exitOrganizeMode() {
    clearOrganizeTimers();
    runOrganizeFlip(() => {
      setOrganizeMode(false);
      setOrganizeWide(false);
    });
  }

  // The ONE place the recommended structure is applied — an explicit opt-in,
  // snapshotting the current sections so the single Undo can restore them.
  function suggestCookbookLayout() {
    setOrganizationUndo(structuredClone(projectMeta.meta.sections));
    const next = organizationSectionsForApply(
      suggestCookbookOrganization(items ?? []),
      (items ?? []).filter((item) => item.recipe).map((item) => item.id),
    );
    projectMeta.setSectionStructure(next);
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
      // projectMeta owns the working copy's identity. It can intentionally
      // differ from the URL after a saved cookbook is converted to cards.
      id: savedProjectIdRef.current ?? cookbookProjectId ?? accountProjectId,
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
      const saved = savedProjectIdRef.current
        ? await savePrintProject(project)
        : await adoptAnonymousProject(cookPilotUser.uid, project);
      projectRevisionRef.current = Number(saved.revision ?? 0);
      savedProjectIdRef.current = saved.id;
      setSavedProjectId(saved.id);
      if (saved.id !== projectMeta.meta.projectId) {
        projectMeta.setProjectId(saved.id);
      }
      lastSavedFingerprintRef.current = printProjectFingerprint(
        items,
        { ...projectMeta.meta, projectId: saved.id },
        cardSize,
        template,
        doubleSided,
        showPhoto,
        showSourceUrl,
        showCutLines,
      );
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
        window.setTimeout(() => latestSaveRef.current(), 0);
      }
    }
  }

  // A save queued during an in-flight request must serialize the newest render,
  // not the render whose request just completed.
  latestSaveRef.current = () => void handleSaveProject();

  // Best-effort push to Firestore when the tab is being hidden/closed, so a
  // signed-in edit still inside the 1.5s autosave debounce isn't left only in
  // the local recovery mirror until the next visit. The durable localStorage
  // mirror (lib/queue, lib/project) is the real safety net; this just narrows
  // the window where the *cloud* copy is a beat behind. Reassigned each render
  // (mirroring latestSaveRef) so it closes over the current book. It must never
  // trigger the sign-in modal on the way out, and must not save when nothing
  // changed — otherwise every tab close would write and could bump the revision
  // other tabs are editing against.
  flushOnHideRef.current = () => {
    if (!cookPilotUser) return;
    if (!(cookbookMode || savedProjectIdRef.current)) return;
    if (!items || items.length === 0) return;
    if (saveInFlightRef.current || saveQueuedRef.current) return;
    if (lastSavedFingerprintRef.current === "__loaded__") return;
    const fp = printProjectFingerprint(
      items,
      projectMeta.meta,
      cardSize,
      template,
      doubleSided,
      showPhoto,
      showSourceUrl,
      showCutLines,
    );
    if (fp === lastSavedFingerprintRef.current) return;
    void handleSaveProject();
  };

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
    savedProjectIdRef.current = null;
    setSavedProjectId(null);
    projectMeta.setProjectId(copyId);
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
    purchaseBusy,
    claimBusy,
    freeTemplateBannerDismissed,
    setFreeTemplateBannerDismissed,
    selectedPremiumTemplate,
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
    },
  });

  const {
    cookbookPrice,
    cookbookLocked,
    cookbookAccessStatus,
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
    // Cookbook protection is handled by the persistent banner in cookbook
    // mode. Do not interrupt a newly purchased book with a login modal.
    onFreshPurchase: () => undefined,
  });

  // Every theme is included with the cookbook purchase, so the per-template
  // paywall is suppressed while in cookbook mode — the cookbook unlock is the
  // only gate there. Switching back to recipe cards restores normal gating.
  const templateLocked = selectedTemplateLocked && !projectMeta.meta.cookbookMode;



  async function handlePrint() {
    if (purchaseBusy || claimBusy || cookbookPurchaseBusy) return;
    if (!printLayoutReady) {
      // Remember it and let the effect below fire once the layout settles,
      // instead of turning them away — the button shows a spinner meanwhile.
      setPrintPending(true);
      return;
    }
    setPrintPending(false);
    const gate = purchaseGate({
      // Consult the freshly-written unlock marker, not just the React-state
      // `cookbookLocked`: the purchase continuation below re-runs handlePrint
      // synchronously, before the `projectUnlocked` state has re-rendered, so
      // the closed-over `cookbookLocked` is still true. Without this second
      // check the re-run would re-enter the purchase and recurse forever.
      cookbookLocked: cookbookLocked && !isCookbookProjectUnlocked(cookbookProjectId),
      templateLocked: Boolean(selectedPremiumTemplate && templateLocked),
    });
    if (gate === "unlock-cookbook") {
      // No interstitial paywall dialog — a click on Export goes straight to
      // checkout, which states the price and collects the email itself (same
      // shape as the premium-template branch below). A completed purchase
      // re-runs handlePrint, which now clears the gate and exports. Signed-out
      // buying is intentionally allowed; the unlock is backed up to Firestore
      // as soon as the buyer has an account (at purchase if signed in, else on
      // the adopt-on-sign-in path).
      void purchaseCookbookAndContinue((freshPurchase) => {
        if (freshPurchase) setCookbookJustPurchased(true);
        void handlePrint();
      });
      return;
    }
    if (gate === "unlock-template" && selectedPremiumTemplate) {
      // No interstitial paywall dialog anymore — the price is stated inline under
      // Themes, and the button already reads "Unlock & Print", so a click goes
      // straight to the purchase (or a silent free claim for eligible CookPilot
      // members, so they're never charged). Both paths print on success.
      if (canClaimSelectedTemplateFree) {
        void claimTemplateAndPrint(selectedPremiumTemplate);
      } else {
        void unlockTemplateAndPrint(selectedPremiumTemplate);
      }
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
  const printBlocked = purchaseBusy || claimBusy || cookbookPurchaseBusy;
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
            photoMode: section.photoMode,
            gridImages: section.gridImages,
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
        savedProjectIdRef.current = project.id;
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

  useEffect(() => {
    if (projectLoading || !items?.length) return;
    // Plain recipe cards with no saved project: nothing to save or adopt, so
    // clear any leftover status (e.g. an "adoption" prompt carried over from a
    // cookbook the cook just switched away from).
    if (!cookbookMode && !savedProjectId) {
      if (saveStatus) setSaveStatus(null);
      return;
    }
    // Lazily computed — the fingerprint is a JSON.stringify of the whole book, so
    // it's produced only where actually needed (the load baseline below, and once
    // per debounce settle inside the timer), never eagerly on every keystroke.
    const fingerprint = () =>
      printProjectFingerprint(
        items,
        projectMeta.meta,
        cardSize,
        template,
        doubleSided,
        showPhoto,
        showSourceUrl,
        showCutLines,
      );
    if (lastSavedFingerprintRef.current === "__loaded__") {
      lastSavedFingerprintRef.current = fingerprint();
      return;
    }
    if (!cookPilotUser) {
      setSaveStatus("adoption");
      return;
    }
    if (saveStatus === "conflict") return;
    // Debounce the whole change: only when edits settle for 1.5s do we compute the
    // fingerprint and decide whether to save. The change-detection and retry guard
    // therefore run inside the timer, against that single settled fingerprint.
    const timer = window.setTimeout(() => {
      const fp = fingerprint();
      if (fp === lastSavedFingerprintRef.current) return;
      // Only autosave once per genuine content change. Without this, a failed save
      // (e.g. a permissions error) never advances lastSavedFingerprintRef, so every
      // saveStatus flip re-fires this effect and re-schedules the identical save —
      // an unbounded retry storm. Manual retry and the reconnect handler still call
      // handleSaveProject directly, so real retries keep working.
      if (fp === lastAttemptedFingerprintRef.current) return;
      lastAttemptedFingerprintRef.current = fp;
      void handleSaveProject();
    }, 1500);
    return () => window.clearTimeout(timer);
    // handleSaveProject intentionally reads the latest render state after the debounce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    items,
    projectMeta.meta,
    cardSize,
    template,
    doubleSided,
    showPhoto,
    showSourceUrl,
    showCutLines,
    projectLoading,
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

  // Flush a pending save when the tab goes away. `pagehide` is the reliable
  // teardown signal (fires on close/navigation, and on mobile bfcache freeze);
  // `visibilitychange` → hidden covers backgrounding the tab/app, which on
  // mobile is often the last callback before the page is discarded. Registered
  // once — the work is delegated to flushOnHideRef, which always holds the
  // current book.
  useEffect(() => {
    const flush = () => flushOnHideRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

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
      const insertAt = pendingAddIndex ?? itemIdsForSection(pendingAddSectionId).length;
      newlyReady.forEach((item, offset) => {
        moveProjectItem(item.id, pendingAddSectionId, insertAt + offset);
      });
    }
    setPendingFocusRecipeId((current) => current ?? newlyReady[0]!.id);
  }, [queue.items, items, itemIdsForSection, moveProjectItem, pendingAddIndex, pendingAddSectionId, sections]);

  // Bring the pending status into view as soon as the dialog hands the import
  // to the queue. This also works for retries because the same row changes back
  // from error to parsing in place.
  useEffect(() => {
    if (pendingImportItems.length === 0) return;
    const frame = window.requestAnimationFrame(() => {
      railScrollRef.current
        ?.querySelector<HTMLElement>("[data-pending-import]")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pendingImportItems.length]);

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
          <Checkbox
              label="Cut lines"
              checked={showCutLines}
              onChange={(event) => setShowCutLines(event.target.checked)}
          />
        )}
        {/* Two-sided is a plain-card concept only: a bound cookbook flows
            overflow onto the next page, not the back of a leaf (see
            `continueOnBack`), so the toggle would do nothing there. */}
        {hasRecipeBackSide && !projectMeta.meta.cookbookMode && (
          <Checkbox
              label="Two-sided"
              hint="Longer recipes continue onto the back."
              checked={doubleSided}
              onChange={(event) => setDoubleSided(event.target.checked)}
          />
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
      <CheckboxGroup label="Include" className="recipe-config-section recipe-config-section--settings">
        <Checkbox
            label="Table of contents"
            checked={Boolean(projectMeta.meta.tableOfContents)}
            onChange={(event) => projectMeta.setTableOfContents(event.target.checked)}
        />
        <Checkbox
            label="Opening page"
            checked={Boolean(projectMeta.meta.frontMatter || projectMeta.meta.dedication)}
            onChange={toggleDedication}
        />
        {anyRecipeHasSourceUrl && (
          <Checkbox
              label="Recipe link"
              checked={showSourceUrl}
              onChange={(event) => setShowSourceUrl(event.target.checked)}
          />
        )}
      </CheckboxGroup>
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
    setShowCookPilotLogin(false);
  }, [cookPilotUser, revenueCatUserId]);

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
      const postPrintAction = postPrintActionRef.current;
      postPrintActionRef.current = "donate";
      const prompt = postPrintPrompt(postPrintAction, !shouldShowPostPrintDialog());
      // Only a fresh premium-template purchase can open the protection dialog
      // automatically. Cookbook purchases use the persistent in-page banner,
      // which is visible without interrupting the editing/export flow.
      if (prompt === "protect-purchase" && !cookbookMode) {
        setCookPilotLoginReason("purchase");
        window.setTimeout(() => setShowCookPilotLogin(true), 150);
        return;
      }
      // The cookbook's own post-export screen replaces the donate/feedback nudge
      // (afterprint fires whether the user saved, printed, or cancelled, so it
      // can't stand in for "you exported a cookbook"). Only plain-card prints
      // get that nudge.
      if (cookbookMode) return;
      if (!prompt) return;
      markPostPrintDialogShown();
      window.setTimeout(() => setShowDonateDialog(true), 150);
    }

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
    // template/cardSize/cookbook state are read inside the handler, so the
    // listener has to be re-registered when they change or it would report a
    // stale configuration.
  }, [template, cardSize, cookbookMode, activePreset.id]);

  if (items === null || projectLoading || cookbookAccessStatus === "loading") {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader compact sticky />
        <RecipeLoadingState
          className="flex-1"
          label={accountProjectId ? "Loading your project…" : "Preparing…"}
        />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader compact sticky />
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
      {/* Header + the back-up bar share one grid row so the bar pushes the
          editor down instead of stealing the deck's `1fr` row (which left it
          floating mid-page). `.recipe-print-page` is a two-row grid — keep it
          to two children. */}
      <div className="recipe-print-topbar">
        <SiteHeader
          compact
          sticky
          centerActions
          actions={renderModeSwitch()}
          saveStatus={saveStatus}
          onRetrySave={handleRetrySave}
        />

        {/* One-line "back up your cookbook" bar under the toolbar, shown to a
            signed-out owner. Not dismissable on purpose: an un-backed-up purchase
            lives only in this browser, so it stays until they make an account. */}
        {projectMeta.meta.cookbookMode && !cookbookLocked && !cookPilotUser && (
          <div className="recipe-protect-bar no-print" role="status">
            <span className="recipe-protect-bar__text">
              Your cookbook is saved only on this device. Create a free account so you don&apos;t lose it.
            </span>
            <button
              type="button"
              className="btn btn-primary btn-compact"
              onClick={() => {
                track("protect_prompt_clicked", { source: "cookbook_banner" });
                setCookPilotLoginReason("purchase");
                setShowCookPilotLogin(true);
              }}
            >
              Create free account
            </button>
          </div>
        )}
      </div>

      {/* Print preview / printed content */}
      <PrintWorkspace
        activeNavIndexResetRef={activeNavIndexResetRef}
        doubleSided={doubleSided}
        setItems={setItems}
        addCover={addCover}
        addMenuOpen={addMenuOpen}
        addMenuRef={addMenuRef}
        addSectionDivider={addSectionDivider}
        addStructureSection={addStructureSection}
        anyRecipeHasImage={anyRecipeHasImage}
        anyRecipeHasSourceUrl={anyRecipeHasSourceUrl}
        applyBookPhotoStyle={applyBookPhotoStyle}
        bookPhotoStyle={bookPhotoStyle}
        cardSize={cardSize}
        commitSectionEdit={commitSectionEdit}
        continueOnBack={continueOnBack}
        cookPilotUser={cookPilotUser}
        cookbookBuilding={cookbookBuilding}
        cookbookLocked={cookbookLocked}
        cookbookMode={cookbookMode}
        coverForSide={coverForSide}
        coverPhotoCandidates={coverPhotoCandidates}
        coverSideFromNavItem={coverSideFromNavItem}
        customerInfo={customerInfo}
        defaultCover={defaultCover}
        draggingItemId={draggingItemId}
        editingCoverSide={editingCoverSide}
        editingSectionId={editingSectionId}
        editingSectionTitle={editingSectionTitle}
        editingToc={editingToc}
        enterOrganizeMode={enterOrganizeMode}
        exitOrganizeMode={exitOrganizeMode}
        exportPreset={exportPreset}
        firstNavIndexBySheet={firstNavIndexBySheet}
        freeTemplateBannerDismissed={freeTemplateBannerDismissed}
        handleDropIntoSection={handleDropIntoSection}
        handleDropOnItem={handleDropOnItem}
        handleMobilePrint={handleMobilePrint}
        handlePrint={handlePrint}
        handleSaveProject={handleSaveProject}
        hasPrintSettingsFields={hasPrintSettingsFields}
        hasRecipeBackSide={hasRecipeBackSide}
        hasUnclaimedFreeTemplate={hasUnclaimedFreeTemplate}
        isRecipePrinterAdmin={isRecipePrinterAdmin}
        itemIdsForSection={itemIdsForSection}
        items={items}
        mobileDrawer={mobileDrawer}
        moveProjectItem={moveProjectItem}
        moveRecipeInBook={moveRecipeInBook}
        moveSectionInBook={moveSectionInBook}
        navItems={navItems}
        organizeAnimating={organizeAnimating}
        organizeMode={organizeMode}
        organizeWide={organizeWide}
        pendingAddAfterRecipeId={pendingAddAfterRecipeId}
        pendingDelete={pendingDelete}
        pendingFocusNavId={pendingFocusNavId}
        pendingFocusRecipeId={pendingFocusRecipeId}
        pendingImportItems={pendingImportItems}
        photoModeFor={photoModeFor}
        photoStyle={photoStyle}
        previewCardSize={previewCardSize}
        previewMeasuring={previewMeasuring}
        previewSourceUrlOn={previewSourceUrlOn}
        previewTemplate={previewTemplate}
        printBlocked={printBlocked}
        printSettingsOpen={printSettingsOpen}
        printSpinner={printSpinner}
        projectMeta={projectMeta}
        projectSaveBusy={projectSaveBusy}
        queue={queue}
        railDrag={railDrag}
        railRows={railRows}
        railScrollRef={railScrollRef}
        railShake={railShake}
        renameSectionEverywhere={renameSectionEverywhere}
        renderBookDesignSettings={renderBookDesignSettings}
        renderModeSwitch={renderModeSwitch}
        renderPrintSettingsFields={renderPrintSettingsFields}
        renderSectionPhotoControl={renderSectionPhotoControl}
        requestDeleteNavItem={requestDeleteNavItem}
        requestDeleteSection={requestDeleteSection}
        savedProjectId={savedProjectId}
        sectionAndIndexForItem={sectionAndIndexForItem}
        sectionForNavItem={sectionForNavItem}
        sectionTitleForId={sectionTitleForId}
        sections={sections}
        setAddMenuOpen={setAddMenuOpen}
        setCardSize={setCardSize}
        setCoverForSide={setCoverForSide}
        setDraggingItemId={setDraggingItemId}
        setEditingCoverSide={setEditingCoverSide}
        setEditingSectionId={setEditingSectionId}
        setEditingSectionTitle={setEditingSectionTitle}
        setEditingToc={setEditingToc}
        setFreeTemplateBannerDismissed={setFreeTemplateBannerDismissed}
        setMobileDrawer={setMobileDrawer}
        setPendingAddAfterRecipeId={setPendingAddAfterRecipeId}
        setPendingAddIndex={setPendingAddIndex}
        setPendingAddSectionId={setPendingAddSectionId}
        setPendingFocusNavId={setPendingFocusNavId}
        setPendingFocusRecipeId={setPendingFocusRecipeId}
        setPrintSettingsOpen={setPrintSettingsOpen}
        setShowAddRecipeDialog={setShowAddRecipeDialog}
        setShowPhoto={setShowPhoto}
        setShowShareDialog={setShowShareDialog}
        setShowSourceUrl={setShowSourceUrl}
        setTemplate={setTemplate}
        setToastMessage={setToastMessage}
        sheets={sheets}
        showAddRecipeDialog={showAddRecipeDialog}
        showCookPilotLogin={showCookPilotLogin}
        showCookbookOfferDialog={showCookbookOfferDialog}
        showCutLines={showCutLines}
        showDonateDialog={showDonateDialog}
        showFeedbackDialog={showFeedbackDialog}
        showPhoto={showPhoto}
        showShareDialog={showShareDialog}
        showSourceUrl={showSourceUrl}
        sourceUrlOn={sourceUrlOn}
        spreads={spreads}
        startSectionEdit={startSectionEdit}
        suggestCookbookLayout={suggestCookbookLayout}
        template={template}
        templateLocked={templateLocked}
        toggleDedication={toggleDedication}
      />

      <PrintDialogs
        showDonateDialog={showDonateDialog}
        onCloseDonateDialog={() => setShowDonateDialog(false)}
        onOpenFeedbackDialog={() => setShowFeedbackDialog(true)}
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
          track("cookbook_onboarding_dismissed", { price: cookbookPrice });
          setShowCookbookOfferDialog(false);
        }}
        onStart={() => {
          beginCookbookBuild();
        }}
      />
      <CookbookBuildReveal open={cookbookBuilding} images={coverPhotoCandidates} />
      {cookbookRestoring && (
        <div className="cookbook-restore-overlay no-print" role="status" aria-live="polite">
          <SpinnerIcon size={30} />
          <span>Loading your cookbook…</span>
        </div>
      )}
      <CookbookReadyDialog
        open={showCookbookPrintDialog}
        justPurchased={cookbookJustPurchased}
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
