"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import { SAVE_FAILURES, SAVE_STATUS_LABEL } from "@/components/AccountControl";
import { ProjectHeading } from "@/components/print/ProjectHeading";
import { fileProjectLocally } from "@/lib/localProjects";
import type { AccountSaveStatus } from "@/components/AccountControl";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { PrintDialogs } from "@/components/PrintDialogs";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";
import { uid } from "@/lib/ids";
import { sectionOrderChanged, sortSectionsByTitle } from "@/lib/sectionSort";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CookbookBuildReveal, CookbookWelcomeDialog } from "@/components/CookbookWelcomeDialog";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import {
  CookbookPdfError,
  cookbookPdfFileName,
  downloadCookbookPdf,
} from "@/lib/cookbookPdfExport";
import type { CoverSheetSpec } from "@/types/export";
import { ImagePicker } from "@/components/ImagePicker";
import { Dialog } from "@/components/Dialog";
import { Checkbox, CheckboxGroup } from "@/components/Controls";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { useModalFocus } from "@/components/useModalFocus";
import {
  PRINT_CARD_SIZE_OPTIONS,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { PHOTO_STYLE_OPTIONS } from "@/components/print/photoStyle";
import { MobileStructureSheet } from "@/components/print/MobileStructureSheet";
import { PrintConfigPanel } from "@/components/print/PrintConfigPanel";
import { PageRail, type RailSortMode } from "@/components/print/PageRail";
import { PrintDeck, pendingSlotIndexIn } from "@/components/print/PrintDeck";
import {
  usePrintSheets,
  type NavItem,
} from "@/lib/usePrintSheets";
import {
  buildSections,
  namedSectionCount,
  projectDisplayTitle,
  defaultSectionGridImages,
  resolveSectionPhotoMode,
  useProjectMeta,
  type ProjectMeta,
  type PhotoStyle,
} from "@/lib/project";
import { materializeProjectPhotos } from "@/lib/photoStorage";
import {
  claimPrintRearm,
  clearPrintRetryMarker,
  markPrintSpent,
  preferFreshDocumentForPrint,
  printAgainHref,
} from "@/lib/printRearm";
import {
  createPrintProjectId,
  savePrintProject,
  assemblePrintProject,
  projectContentFromMeta,
  type PrintLayoutSettings,
  loadPrintProject,
  loadPrintProjectHead,
  PrintProjectConflictError,
} from "@/lib/printProjects";
import { adoptAnonymousProject, readAdoptionManifest } from "@/lib/anonymousProjectAdoption";
import { loadLocalProject } from "@/lib/localProjects";
import { printDocumentTitle } from "@/lib/printDocumentTitle";
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
  presetCardDims,
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
  ChevronLeftIcon,
  ChevronRightIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
  PlusIcon,
  PrintIcon,
  SaveIcon,
  SizeIcon,
  SpinnerIcon,
  TemplateIcon,
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
  useQueue,
} from "@/lib/queue";
import {
  isPrintCardSize,
  isRecipePrintTemplate,
  usePrintSettingsPersistence,
} from "@/lib/printSettings";
import { openingPageFor } from "@/lib/frontMatterPage";
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
import { hasPendingImport, takePendingImport } from "@/lib/pendingImport";
import { nextPaint } from "@/lib/nextPaint";

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
/**
 * How many recipes before the workspace suggests binding them.
 *
 * Three, because that is the point where a stack of cards starts to look like
 * a collection. Below it the suggestion is a pitch at someone who has printed
 * one thing; at or above it, it names something they have already half done.
 */

const COOKBOOK_TEMPLATE_ROTATION_KEY = "recipeprinter:cookbook-template-rotation";

// A ready-made dedication seeded when the page is turned on — real, editable
// content (not a hidden placeholder), so a cook who likes it can just keep it
// and it prints as-is.
const DEFAULT_DEDICATION_BODY = "For the ones who taught us to cook, and who made every table feel like home.";
function nextCookbookTemplate(): RecipePrintTemplate {
  // Through `localStore` rather than `window.localStorage`: the read here was
  // bare, and reading storage THROWS (it does not return null) in Safari
  // private mode and anywhere site data is blocked — which would have taken
  // the whole new-cookbook path down over a cosmetic default. A rotation that
  // never persists just means everyone starts at the same theme.
  if (typeof window === "undefined") return COOKBOOK_TEMPLATE_ROTATION[0];
  const prev = Number(localStore.get(COOKBOOK_TEMPLATE_ROTATION_KEY));
  const next = ((Number.isFinite(prev) ? prev : -1) + 1) % COOKBOOK_TEMPLATE_ROTATION.length;
  localStore.set(COOKBOOK_TEMPLATE_ROTATION_KEY, String(next));
  return COOKBOOK_TEMPLATE_ROTATION[next];
}

// A short, generic recipe used only to fill each theme's picker preview. Kept
// intentionally small so it lays out as a clean single front face at 6x4.
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
  showDescription: boolean,
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
    showDescription,
  });
}


/** How far the deck's zoom can travel either side of fit-to-window. */
const DECK_ZOOM_MIN = 0.5;
const DECK_ZOOM_MAX = 2;
/** The same bounds, as the object the pinch gesture wants. */
const DECK_ZOOM_BOUNDS = { min: DECK_ZOOM_MIN, max: DECK_ZOOM_MAX };

/**
 * How long to wait for the browser to admit it is printing.
 *
 * `beforeprint` is synchronous and fires before `window.print()` even returns,
 * so this is not a race — it is slack for a phone that is busy laying out the
 * deck. Long enough that a working print is never mistaken for a refused one;
 * short enough that a refused one doesn't sit there looking like a dead button.
 */
const PRINT_ACCEPTANCE_GRACE_MS = 1_200;

export default function PrintPage() {
  useEffect(() => {
    const stableTimer = window.setTimeout(markPrintPreviewStable, PRINT_PREVIEW_STABILITY_MS);
    return () => window.clearTimeout(stableTimer);
  }, []);

  /**
   * Arrive on a document that can still print.
   *
   * A phone browser gives a document one print and silently refuses the rest
   * (see lib/printRearm), and coming back to `/print` for a second recipe is a
   * client-side route change, so the same spent document is what meets the next
   * tap. Spend the reload here instead, while the page is arriving and there is
   * nothing on screen yet to lose — the queue, the project meta and the pending
   * save all flush on `pagehide`, so a reload costs the load and nothing else.
   *
   * Only where the refusal happens: `preferFreshDocumentForPrint` is false on
   * desktop, which prints the same document as often as you ask it to.
   */
  useEffect(() => {
    if (preferFreshDocumentForPrint()) window.location.reload();
  }, []);

  const router = useRouter();
  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const accountProjectId = params.get("project");
  const shouldPrint = params.get("print") === "1";
  const activeNavIndexResetRef = useRef<((index: number) => void) | null>(null);
  // The print job is an ordered list of member ids — NOT a second copy of the
  // recipes. `items` (below) projects these ids onto the live queue content, so
  // the queue is the sole content owner. `null` until the job hydrates, which
  // keeps the loading (`null`) vs empty (`[]`) vs populated distinction.
  const [jobIds, setJobIds] = useState<string[] | null>(null);
  const [cardSize, setCardSize] = useState<PrintCardSize>(() =>
    initialPrintCardSize(params.get("size")),
  );
  const [template, setTemplate] = useState<RecipePrintTemplate>(() =>
    initialRecipePrintTemplate(params.get("template")),
  );
  const [doubleSided, setDoubleSided] = useState(true);
  const [showCutLines, setShowCutLines] = useState(false);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  /* On by default: a recipe that came in with a photo should print with it
     until someone says otherwise. Off meant the common case — import, print —
     dropped the picture silently, and the only clue was a checkbox two panels
     away. A stored preference still wins on the next visit. */
  const [showPhoto, setShowPhoto] = useState(true);
  const [showSourceUrl, setShowSourceUrl] = useState(false);
  /** Whether the WEBSITE's blurb is included in each recipe's note. The cook's
      own words are never affected — see lib/recipeNote.ts. Defaults on, which
      is how books saved before this already read. */
  const [showDescription, setShowDescription] = useState(true);
  const [showDonateDialog, setShowDonateDialog] = useState(false);
  const [showCookbookOfferDialog, setShowCookbookOfferDialog] = useState(false);
  const [cookbookBuilding, setCookbookBuilding] = useState(false);
  // Re-entering an already-built book: a plain loading spinner (not the first-run
  // build animation) while the stashed layout swaps back in.
  const [showCookbookPrintDialog, setShowCookbookPrintDialog] = useState(false);
  // True only when the cookbook print dialog was reached via a fresh purchase
  // (not a re-export), so it can lead with a one-time "your cookbook is ready"
  // celebration instead of the plain "print your cookbook" framing.
  const [cookbookJustPurchased, setCookbookJustPurchased] = useState(false);
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
  /**
   * Puts back the lines a drag deleted in one go.
   *
   * A bulk delete is the one edit on this page that can take a whole section
   * out at once, and it does not stop to ask — so the way back is on the toast
   * that reports it, held until that toast goes.
   */
  const [lineDeleteUndo, setLineDeleteUndo] = useState<(() => void) | null>(null);
  // The organizer's "Sort by". `custom` is whatever order the cook has built by
  // hand; `title` is A–Z within every section. `customOrderUndo` holds the
  // arrangement A–Z replaced, so switching back restores it rather than leaving
  // the book alphabetized forever.
  const [customOrderUndo, setCustomOrderUndo] = useState<ProjectMeta["sections"] | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "recipe"; id: string; title: string }
    | { kind: "section"; id: string; title: string; recipeIds: string[] }
    | { kind: "cover"; side: "front" | "back" | "dedication"; title: string }
    | null
  >(null);
  const [pendingFocusRecipeId, setPendingFocusRecipeId] = useState<string | null>(null);
  /**
   * Recipes that have just this moment finished parsing.
   *
   * The placeholder and the page it becomes are two different elements in two
   * different trees, so one cannot literally morph into the other without a
   * view transition. What they DO share is the slot: the page arrives exactly
   * where the spinner was. Marking it for a beat lets it settle into that slot
   * instead of appearing already there, which is what reads as the tile
   * resolving rather than being swapped out underneath you.
   */
  const [settlingIds, setSettlingIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingFocusNavId, setPendingFocusNavId] = useState<string | null>(null);
  // The recipe whose rail row is currently shaking, set when a re-imported
  // duplicate points back at a recipe already in this deck. `nonce` lets the
  // same recipe re-shake on a repeat import (a bare id wouldn't change).
  const [railShake, setRailShake] = useState<{ recipeId: string; nonce: number } | null>(null);
  const queue = useQueue();
  const projectMeta = useProjectMeta();
  /**
   * Recipe order within each section, read off the BOOK rather than held here.
   *
   * It used to be component state, so reopening a cookbook came back as
   * "Custom order" however it had been left — and because the recipes were
   * still sorted from last time it looked right, right up until the next
   * recipe was added and landed at the end. A standing instruction that keeps
   * sorting has to be part of the book it sorts.
   */
  const railSortMode: RailSortMode = projectMeta.meta.railSortMode ?? "custom";
  // The print job as live recipes: project each member id onto the queue's
  // content. An edit in the queue (the content owner) flows straight to the
  // deck here — there is no second copy to keep in step. Non-ready/absent ids
  // are dropped, matching what the job could ever render. `null` mirrors
  // `jobIds === null` so the loading guard below still reads `items === null`.
  const items = useMemo<QueueItem[] | null>(() => {
    if (jobIds === null) return null;
    const byId = new Map(queue.items.map((it) => [it.id, it] as const));
    return jobIds
      .map((id) => byId.get(id))
      .filter((it): it is QueueItem => Boolean(it && it.status === "ready" && it.recipe));
  }, [jobIds, queue.items]);
  // The section/cover/title organizational layer, joined against the working
  // `items` projection (see lib/project.ts) — recipe content itself stays owned
  // by the queue.
  const sections = useMemo(() => buildSections(items ?? [], projectMeta.meta), [items, projectMeta.meta]);
  useEffect(() => {
    if (items) projectMeta.syncSections(sections);
    // Only re-run when the computed sections actually change shape; syncSections
    // itself is a stable no-op once meta already reflects `sections`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);
  // Persist the job's id list whenever membership changes, so a reopened tab or
  // a return to /print restores the same selection. `null` (not yet hydrated)
  // is skipped so hydration reads the stored job before this can overwrite it;
  // an emptied job intentionally leaves the last stored ids (parity with the
  // prior `createCurrentPrintJob`, which no-ops on an empty list).
  useEffect(() => {
    if (jobIds) createCurrentPrintJob(jobIds);
  }, [jobIds]);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState("");
  // Either side panel can be folded away to give the page more room. Session
  // state on purpose, not a stored preference: collapsing is something you do
  // to look at a page, not how you want the workspace set up from now on.
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [pendingAddSectionId, setPendingAddSectionId] = useState<string | null>(null);
  const [pendingAddIndex, setPendingAddIndex] = useState<number | null>(null);
  const [pendingAddAfterRecipeId, setPendingAddAfterRecipeId] = useState<string | null>(null);
  const [savedProjectId, setSavedProjectId] = useState<string | null>(null);
  // State drives the UI; the ref is the authoritative identity inside queued
  // async saves, which can run before React commits the state update.
  const savedProjectIdRef = useRef<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AccountSaveStatus | null>(null);
  const [projectLoading, setProjectLoading] = useState(Boolean(accountProjectId));
  /**
   * How opening a bookmarked `?project=` link turned out.
   *
   * Needed because "still loading" and "will never load" looked identical.
   * `items` stays null until a job's ids land, and the three ways a bookmarked
   * project fails — signed out, not yours / deleted, request failed — all
   * returned without ever setting them. The page then sat on "Loading your
   * project…" forever. A toast fired in two of those cases, which is not a
   * thing to say to someone staring at a spinner that will never stop.
   */
  const [projectAccess, setProjectAccess] = useState<
    "needs-auth" | "missing" | "failed" | null
  >(null);
  // Whether the working copy has been matched against the account's saved
  // documents yet (see the reattach effect below). Autosave waits for this so it
  // can never mistake an already-saved book for a brand-new one.
  const [projectAttachChecked, setProjectAttachChecked] = useState(false);
  const projectRevisionRef = useRef(0);
  const lastSavedFingerprintRef = useRef<string | null>(null);
  const lastAttemptedFingerprintRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);
  const latestSaveRef = useRef<(projectIdOverride?: string) => void>(() => undefined);
  /** The document a save that had to wait was aimed at. See `handleSaveProject`. */
  const queuedSaveOverrideRef = useRef<string | undefined>(undefined);
  const flushOnHideRef = useRef<() => void>(() => undefined);
  const saveAfterLoginRef = useRef(false);
  /** The cook answered the "Newer version found" prompt by choosing to
      overwrite, and this save is that answer. Read once by the adoption path,
      which otherwise refuses to replace a document it has never written, and
      cleared as soon as the save it authorized has been attempted — an approval
      is for one write, not a standing permission. */
  const adoptionOverwriteApprovedRef = useRef(false);
  const projectIdRef = useRef<string>(createPrintProjectId());
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  /** Whether the toast is reporting a FAILURE or just confirming something.
      Import failures no longer come through here at all — they hold their own
      page (see `failedImports`) — but saves, prints and exports still can. */
  const [toastTone, setToastTone] = useState<"info" | "error">("info");
  const [freeTemplateStatus, setFreeTemplateStatus] = useState<RecipePrinterFreeTemplateStatus | null>(null);
  const {
    user: cookPilotUser,
    ready: cookPilotAuthReady,
    redirectError: cookPilotRedirectError,
  } = useCookPilotAuth();

  /**
   * Whose document this is stops being true the moment the account changes.
   *
   * Save identity is held in refs so a queued async save can read it before
   * React has committed the matching state, and nothing reset them when the
   * account underneath changed. Sign out and back in as somebody else — both
   * are one click apart inside the deck, with no reload between them — and the
   * page was still attached to the FIRST account's project id and revision.
   *
   * The next autosave then wrote that id into the second account. It does not
   * even conflict: `savePrintProject` only compares revisions for a document
   * that already exists, and in a different account's namespace that id is
   * empty, so the write lands as a create. One person's recipes end up in
   * another person's library, on a shared laptop, with both signed in to their
   * own accounts and neither asking for it.
   *
   * Declared here, above every effect that saves or attaches, because effects
   * run in source order and refs are written synchronously — so this has
   * cleared the previous account's identity before anything in the same commit
   * can read it. Keyed on the uid rather than the User object for the usual
   * reason: Firebase hands out a fresh object on every token refresh, and an
   * account that has not changed must not be torn down hourly.
   *
   * `projectAttachChecked` goes back to false with the rest, which is what
   * sends the new account through the reattach check rather than letting it
   * inherit an answer about the old one.
   */
  useEffect(() => {
    savedProjectIdRef.current = null;
    setSavedProjectId(null);
    projectRevisionRef.current = 0;
    lastSavedFingerprintRef.current = null;
    lastAttemptedFingerprintRef.current = null;
    // An approval to overwrite was given for one document in one account. It is
    // not permission to write over anything in the next one.
    adoptionOverwriteApprovedRef.current = false;
    setProjectAttachChecked(false);
    // A "Saved" left over from the previous account is a claim about a document
    // this one may not even have.
    setSaveStatus(null);
  }, [cookPilotUser?.uid]);

  const [isRecipePrinterAdmin, setIsRecipePrinterAdmin] = useState(false);
  const [showCookPilotLogin, setShowCookPilotLogin] = useState(false);
  const [cookPilotLoginReason, setCookPilotLoginReason] = useState<"default" | "purchase">("default");
  const printRequestedRef = useRef(false);
  // The document title becomes the browser's default "Save as PDF" filename, so
  // a cookbook export is named after the book (e.g. "Grandma's Cookbook.pdf")
  // rather than the generic page title. Stashed here and restored on afterprint.
  const previousDocTitleRef = useRef<string | null>(null);
  /**
   * Did the browser actually take the last print we asked for?
   *
   * `window.print()` returns the same way whether it opened a print sheet or
   * quietly declined, so this is the only tell: every engine that prints fires
   * `beforeprint` first, and fires it synchronously. Set false immediately
   * before the call and read a moment after — still false means the browser did
   * nothing, which is a dead button unless we do something about it.
   */
  const printAcceptedRef = useRef(false);
  /** The pending verdict, so leaving the page cancels it. A watchdog that
      outlived its page would reload someone who had already walked away. */
  const printWatchdogRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (printWatchdogRef.current !== null) window.clearTimeout(printWatchdogRef.current);
    },
    [],
  );
  /** Between `window.print()` and the verdict above. Shows the button's spinner
      so the wait reads as working rather than as broken. */
  const [printAwaitingBrowser, setPrintAwaitingBrowser] = useState(false);
  /** The browser refused and a fresh document is not going to change that.
      Last resort, after the reload has already been tried. */
  const [printRefusedNotice, setPrintRefusedNotice] = useState(false);
  const autoPrintAttemptedRef = useRef(false);
  const postPrintActionRef = useRef<PostPrintAction>("donate");
  // A print the user asked for while the layout was still measuring. Rather
  // than disable the Print button (dead for the ~2s a settings change takes to
  // re-settle) or print the previous layout still on screen, the click is
  // remembered and fired the instant the requested layout is ready — one
  // click, correct result, no "try again". Cleared if the request resolves or
  // the user navigates away from the intent.
  const [printPending, setPrintPending] = useState(false);
  /**
   * Draw the whole book, not just the window around the reader.
   *
   * The deck renders only the pages near the active slide (see `DECK_WINDOW` in
   * components/print/PrintDeck) — but the deck IS what a browser print
   * captures, so a windowed deck would print placeholders. `beforeprint` is the
   * one hook that fires for BOTH `window.print()` and the user's own ⌘P, and it
   * runs synchronously before the print snapshot, so a `flushSync` there gets
   * every page committed in time.
   */
  const [renderAllPages, setRenderAllPages] = useState(false);
  // Snapshot of every queue id that already existed when this print job was
  // loaded, so the merge effect below can tell "pre-existing queue item the
  // user didn't select for this job" apart from "just added via the Add
  // recipe dialog" — only the latter should get pulled into the deck.
  const initialQueueIdsRef = useRef<Set<string>>(new Set());
  /** The capture handoff is taken once per mount — see the effect that reads it. */
  const consumedPendingImportRef = useRef(false);
  /**
   * Whether an import is this deck's to wait for — i.e. started here.
   *
   * Deliberately does NOT include imports that were still parsing when we
   * arrived, even though those are arguably ours too. An import started on the
   * home page and previewed before it landed is dropped from the job (the id
   * filter keeps only `ready` items) and excluded from the merge that would
   * pick it up afterwards, so it never appears here at all.
   *
   * That is a real bug, and the obvious fix — widen this — makes it worse
   * rather than better. `useQueue` is per-instance React state with no
   * cross-instance sync: it hydrates from storage on mount, and a parse
   * started on the home page finishes inside THAT hook's closure. It writes
   * the result to storage, and this page's copy never hears. So adopting the
   * item buys a placeholder that spins forever instead of a recipe that
   * quietly never arrives. Verified against a held-open import on 2026-09-10.
   *
   * The fix belongs in lib/queue (one live queue per tab, or a write
   * notification instances can adopt), not in a membership predicate here.
   */
  const isOursToAwait = useCallback((id: string) => !initialQueueIdsRef.current.has(id), []);

  const anyRecipeHasImage =
    items?.some((item) => Boolean(item.recipe?.image)) ?? false;
  const anyRecipeHasSourceUrl =
    items?.some((item) => Boolean(item.recipe?.sourceUrl)) ?? false;
  /** Whether any recipe arrived with a website blurb. With none, the checkbox
      would govern nothing, so it is not offered. */
  const anyRecipeHasDescription =
    items?.some((item) => Boolean(item.recipe?.description?.trim())) ?? false;
  const cookbookMode = Boolean(projectMeta.meta.cookbookMode);
  /**
   * Is this project a DOCUMENT, or is it a print run?
   *
   * A cookbook is a document: it was deliberately created, it has a name, a
   * cover and chapters, and it can be paid for. Recipe cards are an act — you
   * paste three links to print dinner tonight and you're done. Nobody declared
   * a document, so nothing should file one on their behalf.
   *
   * `stashedCookbook` counts: a book being viewed as recipe cards is still a
   * book (see `currentProject`), and must keep saving as one.
   */
  const isCookbookDocument = cookbookMode || Boolean(projectMeta.meta.stashedCookbook);
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
  /** The format currently rendering server-side, if any. */
  const [exportingPreset, setExportingPreset] = useState<CookbookPresetId | null>(null);
  /** The last export that actually landed: which book, and the files it wrote.
      Held here rather than in the dialog because the dialog cannot know a
      download succeeded — `onExport` returns before the render does. */
  const [lastCookbookExport, setLastCookbookExport] = useState<{
    presetId: CookbookPresetId;
    files: string[];
  } | null>(null);
  const [cookbookExportError, setCookbookExportError] = useState<string | null>(null);
  /** The export was refused for want of an account, not because it broke — so
      the ready dialog offers a sign-in button beside the message. */
  const [cookbookExportNeedsAuth, setCookbookExportNeedsAuth] = useState(false);
  /** No session at all (offer to create one) vs a session that didn't hold up. */
  const [cookbookExportNeedsAccount, setCookbookExportNeedsAccount] = useState(false);
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
    // Shared with the export, which used to read `dedication` alone and so
    // rendered nothing for a page written in the opening-page editor.
    return openingPageFor({
      frontMatter: projectMeta.meta.frontMatter,
      dedication: projectMeta.meta.dedication,
      template,
    });
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
    sheets,
    navItems,
    spreads,
    previewConfig,
    awaitingFirstLayout,
    measurers,
  } = usePrintSheets({
    sections,
    cover: projectMeta.meta.cover,
    backCover: projectMeta.meta.backCover,
    dedication: dedicationPage,
    tableOfContents: projectMeta.meta.cookbookMode ? projectMeta.meta.tableOfContents : false,
    cookbookMode: projectMeta.meta.cookbookMode,
    itemPlacements: projectMeta.meta.itemPlacements,
    defaultFullPage,
    // Chapter openers with no placement of their own follow the book's Photos
    // choice (see `resolveSectionPhotoMode`).
    photoStyle: cookbookMode ? photoStyle : undefined,
    cardSize,
    doubleSided,
    photosOn,
    sourceUrlOn,
    descriptionOn: showDescription,
    template,
    // The preview page IS the book's real sheet, and so is the card every
    // recipe is measured against (see `presetCardDims`).
    preset: projectMeta.meta.cookbookPreset,
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
  // with `navItems.findIndex` was O(n²) on every render, and this component
  // re-renders on each scroll page-crossing as `activeNavIndex` updates.
  const firstNavIndexBySheet = useMemo(() => {
    const map = new Map<number, number>();
    navItems.forEach((navItem, index) => {
      if (!map.has(navItem.sheetIndex)) map.set(navItem.sheetIndex, index);
    });
    return map;
  }, [navItems]);


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
  // sections) and whole sections (carrying their recipes). `resolve` reads the
  // rows' geometry and returns where the drop would land + how to commit it.
  const railScrollRef = useRef<HTMLElement | null>(null);

  // ── Rail geometry, measured once per drag rather than once per frame ──────
  // `useRailDrag` re-resolves the drop target on EVERY animation frame, so this
  // ran `querySelectorAll` + `getBoundingClientRect` over every rail row 60
  // times a second — on a 60-recipe book, well over a hundred forced layout
  // reads per frame, interleaved with the auto-scroll's writes to `scrollTop`
  // in the same frame. That read-after-write is the textbook layout thrash.
  //
  // Rows only move when the rail scrolls or its layout changes, never merely
  // because the pointer moved, so a snapshot is valid for the whole drag. The
  // shape mirrors `useDeckScroller`'s `slideCentersRef`/`centersDirtyRef`.
  interface RailGeometry {
    scroller: HTMLElement;
    scrollTop: number;
    recipes: Array<{ id: string; rect: DOMRect }>;
    sections: Array<{ id: string; rect: DOMRect }>;
    newSection: DOMRect | null;
    sectionAdds: Array<{ id: string; rect: DOMRect }>;
  }
  const railGeometryRef = useRef<RailGeometry | null>(null);
  const railGeometryDirtyRef = useRef(true);
  const readAll = (scroller: HTMLElement, selector: string, key: string) =>
    Array.from(scroller.querySelectorAll<HTMLElement>(selector))
      .map((el) => ({ id: el.dataset[key] as string, rect: el.getBoundingClientRect() }))
      .filter((entry) => Boolean(entry.id));

  const railGeometry = (scroller: HTMLElement): RailGeometry => {
    const cached = railGeometryRef.current;
    // `scrollTop` is one property read against a hundred-plus rect reads, so
    // comparing it is far cheaper than re-measuring — and it catches both the
    // drag's own auto-scroll and the user scrolling the rail underneath.
    if (
      cached &&
      !railGeometryDirtyRef.current &&
      cached.scroller === scroller &&
      cached.scrollTop === scroller.scrollTop
    ) {
      return cached;
    }
    const newSection = scroller.querySelector<HTMLElement>("[data-rail-new-section]");
    const measured: RailGeometry = {
      scroller,
      scrollTop: scroller.scrollTop,
      recipes: readAll(scroller, "[data-rail-recipe]", "railRecipe"),
      sections: readAll(scroller, "[data-rail-section]", "railSection"),
      newSection: newSection?.getBoundingClientRect() ?? null,
      sectionAdds: readAll(scroller, "[data-rail-section-add]", "railSectionAdd"),
    };
    railGeometryRef.current = measured;
    // Entering the organizer runs a FLIP that re-projects every tile each frame
    // (see `runOrganizeFlip`), so during that window there is no stable geometry
    // to cache — stay dirty and keep measuring until it settles.
    railGeometryDirtyRef.current = organizeAnimating;
    return measured;
  };

  const resolveRailDrop = (
    kind: RailDragKind,
    id: string,
    clientX: number,
    clientY: number,
  ): RailDropResolved | null => {
    const scroller = railScrollRef.current;
    if (!scroller) return null;
    const geometry = railGeometry(scroller);
    const midpointIndex = (rects: DOMRect[]) => {
      const i = rects.findIndex((rect) => clientY < rect.top + rect.height / 2);
      return i === -1 ? rects.length : i;
    };
    if (kind === "recipe") {
      // Dragging a recipe that's part of the current selection carries the
      // whole selection, in book order — every tile the cook picked travels
      // with the one under the pointer. Dragging an unselected one moves it
      // alone, and leaves the selection where it is.
      const movingIds = effectiveRailSelection.has(id) ? orderedRailSelection() : [id];
      const moving = new Set(movingIds);
      // Nothing being carried can also be a drop target — a selection can't
      // land on itself, and neither can a single card.
      const rows = geometry.recipes.filter((row) => !moving.has(row.id));
      if (rows.length === 0) return null;

      // The expanded organizer is a 2D card grid, so resolve against the card
      // nearest the pointer and use its left/right half as before/after. The
      // normal page rail below remains a vertical midpoint list.
      if (organizeMode) {
        const contains = (rect: DOMRect) =>
          clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
        const newSectionRect = geometry.newSection;
        if (newSectionRect) {
          const rect = newSectionRect;
          if (contains(rect)) {
            return {
              indicator: { top: rect.top, left: rect.left, width: rect.width },
              commit: () => {
                const sectionId = projectMeta.addSection("New chapter");
                projectMeta.moveItems(movingIds, sectionId, 0);
                clearRailSelection();
                setEditingSectionId(sectionId);
                setEditingSectionTitle("New chapter");
                setPendingFocusNavId(sectionId);
              },
            };
          }
        }

        const sectionAdd = geometry.sectionAdds.find((entry) => contains(entry.rect));
        if (sectionAdd) {
          const sectionId = sectionAdd.id;
          const rect = sectionAdd.rect;
          return {
            indicator: { top: rect.top, left: rect.left, width: rect.width },
            commit: () =>
              projectMeta.moveItems(
                movingIds,
                sectionId,
                itemIdsForSection(sectionId).filter((x) => !moving.has(x)).length,
              ),
          };
        }

        const candidates = rows.filter((row) => row.rect.width > 0 && row.rect.height > 0);
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
            const ids = itemIdsForSection(location.sectionId).filter((x) => !moving.has(x));
            const targetIndex = ids.indexOf(target.id);
            projectMeta.moveItems(
              movingIds,
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
          const ids = itemIdsForSection(target.sectionId).filter((x) => !moving.has(x));
          const idx = ids.indexOf(rows[k].id);
          projectMeta.moveItems(movingIds, target.sectionId, idx < 0 ? ids.length : idx);
        } else {
          const last = sectionAndIndexForItem(rows[rows.length - 1].id);
          if (!last) return;
          projectMeta.moveItems(
            movingIds,
            last.sectionId,
            itemIdsForSection(last.sectionId).filter((x) => !moving.has(x)).length,
          );
        }
      };
      return { indicator, commit };
    }
    const groups = geometry.sections;
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
  const railDrag = useRailDrag(
    railScrollRef,
    resolveRailDrop,
    (kind) => {
      // Only the cookbook rail opens the organizer on a recipe drag; the flat
      // (non-cookbook) rail reorders the card list in place via the same drag.
      if (kind === "recipe" && !organizeMode && cookbookMode) enterOrganizeMode();
      if (kind === "recipe") markCustomOrder();
    },
    (kind, id) =>
      kind === "recipe" && effectiveRailSelection.has(id) ? effectiveRailSelection.size : 1,
  );

  // Everything that can move rail rows WITHOUT scrolling the rail — the drag
  // classes landing on the commit after `onBegin`, the organizer's grid/list
  // switch, and any change to the page list itself. Scroll-driven movement is
  // caught by the `scrollTop` comparison inside `railGeometry`.
  useEffect(() => {
    railGeometryDirtyRef.current = true;
  }, [railDrag.draggingId, organizeMode, organizeAnimating, navItems]);

  // Imports started from this page stay in the rail until they either become a
  // real page or the cook removes them. In particular, an error must not vanish
  // merely because it is no longer in the parsing state.
  const pendingImportItems = queue.items.filter((item) =>
    // A failure is TERMINAL, so it is always ours to show — including one that
    // arrived before this page did, or survived a reload. The `isOursToAwait`
    // caution exists because a parse can still be running inside another hook
    // instance we will never hear from; nothing is still running here, so the
    // card renders complete, with working actions, immediately. Left narrow,
    // a failed import reloads into being invisible-but-present in the queue,
    // which is the dead-import-nobody-can-see bug the old toast was chasing.
    item.status === "error"
      ? true
      : item.status === "parsing" && isOursToAwait(item.id),
  );
  // Carried as items rather than a count so each placeholder is keyed by the
  // import it belongs to — which is what lets a page become that recipe in
  // place instead of one anonymous spinner leaving as another card arrives.
  const parsingImports = pendingImportItems.filter((item) => item.status === "parsing");

  /**
   * Still parsing, plus anything parsed whose page has not landed yet.
   *
   * The deck keeps one placeholder from the moment an import starts until the
   * page that replaces it is actually there. Without the second half the card
   * was pulled the instant parsing ended and the page arrived a beat later,
   * with nothing in between.
   */
  const deckPendingImports = useMemo(() => {
    const paged = new Set(navItems.map((navItem) => navItem.recipeId));
    // Derived, not stored. Holding this in state meant setting it from an
    // effect, which runs AFTER the render that dropped the item from
    // `parsingImports` — so there was still one frame with neither, and the
    // placeholder blinked out and back before the page arrived.
    const waitingForAPage = queue.items.filter(
      (item) =>
        item.status === "ready" &&
        item.recipe &&
        isOursToAwait(item.id) &&
        !paged.has(item.id),
    );
    if (waitingForAPage.length === 0) return parsingImports;
    return [...parsingImports, ...waitingForAPage];
  }, [parsingImports, navItems, queue.items, isOursToAwait]);

  const parsingImportCount = parsingImports.length;
  /**
   * Failures hold their slot instead of becoming a toast.
   *
   * The toast was the whole answer, and it was the wrong shape twice over. It
   * expired, so "what happened to the one I just added?" outlived the reply;
   * and it carried `shortImportError(errorCode)` — a bucket label — while the
   * sentence written for this exact moment sat unused on `item.error`, which
   * the home page had been showing all along. The workspace said less about a
   * failure than the page the cook came from.
   *
   * It also had nowhere to put the actions. Our commonest failure is a site
   * that blocks readers, and that error ends "Paste the recipe text or upload
   * a screenshot to go around it" — an instruction with nothing to click. On a
   * card those are buttons, and they repair the slot in place.
   */
  const failedImports = pendingImportItems.filter((item) => item.status === "error");

  const sectionTitleForId = useCallback((sectionId: string): string => {
    return sections.find((section) => section.id === sectionId)?.title?.trim() || "chapter";
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
    projectMeta.addSection("New chapter");
  }

  // Bottom-sheet reorder/structure surface for phones — the touch-native
  // replacement for the drag-only desktop rail (hidden on mobile). Rendered
  // only in cookbook mode; the CSS keeps it off desktop entirely.

  function startSectionEdit(sectionId: string) {
    setEditingSectionId(sectionId);
    setEditingSectionTitle(sectionTitleForId(sectionId));
  }

  // Typing a chapter name used to write project meta on every character, and a
  // meta change re-packs every sheet (section grouping, page numbering, the TOC)
  // and re-renders every page in the deck. The textarea itself is driven by
  // `editingSectionTitle` — local state — so only the meta write has to wait.
  //
  // A throttle, not a resetting debounce: the write always lands within the
  // window, so a title is saved while it is still being typed rather than only
  // once the field closes. `commitSectionEdit` writes the final value itself,
  // so a cancelled trailing write is never the only copy of anything.
  const SECTION_RENAME_DEBOUNCE_MS = 200;
  const pendingSectionRenameRef = useRef<{ sectionId: string; value: string } | null>(null);
  const sectionRenameTimerRef = useRef<number | undefined>(undefined);
  const renameSection = projectMeta.renameSection;

  const cancelPendingSectionRename = useCallback(() => {
    window.clearTimeout(sectionRenameTimerRef.current);
    sectionRenameTimerRef.current = undefined;
    pendingSectionRenameRef.current = null;
  }, []);

  const flushSectionRename = useCallback(() => {
    const pending = pendingSectionRenameRef.current;
    window.clearTimeout(sectionRenameTimerRef.current);
    sectionRenameTimerRef.current = undefined;
    pendingSectionRenameRef.current = null;
    if (pending) renameSection(pending.sectionId, pending.value.trim() || undefined);
  }, [renameSection]);

  const editSectionTitle = useCallback(
    (sectionId: string, value: string) => {
      setEditingSectionTitle(value);
      // Moving to a different section's title must not discard the one still
      // pending — land it before this one takes over the slot.
      const pending = pendingSectionRenameRef.current;
      if (pending && pending.sectionId !== sectionId) flushSectionRename();
      pendingSectionRenameRef.current = { sectionId, value };
      if (sectionRenameTimerRef.current !== undefined) return;
      sectionRenameTimerRef.current = window.setTimeout(flushSectionRename, SECTION_RENAME_DEBOUNCE_MS);
    },
    [flushSectionRename],
  );

  // Never strand a pending rename when the page goes away.
  useEffect(() => flushSectionRename, [flushSectionRename]);

  function commitSectionEdit() {
    if (!editingSectionId) return;
    // Commit writes the authoritative value right here, so a queued trailing
    // write would only repeat it.
    cancelPendingSectionRename();
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
    const title = "New chapter";
    const sectionId = projectMeta.addSection(title);
    setEditingSectionId(sectionId);
    setEditingSectionTitle(title);
    setPendingFocusNavId(sectionId);
    showToast("Chapter added. Drag recipes beneath it to group them.");
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
    // Chapter the book they already have. Turning a stack of recipes into a
    // cookbook and handing back one undivided run of pages leaves the cook to
    // do by hand the thing the book was for — and "Organize for me" is a button
    // they have to find, in a panel they have to open, to get a result we could
    // already have given them. Only for a book with enough recipes to group,
    // and never over chapters they made themselves.
    if (
      namedSectionCount(sections) === 0 &&
      (items ?? []).filter((item) => item.recipe).length >= 2
    ) {
      applyCookbookOrganization({ automatic: true });
    }
    projectMeta.setCookbookWelcomeCompleted(true);
    // Every recipe gets its own full page — no auto-pairing. The cook can turn
    // an individual recipe into a full-page photo spread from the page controls.
    return bookTemplate;
  }

  function beginCookbookBuild({ offerAfter = false }: { offerAfter?: boolean } = {}) {
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
    window.setTimeout(() => {
      setCookbookBuilding(false);
      if (!offerAfter) return;
      // The offer lands on top of the finished book, not in front of an idea of
      // one. See `startCookbook`.
      track("cookbook_welcome_shown", { price: cookbookPrice, recipeCount: items?.length ?? 0 });
      setShowCookbookOfferDialog(true);
    }, 1650);
  }

  /**
   * Switching the kind control from Recipe cards to Cookbook. One path, every
   * time: the build reveal, then the offer over the finished book.
   *
   * This used to fork three ways on whether the welcome had been seen and
   * whether a stash existed, and two of those forks were worse. A returning
   * book got a bare 650ms spinner instead of the reveal; a *second* book got
   * no loading state at all — it snapped over mid-relayout — and never fired
   * `cookbook_workspace_entered`, so every book after someone's first was
   * invisible in analytics. That last branch went from rare to normal once
   * `cookbookWelcomeCompleted` started surviving `startNewProject`.
   *
   * Nothing was gained for the branching: `scaffoldCookbook` already decides
   * restore-vs-fresh on its own, from `stashedCookbook`.
   */
  function startCookbook() {
    // Build first, ask second.
    //
    // The offer used to open the moment the kind control moved to Cookbook, on
    // top of a screen of loose cards: someone had to buy the idea of a book
    // before ever seeing one. Switching the mode first means
    // the reveal runs, their own recipes assemble into a cover and chapters,
    // and the offer arrives over the finished article.
    //
    // Safe to show the book before the money: `cookbookLocked` only watermarks
    // the PRINT, and the switch is reversible either way — the book is stashed
    // on the same project id, so "Back to recipe cards" puts everything back.
    beginCookbookBuild({ offerAfter: true });
  }

  /**
   * Recipe cards ↔ Cookbook. One document, one id, two modes.
   *
   * This used to do two extra things, and both were wrong.
   *
   * It showed a confirm dialog, for an action that loses nothing: the book is
   * tucked into `stashedCookbook` and — since that stash is now persisted with
   * the saved document — comes back intact on the way in.
   *
   * Worse, for any saved book it minted a fresh project id first, on the
   * reasoning that a card job must never autosave over the cookbook. But the
   * PURCHASE hangs off the project id, and `restoreCookbook` brings the book
   * back under whatever id is current — so toggling out of a paid cookbook and
   * back returned the book on a brand-new id with no unlock attached, and asked
   * the cook to buy the book they had already bought. On unpaid books the same
   * fork simply manufactured the duplicate projects `lib/duplicateProjects.ts`
   * exists to sweep up, once per curious click.
   *
   * Keeping the id makes both problems go away: the document holds either an
   * active book or a card job with the book stashed beside it, the unlock stays
   * attached either way, and the switch is genuinely reversible — which is the
   * only thing that justified it being a toggle in the first place.
   */
  function exitCookbookToCards() {
    track("cookbook_exited", { recipeCount: items?.length ?? 0 });
    projectMeta.exitCookbook();
  }

  // The single per-recipe photo axis, matching the book-wide "Photos" control:
  // "none" (no photo), "card" (header photo), "full" (a full-page facing photo /
  // image-spread). Derived from the resolved layout + the per-recipe header
  // override, falling back to the book default.
  /**
   * What the placement switch shows for one recipe: the stored INTENT, not
   * what the page happens to render today.
   *
   * This used to read `resolvedLayouts`, which is the rendering decision. A
   * "Full page" recipe with no photo yet resolves to a plain card (see
   * `cookbookResolution` in usePrintSheets), so asking the renderer meant the
   * switch snapped back to None the instant you pressed Full page — the one
   * placement you would pick in order to go and find a photo was the one that
   * would not stick.
   *
   * `setItemPhotoMode` always writes `pageLayout`, so an absent one means this
   * recipe is following the book rather than having chosen None.
   */
  const photoModeFor = useCallback(
    (recipeId: string): PhotoStyle => {
      const placement = projectMeta.meta.itemPlacements?.[recipeId];
      if (placement?.pageLayout === "image-spread") return "full";
      if (placement?.pageLayout === "full") {
        return (placement.showPhoto ?? photoStyle === "card") ? "card" : "none";
      }
      return photoStyle;
    },
    [projectMeta.meta.itemPlacements, photoStyle],
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
    // Chapter openers are part of the book, not an exception to it: a placement
    // made for one opener under the old choice would otherwise pin that chapter
    // to art the book no longer uses. Their photos and collages are kept, so the
    // new placement uses them immediately.
    projectMeta.clearSectionPhotoModes();
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
    // The toolbar button opens the SAME dialog the art itself opens -- photo
    // placement on top, then which photo, plus the chapter's collage. Built at
    // the "art" surface because that is the one that always offers a photo to
    // pick; the "opener" surface withholds it outside band mode, which in a
    // toolbar would be a picker that cannot pick.
    const edit = buildSectionPhotoEdit(section, "art");
    return (
      <ImagePicker
        current={edit.photoUrl}
        images={edit.recipeImages ?? []}
        onSelect={(url) => edit.onPhotoChange?.(url)}
        placement={edit.placement}
        placementOptions={edit.placementOptions}
        onPlacementChange={edit.onPlacementChange}
        gridActive={edit.gridActive}
        onSelectGrid={edit.onSelectGrid}
        onExitGrid={edit.onExitGrid}
        gridImages={edit.gridImages}
        onGridChange={edit.onGridChange}
        gridMax={edit.gridMax}
        openSignal={photoDialogSignal(sectionId)}
        label={section.photoUrl ? "Photo" : "Add photo"}
        className="recipe-page-toolbar__photo"
      />
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
    setPendingFocusNavId("cover-front");
  }

  /** Toggles the dedication front-matter page. Adding one seeds a quiet,
      template-skinned page and jumps into editing it; removing clears it. */
  function toggleDedication() {
    if (projectMeta.meta.frontMatter || projectMeta.meta.dedication) {
      projectMeta.setFrontMatter(undefined);
      projectMeta.setDedication(undefined);
      return;
    }
    projectMeta.setFrontMatter({ kind: "dedication", heading: "Dedication", body: DEFAULT_DEDICATION_BODY });
    track("cookbook_front_matter_enabled", { kind: "dedication" });
    setPendingFocusNavId("cover-dedication");
  }

  /**
   * Move one recipe into another chapter, from the page toolbar.
   *
   * Appends to the destination rather than asking where in it: from the page
   * you are looking at, "put this in Desserts" is the whole thought, and a
   * second question about position would be answered by dragging in the rail
   * anyway. `moveItems` is the same commit a rail drag makes, so this lands
   * in the project the same way and gets the same undo.
   */
  const moveRecipeToSection = useCallback(
    (recipeId: string, sectionId: string) => {
      const destination = projectMeta.meta.sections.find((section) => section.id === sectionId);
      if (!destination) return;
      projectMeta.moveItems([recipeId], sectionId, destination.itemIds.length);
      const name = sectionTitleForId(sectionId);
      showToast(name ? `Moved to ${name}` : "Moved");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectMeta, sectionTitleForId],
  );

  /**
   * Make a chapter and put this recipe in it, from the toolbar's move menu.
   *
   * Named "New chapter", the same as "Add chapter" — an UNTITLED chapter is
   * the implicit ungrouped pool, gets no opener page and shows nothing in the
   * rail, so creating one here looked like the button had done nothing at all.
   * The rail opens on its title for renaming.
   */
  const moveRecipeToNewSection = useCallback(
    (recipeId: string) => {
      const sectionId = projectMeta.addSection("New chapter");
      projectMeta.moveItems([recipeId], sectionId, 0);
      setEditingSectionId(sectionId);
      setEditingSectionTitle("New chapter");
      showToast("New chapter added. Give it a name.");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectMeta],
  );

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
      setJobIds((current) => (current ?? []).filter((jid) => jid !== id));
      queue.remove(id);
    } else if (pendingDelete.kind === "section") {
      projectMeta.deleteSection(pendingDelete.id);
    } else if (pendingDelete.side === "back") {
      projectMeta.setBackCover(undefined);
    } else if (pendingDelete.side === "dedication") {
      projectMeta.setDedication(undefined);
      projectMeta.setFrontMatter(undefined);
    } else {
      projectMeta.setCover(undefined);
    }
    setPendingDelete(null);
  }

  function confirmDeleteSectionRecipes() {
    if (!pendingDelete || pendingDelete.kind !== "section") return;
    const idsToRemove = new Set(pendingDelete.recipeIds);
    setJobIds((current) => (current ?? []).filter((jid) => !idsToRemove.has(jid)));
    pendingDelete.recipeIds.forEach((id) => queue.remove(id));
    projectMeta.deleteSection(pendingDelete.id);
    setPendingDelete(null);
  }

  const [mobileDrawer, setMobileDrawer] = useState<"template" | null>(null);

  /**
   * Go and get a document that can print, when this one can't.
   *
   * Returns true once it has started the load, and the caller stops there: the
   * print carries on the other side, because `print=1` is the flag this page
   * already reads to print on arrival. Refuses when this document IS that fresh
   * load, so a browser we can't satisfy meets the message rather than a reload
   * loop (see lib/printRearm).
   */
  function rearmForPrint(): boolean {
    if (!claimPrintRearm()) return false;
    window.location.href = printAgainHref(window.location);
    return true;
  }

  async function printNow() {
    // This document has already spent its one print, and asking it again is the
    // silent no-op that made the button look dead. Go the long way round.
    if (preferFreshDocumentForPrint() && rearmForPrint()) return;
    printRequestedRef.current = true;
    track("print_started", {
      template,
      cardSize,
      showPhoto,
      doubleSided,
      recipeCount: items?.filter((item) => item.recipe).length ?? 0,
      cookbookPreset: cookbookMode ? activePreset.id : undefined,
    });
    // Name the exported PDF after what is in it. The browser seeds the
    // Save-as-PDF filename from document.title, so this is what turns the
    // deliverable from "Print preview · RecipePrinter.pdf" into "The Smith
    // Family Cookbook.pdf" or "Basil Pesto and Korean Beef Bowl.pdf".
    //
    // Cookbooks take the book's own title. Everything else is named from the
    // recipes being printed (see lib/printDocumentTitle): the alternative was
    // that every plain recipe anyone saved landed in Downloads under the same
    // generic name, which is exactly the folder our own /convert-recipe-to-pdf
    // page sends people to.
    const printTitle = cookbookMode
      ? projectMeta.meta.cover?.title?.trim() || null
      : printDocumentTitle(
          (items ?? []).filter((item) => item.recipe).map((item) => item.recipe?.title),
        );
    if (printTitle) {
      previousDocTitleRef.current = document.title;
      document.title = printTitle;
    }
    printAcceptedRef.current = false;
    setPrintAwaitingBrowser(true);

    // ── Let the button say something before the deck is drawn ───────────────
    //
    // `window.print()` does not yield, and `beforeprint` fires inside it and
    // synchronously renders EVERY page (see the handler). The deck is normally
    // windowed to five pages, so on a real cookbook that is the whole book
    // rendered in one unbroken run of the main thread — and all of it used to
    // happen between this line and the print sheet appearing, with the spinner
    // above committed but never drawn. The button looked untouched for the
    // entire wait, which is what a refused print looks like too.
    //
    // So: paint the spinner, then do the expensive render here where the
    // spinner is up, then ask the browser. `beforeprint` still sets the same
    // flag for the cook's own Ctrl+P, where there is no click of ours to hang
    // this off; by then it is already true and React bails out of the update,
    // so the work is done once either way.
    await nextPaint();
    flushSync(() => setRenderAllPages(true));
    await nextPaint();

    // Deferring `print()` past a frame takes it out of the click's own task.
    // That is not new ground: the `print=1` auto-print path has always called
    // it from a 350ms `setTimeout` with no gesture at all, and that path is
    // what the mobile rearm depends on (see lib/printRearm). The watchdog
    // below is the backstop either way — it is exactly the mechanism for "the
    // browser did not take it".
    window.print();
    // `window.print()` returns the same either way, so watch for the browser
    // taking it. A print that happened has fired `beforeprint` by now, in every
    // engine; nothing at all means the browser declined without saying so, and
    // that is the twenty-four dead taps this whole path exists to prevent. Try
    // once from a document that hasn't printed yet, and if that was already
    // this document, say so plainly instead of leaving a button that does
    // nothing.
    if (printWatchdogRef.current !== null) window.clearTimeout(printWatchdogRef.current);
    printWatchdogRef.current = window.setTimeout(() => {
      printWatchdogRef.current = null;
      setPrintAwaitingBrowser(false);
      if (printAcceptedRef.current) return;
      markPrintSpent();
      // Nothing took the print, so nothing is going to fire `afterprint` to put
      // the deck back to its five-page window. Left as it is, a refused print
      // leaves the entire book rendered on a page the cook is still using.
      setRenderAllPages(false);
      // `shouldPrint` is `print=1`, which is how a rearmed document arrives —
      // so it separates "the first attempt was refused" from "the reload didn't
      // help either", which are different bugs with different fixes.
      track("print_refused_by_browser", { template, cardSize, afterRearm: shouldPrint });
      if (rearmForPrint()) return;
      setPrintRefusedNotice(true);
    }, PRINT_ACCEPTANCE_GRACE_MS);
  }

  /**
   * Starts an empty recipe on the deck — the "or add manually" way out of the
   * Add dialog, for a recipe that is not anywhere to import FROM.
   *
   * Goes through `addReadyRecipes` rather than the import queue on purpose:
   * there is nothing to parse, so `runParse` would have to be taught to skip
   * itself, and a placeholder page would flash "importing" for a recipe that
   * arrived complete. `status: "ready"` is the truth — it is finished, it is
   * just empty.
   *
   * The blank card already knows how to be filled in: a recipe with no
   * ingredients still renders an "Add ingredient" prompt (see RecipeCardPrint),
   * revealed by the page's own Fields button, which shows itself because a
   * blank recipe is nothing but hidden fields.
   */
  function addManualRecipe() {
    const id = uid();
    const added = queue.addReadyRecipes([
      {
        id,
        method: "manual",
        // No origin to name. The rail falls back to `title` for its label, and
        // an empty one there would render a nameless row, so this says what the
        // page is until the cook titles it.
        source: "Added by hand",
        status: "ready",
        title: "Untitled recipe",
        addedAt: Date.now(),
        recipe: {
          // Empty, not placeholder text: every one of these is a field the card
          // renders as an editable, and seeding them with words would make the
          // cook delete our copy before writing theirs.
          title: "",
          ingredients: [],
          instructions: [],
        },
      },
    ]);
    if (added > 0) queue.focusItem(id);
  }

  function showToast(message: string) {
    setToastMessage(message);
    setToastTone("info");
  }

  /**
   * Say what a drag-delete took, and keep the way back.
   *
   * `useCallback` with no live dependencies on purpose: this is handed to the
   * inline editor, which folds it into the one `activeInlineEdit` object the
   * active card is memoized on. A fresh function every render would re-render
   * that card on every keystroke anywhere on the page.
   */
  const reportLinesDeleted = useCallback(
    ({ count, undo }: { count: number; undo: () => void }) => {
      setLineDeleteUndo(() => undo);
      setToastTone("info");
      setToastMessage(`Deleted ${count} ${count === 1 ? "line" : "lines"}`);
    },
    [],
  );

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

  // The ONE place the recommended structure is applied. Always snapshots the
  // current sections first, so the single Undo can restore them — that matters
  // MORE when this runs by itself at build time, because nobody asked for it.
  function applyCookbookOrganization({ automatic = false }: { automatic?: boolean } = {}) {
    setOrganizationUndo(structuredClone(projectMeta.meta.sections));
    const next = organizationSectionsForApply(
      suggestCookbookOrganization(items ?? []),
      (items ?? []).filter((item) => item.recipe).map((item) => item.id),
      // What the book already has, so a chapter the suggestion agrees with
      // keeps the opener photo, collage and intro the cook gave it instead of
      // being rebuilt bare.
      projectMeta.meta.sections,
    );
    projectMeta.setSectionStructure(next);
    track("relayout_applied", { sectionCount: next.length, automatic });
    // No toast for the automatic run: it lands mid-build-reveal, where it would
    // be a notification about something the cook is already watching happen.
    if (!automatic) showToast(cookbookMode ? "Cookbook organized" : "Recipes organized");
  }

  function suggestCookbookLayout() {
    applyCookbookOrganization();
  }

  function undoCookbookOrganization() {
    if (!organizationUndo) return;
    projectMeta.setSectionStructure(organizationUndo);
    setOrganizationUndo(null);
    showToast("Organization undone");
  }

  function recipeTitleForId(itemId: string) {
    const item = items?.find((entry) => entry.id === itemId);
    return (item?.recipe?.title || item?.title || "").trim();
  }

  // Sorting is a real reorder, not a view: the organizer shows the book, so A–Z
  // has to move the pages themselves — otherwise the tiles and the printed
  // order would disagree. Each section sorts within itself; section order is
  // the cook's own (and "Organize for me" above owns that question).
  function applyRailSort(mode: RailSortMode) {
    if (mode === railSortMode) return;
    if (mode === "title") {
      setCustomOrderUndo(structuredClone(projectMeta.meta.sections));
      projectMeta.setSectionStructure(
        sortSectionsByTitle(projectMeta.meta.sections, recipeTitleForId),
      );
      projectMeta.setRailSortMode("title");
      track("cookbook_sorted", { mode: "title" });
      showToast("Sorted A–Z");
      return;
    }
    if (customOrderUndo) projectMeta.setSectionStructure(customOrderUndo);
    setCustomOrderUndo(null);
    projectMeta.setRailSortMode("custom");
    track("cookbook_sorted", { mode: "custom" });
  }

  /**
   * A–Z is a standing choice, not a one-off action.
   *
   * It used to sort once and stop, so every recipe added afterwards landed at
   * the end of its section and every retitled one stayed where it was — the
   * book quietly stopped being alphabetical while the control still read "A–Z",
   * and the only fix was to open the organizer and pick the same sort again.
   *
   * So while the mode is on, re-apply it whenever the recipes or their titles
   * change. Committing only a CHANGED order is what keeps this from looping:
   * `setSectionStructure` writes a new array every time, which would re-run
   * this effect forever if an already-sorted book still counted as a change.
   *
   * Dragging a recipe still ends it — `markCustomOrder` puts the mode back to
   * custom, and this stops running.
   */
  useEffect(() => {
    if (railSortMode !== "title") return;
    const sorted = sortSectionsByTitle(projectMeta.meta.sections, recipeTitleForId);
    if (!sectionOrderChanged(projectMeta.meta.sections, sorted)) return;
    projectMeta.setSectionStructure(sorted);
    // `recipeTitleForId` reads `items`, so that is the dependency that carries
    // a rename; it is redeclared each render and cannot be one itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railSortMode, projectMeta.meta.sections, items]);

  // A recipe placed by hand IS the custom order — so the moment the cook drags
  // one (or moves one from the tile menu), the sort goes back to reading
  // "Custom order" and the pre-sort snapshot is spent. Leaving it on "A–Z"
  // would promise an order the book no longer has.
  function markCustomOrder() {
    if (railSortMode === "custom" && !customOrderUndo) return;
    projectMeta.setRailSortMode("custom");
    setCustomOrderUndo(null);
  }

  // The tile menu's "Move to" — the same commit a drag makes, for cooks who
  // would rather pick a section than drag across a long book. Moved recipes
  // land at the end of the receiving section, in book order.
  function moveRecipesToSection(ids: string[], sectionId: string) {
    if (ids.length === 0) return;
    markCustomOrder();
    const moving = new Set(ids);
    projectMeta.moveItems(
      ids,
      sectionId,
      itemIdsForSection(sectionId).filter((itemId) => !moving.has(itemId)).length,
    );
    track("cookbook_recipes_moved_to_section", { count: ids.length, via: "tile_menu" });
    // An untitled section has no name to say, so the toast just confirms the move.
    const title = projectMeta.meta.sections.find((section) => section.id === sectionId)?.title?.trim();
    const where = title ? ` to ${title}` : "";
    showToast(ids.length > 1 ? `Moved ${ids.length} recipes${where}` : `Moved${where}`);
  }

  /** What this page has set up on screen, as the layout half of a project's
      settings. The device shelf reads its stored equivalent instead — see
      `PrintLayoutSettings`. */
  function currentLayoutSettings(): PrintLayoutSettings {
    return {
      cardSize,
      template,
      doubleSided,
      showPhoto,
      showSourceUrl,
      showDescription,
      showCutLines,
    };
  }

  function currentProject(idOverride?: string): PrintProject | null {
    if (!cookPilotUser || !items?.length) return null;
    // Cover, front matter, kind and the book's own settings all come from the
    // working copy's metadata, and a book set aside still counts as a book on
    // the way through — see `projectContentFromMeta`, which the device shelf
    // and the PDF export read too.
    const fromMeta = projectContentFromMeta(projectMeta.meta, currentLayoutSettings());
    // A name the cook typed outranks any we would derive — the same order
    // `projectDisplayTitle` applies in the workspace bar. Without this the
    // rename lived only in session metadata: the library went on showing the
    // cover's title, and reopening the project dropped the new name entirely.
    const defaultTitle =
      projectMeta.meta.projectTitle?.trim() ||
      fromMeta.cover?.title ||
      items.find((item) => item.recipe)?.recipe?.title ||
      `Recipe cards — ${new Date().toLocaleDateString()}`;
    return assemblePrintProject({
      ...fromMeta,
      // projectMeta owns the working copy's identity. It can intentionally
      // differ from the URL after a saved cookbook is converted to cards.
      // The override wins: when leaving files this content back over an
      // earlier project, the account copy has to go to that same document or
      // the library gains the duplicate the shelf just avoided.
      id: idOverride ?? savedProjectIdRef.current ?? cookbookProjectId ?? accountProjectId,
      ownerUid: cookPilotUser.uid,
      title: defaultTitle,
      sections,
      revision: projectRevisionRef.current,
    });
  }

  /**
   * Walking away from the sign-in dialog cancels the save that opened it.
   *
   * `handleSaveProject` arms `saveAfterLoginRef` before showing the dialog, and
   * nothing disarmed it: someone who closed the dialog without making an
   * account left the intent live, so the next sign-in — for anything, any time
   * later — silently wrote that project to the account they had just declined
   * to create it for.
   */
  function cancelSaveAfterLogin() {
    saveAfterLoginRef.current = false;
  }

  /** `projectIdOverride` points this save at a specific document — used when
      leaving files the content back over the project it already was. */
  async function handleSaveProject(projectIdOverride?: string) {
    if (!cookPilotUser) {
      saveAfterLoginRef.current = true;
      setCookPilotLoginReason("default");
      setShowCookPilotLogin(true);
      return;
    }
    if (saveInFlightRef.current) {
      saveQueuedRef.current = true;
      // Which document this save was for has to wait with it. The replay below
      // used to call `handleSaveProject()` with no argument, so a save aimed at
      // a specific document — the one leaving the workspace makes, pointing the
      // account copy at the project this content already is — silently became a
      // save aimed at wherever the working copy happened to be attached.
      if (projectIdOverride) queuedSaveOverrideRef.current = projectIdOverride;
      return;
    }
    const baseProject = currentProject(projectIdOverride);
    if (!baseProject) return;
    saveInFlightRef.current = true;
    setSaveStatus("saving");
    try {
      // Every field that can hold a photo, not just the ones that were easy to
      // remember. A chapter collage defaults to its own recipes' images and a
      // recipe's photo history holds the ones it has worn before, so on a
      // Paprika book both were full of `blob:` URLs going straight into the
      // document. See `materializeProjectPhotos`.
      const { photos, uploadedRecipeImages } = await materializeProjectPhotos({
        sections: baseProject.sections,
        cover: baseProject.cover,
        backCover: baseProject.backCover,
        dedication: baseProject.dedication,
        itemPlacements: baseProject.itemPlacements,
        stashedCookbook: baseProject.stashedCookbook,
      });
      const project: PrintProject = { ...baseProject, ...photos };
      const saved = savedProjectIdRef.current
        ? await savePrintProject(project)
        : await adoptAnonymousProject(cookPilotUser.uid, project, {
            overwriteExisting: adoptionOverwriteApprovedRef.current,
          });
      projectRevisionRef.current = Number(saved.revision ?? 0);
      savedProjectIdRef.current = saved.id;
      setSavedProjectId(saved.id);
      /**
       * The photos are in Storage now, so stop treating the browser's copy as
       * the source.
       *
       * Only after the save has actually landed — the queue must not start
       * claiming a URL for a document that was never written. Before this the
       * working copy kept its `blob:` URLs forever, so every subsequent save
       * fetched, re-encoded and re-uploaded the same photos and orphaned the
       * previous objects. On a four-hundred-photo Paprika library that was the
       * whole library, per edit.
       *
       * Costs one extra autosave: the queue changing is a content change, and
       * the next pass finds nothing left to upload and settles. The content
       * document itself is not rewritten for it — the signature is unchanged,
       * so `savePrintProject` skips that half.
       */
      queue.adoptUploadedPhotos(uploadedRecipeImages);
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
        showDescription,
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
      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        const queuedOverride = queuedSaveOverrideRef.current;
        queuedSaveOverrideRef.current = undefined;
        window.setTimeout(() => latestSaveRef.current(queuedOverride), 0);
      }
    }
  }

  /**
   * Going home: put this project away, show it going, and start a fresh one.
   *
   * Three things have to happen in the right order, and the order is chosen
   * around what is safe to lose.
   *
   * The DEVICE copy is written first and synchronously, and clearing is gated
   * on it. That is what makes this safe: the desk is only wiped once the
   * project is definitely on the shelf, so a failed write (private mode, quota)
   * leaves the working copy exactly where it was rather than destroying it. The
   * homepage will try again on arrival and reach the same conclusion.
   *
   * The ACCOUNT copy is fired and deliberately not awaited. It is not
   * load-bearing — the device copy already made this safe — and waiting on a
   * network round trip before navigating would make going home feel broken on
   * a bad connection. This is a client-side navigation, so the request survives
   * it, and the existing `pagehide` flush covers a genuine tab close. A
   * signed-in cook therefore ends up with both copies, and the local one is
   * swept on the next library load.
   *
   * The FLIGHT overlaps both, so the animation costs no extra wait: by the time
   * the project has finished travelling into the profile, the writes have
   * usually already happened.
   */
  /**
   * Non-null while a click on the logo is on its way out, and it holds the line
   * to show while it is.
   *
   * Leaving clears the desk and THEN navigates, and a React render happens in
   * between — so for a beat the page re-rendered as an emptied workspace before
   * the home page arrived, which read as the recipes having been deleted rather
   * than filed. (The flight into the profile used to cover this gap; nothing
   * did once it went.) The page holds a loading state across the whole
   * departure instead.
   */
  const [leavingHome, setLeavingHome] = useState<string | null>(null);
  /** Leaving with work that only exists in this browser — see `handleNavigateHome`. */
  const [confirmLeave, setConfirmLeave] = useState(false);

  async function handleNavigateHome(options?: { confirmed?: boolean }) {
    if (leavingHome) return;

    const printable = queue.items.some((item) => item.status === "ready" && item.recipe);
    /**
     * Signed out, this project is filed to the device and nowhere else, and
     * there is no library on the way out to find it in again. Watched in a
     * session replay: an hour of editing, one click on the logo, gone.
     *
     * So ask — and make signing in the way out of the question, since that is
     * the thing that actually keeps the work.
     */
    if (printable && !cookPilotUser && !options?.confirmed) {
      setConfirmLeave(true);
      return;
    }

    // Says what the wait is FOR. Nothing is being kept when there was nothing
    // made, and claiming otherwise would be the same kind of lie the flight was.
    setLeavingHome(printable ? "Saving your recipes…" : "Going home…");
    if (!printable) {
      router.push("/");
      return;
    }

    // No flight into the profile on the way out. It was a promise the app can
    // no longer keep: it showed the project travelling to the avatar, which
    // said "this is in your projects now" — and since saving became an explicit
    // choice, leaving does not necessarily put it there. An animation that
    // answers a question wrongly is worse than one that never answered it.
    //
    // Files under the project this content already is, if it has been printed
    // before — so the account save below is pointed at the same document
    // rather than creating its own copy of it.
    const filed = fileProjectLocally(queue.items, projectMeta.meta);
    if (filed) projectMeta.setProjectId(filed);
    /**
     * Leaving does not put a draft in the account.
     *
     * This used to be `cookPilotUser && filed`, so being signed in was the
     * whole condition: print a few cards, click the logo, and a copy landed in
     * the profile of someone who never asked for one. Signing in is how you
     * reach your saved work, not a standing instruction to keep everything you
     * touch, and a library that fills itself with every Tuesday's dinner prints
     * is a log rather than a library.
     *
     * `autosaveEnabled` is the existing answer to "did the cook ask us to keep
     * this" — a cookbook, which was deliberate to create, or a project already
     * saved once. Reusing it rather than restating the condition keeps the two
     * from drifting apart. The local shelf below is unaffected: that is the
     * working copy people rely on when they reopen /print, and it never leaves
     * the device.
     */
    if (filed && autosaveEnabled) void handleSaveProject(filed);

    // Only now is the desk safe to clear — and releasing the project id is the
    // half that makes the next import a NEW project rather than another edit
    // of this one.
    if (filed) {
      queue.clear();
      projectMeta.startNewProject();
    }
    router.push("/");
  }

  // A save queued during an in-flight request must serialize the newest render,
  // not the render whose request just completed. Published in an effect (not
  // during render) so a discarded or double-invoked render can't leave a stale
  // closure behind — the same latest-ref pattern as handlePrintRef below.
  useEffect(() => {
    latestSaveRef.current = (projectIdOverride?: string) => void handleSaveProject(projectIdOverride);
  });

  // Best-effort push to Firestore when the tab is being hidden/closed, so a
  // signed-in edit still inside the 1.5s autosave debounce isn't left only in
  // the local recovery mirror until the next visit. The durable localStorage
  // mirror (lib/queue, lib/project) is the real safety net; this just narrows
  // the window where the *cloud* copy is a beat behind. Republished each commit
  // via an effect (not during render, mirroring latestSaveRef) so it closes over
  // the current book. It must never trigger the sign-in modal on the way out, and
  // must not save when nothing changed — otherwise every tab close would write
  // and could bump the revision other tabs are editing against.
  useEffect(() => {
    flushOnHideRef.current = () => {
      if (!autosaveEnabled || !projectAttachChecked) return;
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
        showDescription,
      );
      if (fp === lastSavedFingerprintRef.current) return;
      void handleSaveProject();
    };
  });

  /**
   * Which document a save conflict is actually about.
   *
   * `savedProjectId` is the obvious answer and is null for half of them: a
   * conflict raised while ADOPTING is raised precisely because this working
   * copy has no save identity yet. Reading only that state left both of the
   * cook's choices doing nothing — "load that version" fell through to the
   * overwrite it was meant to decline, and the overwrite returned early — so
   * the one prompt the app shows about losing work answered neither way.
   *
   * The working copy's own id is the destination adoption was writing to, which
   * makes it the document under discussion.
   */
  const conflictProjectId = savedProjectId ?? cookbookProjectId;

  /**
   * Conflict recovery. Two tabs on one project, or a toggle in one while the
   * other saves, and the second write finds a revision it didn't expect.
   *
   * "Save as a copy" used to be the fallback here, and on a PURCHASED cookbook
   * that was a way to lose what you paid for: the entitlement hangs off the
   * project id, so a copy under a fresh id is a locked book, and the paid one
   * is left behind under a name the cook is no longer looking at. A purchase
   * is never worth forking around, so a paid book overwrites instead —
   * re-reading the remote revision first, since retrying with the stale one
   * conflicts again forever.
   */
  async function resolveConflictByOverwriting() {
    if (!cookPilotUser || !conflictProjectId) return;
    setSaveStatus("saving");
    try {
      // The remote revision is the only thing this needs; overwriting replaces
      // the content wholesale, so fetching it first would be a megabyte read
      // whose result is discarded a line later.
      const remote = await loadPrintProjectHead(cookPilotUser.uid, conflictProjectId);
      projectRevisionRef.current = Number(remote?.revision ?? 0);
      lastAttemptedFingerprintRef.current = null;
      // A conflict raised by ADOPTION leaves no save identity to advance — not
      // having one is what sent the save down that path — so the retry goes
      // back through adoption and needs the cook's answer carried with it.
      // Without this it would meet the same refusal and the choice they just
      // made would do nothing at all.
      adoptionOverwriteApprovedRef.current = true;
      await handleSaveProject();
    } catch (error) {
      console.warn("RecipePrinter: could not resolve the save conflict", error);
      setSaveStatus("error");
    } finally {
      adoptionOverwriteApprovedRef.current = false;
    }
  }

  function handleRetrySave() {
    if (saveStatus !== "conflict") {
      void handleSaveProject();
      return;
    }
    // A cookbook is never forked, purchased or not.
    //
    // The fallback here used to be "save your current edits as a copy", which
    // mints a fresh project id — a second cookbook in the library holding the
    // same recipes, and, if the book was paid for, an unlocked original left
    // behind under a name the cook is no longer looking at. Now that a cookbook
    // autosaves from its first edit AND every mode toggle writes, conflicts are
    // far easier to hit than they used to be, so this fork is the one path that
    // can quietly multiply a book. Overwrite instead: re-read the remote
    // revision, then write the edits in front of the cook on top of it.
    if (isCookbookDocument) {
      const loadNewer = window.confirm(
        `${
          cookbookMode ? "This cookbook" : "This project"
        } was updated in another tab. Choose OK to load that version, or Cancel to keep the edits in front of you and overwrite it.`,
      );
      if (loadNewer && conflictProjectId) {
        window.location.assign(`/print?project=${encodeURIComponent(conflictProjectId)}`);
        return;
      }
      void resolveConflictByOverwriting();
      return;
    }
    const loadNewer = window.confirm(
      "This project was updated elsewhere. Choose OK to load that newer version, or Cancel to save your current edits as a copy.",
    );
    if (loadNewer && conflictProjectId) {
      window.location.assign(`/print?project=${encodeURIComponent(conflictProjectId)}`);
      return;
    }
    const copyId = createPrintProjectId();
    projectRevisionRef.current = 0;
    savedProjectIdRef.current = null;
    setSavedProjectId(null);
    projectMeta.setProjectId(copyId);
    setSaveStatus(null);
  }

  /**
   * The save that was waiting on an account, once there is one — and once we
   * know what that account already holds.
   *
   * This used to fire the save straight off the uid changing, and it is
   * declared above the reattach effect, so it ran while `savedProjectIdRef` was
   * still null on a book the account had saved all along. That sends the save
   * down the adoption path, which replaces the destination document rather than
   * writing against its revision: the one moment in the product where somebody
   * is signing in specifically to keep their work was also the one that wrote
   * over the copy they were signing in to reach.
   *
   * `projectAttachChecked` is the existing answer to "has this working copy
   * been matched to its saved document yet", and waiting on it turns the
   * first-save-after-login into an ordinary save against a known revision.
   * Signed out the reattach effect leaves it unset rather than claiming a check
   * it never made, so the `true` this waits for is always an answer about the
   * account that has just arrived.
   *
   * A `?project=` URL is the one case this does not cover: identity there
   * belongs to the loader above, which sets the flag before it has finished.
   * The refusal in `adoptAnonymousProject` is what catches that one, and it
   * surfaces as the conflict prompt rather than as a silent replacement.
   */
  useEffect(() => {
    if (!cookPilotUser || !projectAttachChecked || !saveAfterLoginRef.current) return;
    saveAfterLoginRef.current = false;
    void handleSaveProject();
    // The uid, not the User object — Firebase replaces that object on every
    // token refresh, and this should fire on signing in, not hourly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotUser?.uid, projectAttachChecked]);

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
    cookPilotUser,
    cookbookMode: Boolean(projectMeta.meta.cookbookMode),
    projectId: cookbookProjectId,
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
    await printNow();
  }

  function openCookbookPrintDialog() {
    track("cookbook_print_options_shown", { preset: activePreset.id });
    track("cookbook_ready_shown", { freshPurchase: cookbookJustPurchased });
    setShowCookbookPrintDialog(true);
  }

  /**
   * Chosen a format on the "Save your cookbook" screen: render it server-side
   * and hand back the finished file.
   *
   * This used to flip on the format's print geometry and fire `window.print()`,
   * which meant the export's correctness depended on the cook picking "Save as
   * PDF" in a dialog we cannot influence — send it to a printer instead and
   * every page comes back rescaled, because the book bleeds to the sheet edge
   * and printers reserve an unprintable margin. There is no dialog now and
   * nothing to pick. The dialog stays open so another format is one click away.
   */
  async function exportCookbookAs(presetId: CookbookPresetId, coverSheet?: CoverSheetSpec) {
    projectMeta.setCookbookPreset(presetId);
    track("cookbook_preset_selected", { preset: presetId });
    const project = currentExportProject();
    if (!project) return;
    setCookbookExportError(null);
    setCookbookExportNeedsAuth(false);
    setCookbookExportNeedsAccount(false);
    setExportingPreset(presetId);
    setLastCookbookExport(null);
    try {
      const files = await downloadCookbookPdf(
        project,
        presetId,
        cookbookPdfFileName(projectMeta.meta.cover?.title, presetId),
        coverSheet,
      );
      setLastCookbookExport({ presetId, files });
      track("cookbook_exported", { preset: presetId, files: files.length });
    } catch (error) {
      setCookbookExportError(
        error instanceof CookbookPdfError
          ? error.message
          : "The cookbook couldn't be exported. Try again.",
      );
      setCookbookExportNeedsAuth(error instanceof CookbookPdfError && error.needsAuth);
      setCookbookExportNeedsAccount(error instanceof CookbookPdfError && error.needsAccount);
    } finally {
      setExportingPreset(null);
    }
  }

  /**
   * The book, as the renderer needs it. Deliberately `assemblePrintProject` —
   * the same builder the autosave uses — so the exported PDF is assembled from
   * exactly the object that gets saved, and the two can't describe different
   * books. Unlike `currentProject` it does not require being signed in: someone
   * who paid for a cookbook should not meet a sign-in wall on the way to
   * downloading it.
   */
  function currentExportProject(): PrintProject | null {
    if (!items?.length) return null;
    /**
     * Two fields the SAVE carries and a render must not, dropped here by name
     * rather than by having been forgotten — which is what they were before
     * this read `projectContentFromMeta` alongside the save.
     *
     * `stashedCookbook` is an entire second book. The renderer never draws it,
     * and sending it means uploading every set-aside recipe over two hops to
     * print a book that does not contain them (the same reasoning
     * `coverWrapProject` gives for stripping it again).
     *
     * `projectTitle` is the library's name for this project, not the book's.
     * What goes on the cover is the cover's own title, which is what `title`
     * below passes.
     */
    const { stashedCookbook: _setAside, projectTitle: _libraryName, ...fromMeta } =
      projectContentFromMeta(projectMeta.meta, currentLayoutSettings());
    return assemblePrintProject({
      ...fromMeta,
      id: cookbookProjectId,
      ownerUid: cookPilotUser?.uid ?? "",
      title: fromMeta.cover?.title,
      sections,
      // This export IS the book, whatever the live view is set to. A cook who
      // switched to recipe cards and then exported the stashed book still gets
      // a book.
      kind: "cookbook",
      settings: { ...fromMeta.settings, cookbookMode: true },
    });
  }

  function handleMobilePrint() {
    setMobileDrawer(null);
    void handlePrint();
  }

  // The Print button is only truly *disabled* while a purchase is settling —
  // there's a real async operation the click can't preempt. It is NOT disabled
  // for a measuring layout: a click then is queued (see `printPending`), so the
  // button stays live and just shows a spinner until the layout is ready.
  /**
   * Would a print right now produce something that hasn't been paid for?
   *
   * Drives the print-time watermark (see `.rp-print-locked` in print.css). Both
   * paywalls used to stop at a button label, and the deck on screen is what a
   * browser print captures — so Cmd-P produced the finished article from either
   * a locked premium theme or an unpurchased cookbook. Nothing about the
   * on-screen preview changes; this only marks the paper.
   */
  const printWatermarked = templateLocked || cookbookLocked;

  /**
   * What the header calls this project. Inherits the cookbook's cover title
   * unless it has been renamed, and falls back to the recipes themselves —
   * "Banana Bread + 2 more" tells you which project this is, and "Recipe cards"
   * does not.
   */
  const firstRecipeTitle = items?.find((item) => item.recipe)?.recipe?.title;
  const headingTitle = projectDisplayTitle(
    projectMeta.meta,
    firstRecipeTitle,
    Math.max((items?.length ?? 0) - 1, 0),
  );

  const printBlocked = purchaseBusy || claimBusy || cookbookPurchaseBusy;
  // `printAwaitingBrowser` is the second or so between asking to print and
  // knowing whether the browser took it. Nothing is on screen during that gap
  // when the answer turns out to be no, and a button that looks untouched is
  // what a refused print has always looked like.
  const printSpinner = printBlocked || printPending || printAwaitingBrowser;

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

  /**
   * Show the loading state the moment a DIFFERENT project is asked for.
   *
   * `projectLoading` is seeded from `useState(Boolean(accountProjectId))`,
   * which only runs when this page mounts. Opening a project from the account
   * menu while already on /print is a client-side navigation: the query
   * changes, the component does not remount, and the initialiser never runs
   * again. So the deck went on painting the project already open until the
   * load below finished and swapped it — the flash of the wrong book.
   *
   * Keyed on the id rather than on a boolean, so re-landing on the project
   * that is already open stays quiet instead of flashing a loader at someone
   * who is already looking at what they asked for.
   */
  /**
   * Whether an import was waiting for this page when it mounted.
   *
   * A lazy `useState` initializer, so it is answered on the first render and
   * never changes afterwards: the effect below consumes the payload, and a
   * value that flipped back to false at that moment would pull the workspace
   * out from under the recipes it had just let in.
   */
  const [importInbound] = useState(() => hasPendingImport());

  const loadedProjectIdRef = useRef<string | null>(accountProjectId);
  useEffect(() => {
    if (!accountProjectId) return;
    if (loadedProjectIdRef.current === accountProjectId) return;
    loadedProjectIdRef.current = accountProjectId;
    setProjectLoading(true);
  }, [accountProjectId]);

  /**
   * Which project's recipes are actually sitting in the deck right now.
   *
   * `projectLoading` above cannot answer this on its own, because an effect
   * runs AFTER the commit it belongs to: for the one render between the URL
   * changing and that effect firing, the page is asked for project B while
   * still holding project A's content and still believing it is not loading.
   * The browser is free to paint that render, and it does — the flash.
   *
   * What it flashes depends on what was open. Switching books, it is a frame
   * of the previous book; arriving from a workspace with nothing in it, `items`
   * is `[]` and it is a frame of the empty state, which reads as "your cookbook
   * is gone" for exactly as long as the load takes.
   *
   * So the deck's identity is compared during RENDER, where there is no gap to
   * paint into. The ref advances in `applyProject`, when content genuinely
   * arrives — not when the load is merely requested, or the same frame would
   * be uncovered again one step later.
   */
  const appliedProjectIdRef = useRef<string | null>(null);
  const projectContentPending =
    Boolean(accountProjectId) && appliedProjectIdRef.current !== accountProjectId;

  useEffect(() => {
    if (!accountProjectId || !cookPilotAuthReady || !projectMeta.hydrated || !queue.hydrated) return;

    /**
     * A book filed on this device by leaving the workspace (lib/localProjects).
     * Consulted whether or not anyone is signed in, because a book on the shelf
     * belongs to the browser, not to an account — which is the whole reason the
     * shelf exists.
     */
    const shelved = loadLocalProject(accountProjectId);

    /**
     * Loads a project into the working copy.
     *
     * `source` decides what happens to the SAVE identity afterwards, which is
     * the only way the two sources differ:
     *
     *  - `account` — this document already exists in Firestore under this id, so
     *    adopt its revision and identity and start from a clean "Saved" state.
     *  - `shelf` — it doesn't exist in any account yet, so leave the save
     *    identity unset. For a signed-in cook that means the next autosave takes
     *    the ADOPTION path (`adoptAnonymousProject`), which migrates the book's
     *    anonymous photo assets and re-keys its cookbook unlock — exactly what
     *    moving a device-local book into an account has to do. Deliberately no
     *    `"__loaded__"` sentinel either: that sentinel exists to stop a freshly
     *    loaded account document re-saving itself unchanged, and here the save
     *    is the point. Opening a shelved book while signed in files it to the
     *    account, which is the product's rule for cookbooks.
     */
    const applyProject = (project: PrintProject, source: "account" | "shelf") => {
        // The deck now holds this project. Read during render to keep the
        // previous project (or an empty workspace) off screen until here.
        appliedProjectIdRef.current = accountProjectId;
        const loadedItems = project.sections.flatMap((section) => section.items);
        queue.replaceAll(loadedItems);
        setJobIds(loadedItems.map((item) => item.id));
        projectMeta.replaceMeta({
          projectId: project.id,
          // Absent on documents saved before renames were persisted, which is
          // exactly right: those never had one.
          projectTitle: project.projectTitle,
          cookbookMode: project.settings.cookbookMode ?? project.kind === "cookbook",
          cookbookWelcomeCompleted: project.settings.cookbookWelcomeCompleted,
          cookbookPreset: project.settings.bookPreset,
          tableOfContents: project.settings.tableOfContents,
          sectionDividers: project.settings.sectionDividers,
          tocKicker: project.settings.tocKicker,
          tocTitle: project.settings.tocTitle,
          photoStyle: project.settings.photoStyle,
          railSortMode: project.settings.railSortMode,
          cover: project.cover,
          backCover: project.backCover,
          dedication: project.dedication,
          frontMatter: project.frontMatter,
          itemPlacements: project.itemPlacements,
          // Restores a book this project set aside, so the Cookbook toggle
          // brings it back instead of scaffolding a fresh one over it.
          stashedCookbook: project.stashedCookbook,
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
        setShowDescription(project.settings.showDescription ?? true);
        setShowCutLines(project.settings.showCutLines);
        if (source === "account") {
          projectRevisionRef.current = Number(project.revision ?? 0);
          savedProjectIdRef.current = project.id;
          setSavedProjectId(project.id);
          lastSavedFingerprintRef.current = "__loaded__";
          setSaveStatus("saved");
        }
    };

    // Signed out there is no account to ask, so the shelf is the only answer
    // available — and for a book built or bought while signed out, it is the
    // right one. Only when the shelf has nothing either is "sign in" the honest
    // thing to say.
    if (!cookPilotUser) {
      if (shelved) {
        applyProject(shelved, "shelf");
        setProjectLoading(false);
        setProjectAccess(null);
        return;
      }
      setProjectLoading(false);
      setProjectAccess("needs-auth");
      return;
    }

    let cancelled = false;
    setProjectLoading(true);
    setProjectAccess(null);
    loadPrintProject(cookPilotUser.uid, accountProjectId)
      .then((project) => {
        if (cancelled) return;
        // The account copy is authoritative when it exists; the shelf is the
        // fallback for a book that hasn't been adopted into this account yet.
        if (project) {
          applyProject(project, "account");
          return;
        }
        if (shelved) {
          applyProject(shelved, "shelf");
          return;
        }
        setProjectAccess("missing");
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("RecipePrinter: could not open project", error);
        /**
         * A failed read is the absence of an answer, not proof the account
         * lacks the book — so this must NOT fall back to the shelf.
         *
         * It used to, on the reasoning that showing a copy we are holding beats
         * showing an error page about it. The reasoning was right about what a
         * cook wants to see and wrong about what the fallback does, because
         * this page has no way to show a shelved book without also arming a
         * write of it. `applyProject(…, "shelf")` deliberately leaves the save
         * identity unset, which routes the next autosave — and there is always
         * a next autosave, within 1.5s, with no edit required — through
         * `adoptAnonymousProject`, which takes the destination's revision
         * rather than checking it and therefore cannot conflict.
         *
         * So the old fallback spent a transient failure replacing a book edited
         * on another device with whatever this one last filed on its way out.
         * A book edited on a laptop and then opened on a phone with one bar is
         * the whole scenario.
         *
         * The `failed` screen below already says the true thing ("Your project
         * is safe, so it's worth another try") and its action is a reload,
         * which is a real fix for a read that failed once. The shelf copy is
         * untouched on disk and still listed in /projects either way.
         */
        setProjectAccess("failed");
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

  // A working copy keeps its project id in session/local storage, but only the
  // ?project= loader above knows that id already has a saved document behind it.
  // Arriving on /print without the param — the workspace's Print button, a
  // reload, a return visit — therefore left `savedProjectIdRef` null on a book
  // that was already saved, and the next autosave took the adoption path. So
  // reattach to the existing document before any save can run.
  useEffect(() => {
    if (accountProjectId) {
      setProjectAttachChecked(true);
      return;
    }
    if (!cookPilotAuthReady || !projectMeta.hydrated) return;
    // Signed out there is nothing to attach to, and — this is the part that
    // matters — nothing has been checked. Claiming otherwise used to leave the
    // flag standing at `true` from the signed-out session, so the save that
    // fires on signing in read a check belonging to no account and went ahead
    // without one. Every consumer of this flag is already paired with a
    // signed-in test, so leaving it unset here costs nothing and makes signing
    // in wait for its own answer.
    if (!cookPilotUser) return;
    if (savedProjectIdRef.current) {
      setProjectAttachChecked(true);
      return;
    }
    let cancelled = false;
    // Identity and revision only — the local copy is the newer draft here, so
    // its content must still autosave up to the document it belongs to. This
    // used to call `loadPrintProject`, which meant fetching the entire book to
    // read two numbers and throw the rest away, on every signed-in load of the
    // app's main screen.
    loadPrintProjectHead(cookPilotUser.uid, cookbookProjectId)
      .then((head) => {
        if (cancelled || !head) return;
        projectRevisionRef.current = head.revision;
        savedProjectIdRef.current = head.id;
        setSavedProjectId(head.id);
      })
      .catch((error) => {
        console.warn("RecipePrinter: could not match the working copy to a saved project", error);
      })
      .finally(() => {
        if (!cancelled) setProjectAttachChecked(true);
      });
    return () => {
      cancelled = true;
    };
    // projectMeta.hydrated gates the id; the hydration methods themselves are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountProjectId, cookPilotAuthReady, cookPilotUser?.uid, projectMeta.hydrated, cookbookProjectId]);

  useEffect(() => {
    if (accountProjectId || !queue.hydrated) return;
    // Read the already-hydrated in-memory queue rather than re-reading (and
    // re-parsing) sessionStorage — the hook hydrated it from the same source on
    // mount. `queue.items` is read as a one-shot snapshot at hydration (and on
    // any ?ids= change), NOT a reactive dependency: re-running on every parse
    // would reset `initialQueueIdsRef` and clobber the merged/edited selection.
    const fullQueue = queue.items;
    initialQueueIdsRef.current = new Set(fullQueue.map((it) => it.id));
    const byId = new Map(fullQueue.map((it) => [it.id, it]));
    const idsFromUrl = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const ids =
      (idsFromUrl.length > 0 ? idsFromUrl : readCurrentPrintJobIds()) ??
      fullQueue.filter((it) => it.status === "ready").map((it) => it.id);
    // Preserve the order from the current print job, keeping only ids that
    // resolve to a ready recipe — the same set `items` would project.
    const printIds = ids.filter((id) => {
      const it = byId.get(id);
      return Boolean(it && it.status === "ready" && it.recipe);
    });
    setJobIds(printIds);
    // queue.items is read as an intentional snapshot (see above), not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountProjectId, idsParam, queue.hydrated]);

  /**
   * Capture → app handoff: finish the import a visitor started on a landing page.
   *
   * This used to happen on the home page, which is where the SEO capture blocks
   * pushed to. It lands here now because this is where the recipe becomes a
   * thing you can look at: the same paste used to arrive as a row in a list with
   * a Clear all over it, on a page that empties itself on arrival, which taught
   * brand-new visitors that the app holds a cart before it had shown them a
   * single printed card.
   *
   * Deliberately declared AFTER the job bootstrap above, and gated on the same
   * `queue.hydrated`, so effects run in that order: the bootstrap snapshots
   * `initialQueueIdsRef` from the hydrated queue first, which is what makes the
   * item this adds afterwards read as `isOursToAwait`. Get that the wrong way
   * round and the import is born already excluded, and never shows a placeholder
   * or a page.
   *
   * Consumed exactly once per mount, and consume-and-delete at the storage layer
   * (see lib/pendingImport), so a refresh can't re-import.
   *
   * On the home page this raced the mount-clear, and only a ref ordering kept
   * the two apart. Nothing here clears anything, so there is no race left.
   */
  useEffect(() => {
    if (!queue.hydrated || consumedPendingImportRef.current) return;
    consumedPendingImportRef.current = true;
    let cancelled = false;
    void takePendingImport().then((pending) => {
      if (cancelled || !pending) return;
      if (pending.kind === "url") queue.addUrl(pending.url);
      else if (pending.kind === "text") queue.addText(pending.text);
      else if (pending.kind === "ready") queue.addReadyRecipes(pending.recipes);
      // Files, not data URLs: the decode now happens HERE, inside `runParse`,
      // so the placeholder row goes up first and the photo is worked on in
      // front of the cook instead of behind a spinner on the page they left.
      else if (pending.kind === "imageFiles") queue.addImageFiles(pending.files, pending.label);
      else if (pending.kind === "images") queue.addImages(pending.images, pending.label);
    });
    return () => {
      cancelled = true;
    };
    // The queue's add methods are stable; `hydrated` is the only real trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queue.hydrated]);

  /**
   * Which projects write themselves to the account, without being asked.
   *
   * Signed in, a cookbook always does — like Figma or Canva, where the
   * deliberate act was creating the file and every edit after it is edits to a
   * thing you already said you wanted. Clicking through the offer screen and
   * watching the book build IS that act, so there is no Save button in a
   * cookbook at all.
   *
   * Recipe cards never do. A print job is not a document: nobody named it,
   * nobody asked to keep it, and filing every Tuesday's dinner prints would
   * turn the library into a log. Reopening /print restores the working copy
   * from local storage anyway, which is the part people actually rely on.
   *
   */
  /**
   * Whether this project exists in the account — not merely whether someone is
   * signed in. `savedProjectId` is set by a save, by adopting an anonymous
   * draft, and by opening a project from the profile; it is null for a draft
   * nobody has kept yet.
   *
   * Two things hang off it. The bar shows the project's NAME only once there is
   * a project to name (until then the name is a stand-in derived from the first
   * recipe, and renaming it would change something nothing remembers). And
   * saving becomes automatic: once a copy exists, every later edit belongs to
   * it, and asking someone to press Save again to keep a book they already told
   * us to keep is asking them to do our bookkeeping.
   */
  const savedToProfile = Boolean(cookPilotUser) && savedProjectId !== null;

  // Cookbooks autosave from the first edit — a book is by nature a thing you
  // come back to — and everything else joins them the moment it is saved once.
  const autosaveEnabled = Boolean(cookPilotUser) && (isCookbookDocument || savedToProfile);

  useEffect(() => {
    if (projectLoading || !projectAttachChecked || !items?.length) return;
    // A draft nobody asked to keep. The status this project does show is the
    // draft effect's business, below.
    if (!autosaveEnabled) return;
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
        showDescription,
      );
    if (lastSavedFingerprintRef.current === "__loaded__") {
      lastSavedFingerprintRef.current = fingerprint();
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
    // Was missing, and the fingerprint reads it: toggling the website blurb on
    // or off changed what a save WOULD write while leaving nothing to notice
    // the change, so that setting alone never triggered an autosave. It rode
    // along silently with the next unrelated edit, or was lost with the tab.
    showDescription,
    projectLoading,
    projectAttachChecked,
    autosaveEnabled,
    saveStatus,
  ]);

  // Nothing is writing this project, so the header has no business reporting on
  // it — and a stale "Saved" after signing out would be a lie. Clearing is also
  // what puts the Save button back.
  useEffect(() => {
    if (!autosaveEnabled && saveStatus) setSaveStatus(null);
  }, [autosaveEnabled, saveStatus]);

  useEffect(() => {
    const online = () => {
      if (saveStatus === "offline") void handleSaveProject();
    };
    const offline = () => {
      if (autosaveEnabled) setSaveStatus("offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus, autosaveEnabled]);

  // Flush a pending save when the tab goes away. `pagehide` is the reliable
  // teardown signal (fires on close/navigation, and on mobile bfcache freeze);
  // `visibilitychange` → hidden covers backgrounding the tab/app, which on
  // mobile is often the last callback before the page is discarded. Registered
  // once — the work is delegated to flushOnHideRef, which always holds the
  // current book.
  //
  // The cleanup flushes too, and that case is not covered by either event.
  // Every in-app exit from this page — the header logo, "Back to your recipes",
  // a link to /projects — is a client-side `next/link` navigation, which fires
  // NEITHER `pagehide` NOR `visibilitychange`: the document never goes away, only
  // this component does. So the one exit route people actually take was the one
  // route that never flushed, and an edit made inside the 1.5s autosave debounce
  // was dropped on the way out. Unmounting is itself a teardown — the same
  // reasoning (and the same fix) as the meta-write flush in lib/project.ts.
  //
  // Safe to fire on every unmount: `flushOnHideRef` no-ops unless autosave is on
  // and the fingerprint actually differs from the last saved one, and the request
  // it starts is not tied to this component's lifetime, so it completes after the
  // page is gone.
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
      flush();
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
        isOursToAwait(item.id) &&
        !(items ?? []).some((existing) => existing.id === item.id),
    );
    if (newlyReady.length === 0) return;
    setJobIds((current) => [...(current ?? []), ...newlyReady.map((item) => item.id)]);
    if (pendingAddSectionId && sections.some((section) => section.id === pendingAddSectionId)) {
      const insertAt = pendingAddIndex ?? itemIdsForSection(pendingAddSectionId).length;
      newlyReady.forEach((item, offset) => {
        moveProjectItem(item.id, pendingAddSectionId, insertAt + offset);
      });
    }
    setPendingFocusRecipeId((current) => current ?? newlyReady[0]!.id);
    setSettlingIds(new Set(newlyReady.map((item) => item.id)));
  }, [queue.items, items, itemIdsForSection, isOursToAwait, moveProjectItem, pendingAddIndex, pendingAddSectionId, sections]);

  // Held just long enough for the animation to finish. A lingering class would
  // replay it on the next render the element happens to survive.
  useEffect(() => {
    if (settlingIds.size === 0) return;
    const timer = window.setTimeout(() => setSettlingIds(new Set()), 500);
    return () => window.clearTimeout(timer);
  }, [settlingIds]);

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

  /* The Recipe cards / Cookbook segmented control lived here and is gone.
     It put a MODE control where navigation goes, and once the header started
     naming the open document the two answered "where am I?" differently — a
     book called "Grandma's Book" with a switch beside it insisting the answer
     was "Cookbook". Worse, a segmented control implies two views of one thing,
     and a free print job and a paid document with a cover, chapters and an
     owner are not that.

     Both halves are now what they always were — actions — and live with the
     other actions in the print panel: the kind control creates, "Print as
     recipe cards instead" leaves. Creating a SEPARATE book is "New cookbook" in
     the library. The header is left to say which document you're in and let you
     get back to the rest of them. */

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
              hint="Longer recipes print on the back too."
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
    /* "Include" said nothing: everything in a settings panel is something you
       are choosing to include. These two both add a PAGE to the book, and the
       recipe link that used to sit under them with them did not — it moved to
       the group that changes every recipe. */
    return (
      <CheckboxGroup label="Extra pages" className="recipe-config-section recipe-config-section--settings">
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
      </CheckboxGroup>
    );
  }

  // "New cookbook" was chosen back in the library. Honour it here, on arrival —
  // otherwise the cook lands in recipe cards after explicitly asking for a
  // cookbook and has to go find the switch.
  //
  // Deliberately does NOT wait for recipes. It used to, because the library
  // sent an empty-handed cook to the importer first and this was the far side
  // of that detour; the detour is gone (see `startNew` in app/projects/page.tsx)
  // and the book is now scaffolded the moment it is asked for, empty or not. A
  // book with no recipes in it is not a broken state — it is a cover, a
  // dedication and a back cover, which is exactly what someone starting a
  // cookbook wants to see.
  //
  // `items === null` is the job still hydrating, not an empty one; scaffolding
  // then would fire before a saved book's own `cookbookMode` had arrived and
  // rebuild over it. Consumed first so a failed scaffold can't loop, and so
  // returning to this project later doesn't re-scaffold over their work.
  useEffect(() => {
    if (!projectMeta.meta.cookbookIntent) return;
    if (items === null || projectLoading || projectMeta.meta.cookbookMode) return;
    projectMeta.clearCookbookIntent();
    // `beginCookbookBuild`, not `startCookbook`: the latter opens the offer
    // dialog for anyone who hasn't seen it, and pitching the cookbook to
    // someone who just clicked "New cookbook" is asking a question they have
    // already answered.
    beginCookbookBuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectMeta.meta.cookbookIntent, projectMeta.meta.cookbookMode, items === null, projectLoading]);

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
    // Same again: keyed on the uid, so a token refresh does not re-read the
    // profile document for an account that has not changed. /projects already
    // keys its account effects this way and documents why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotUser?.uid]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  // The way back to deleted lines lives on their toast, so it goes when the
  // toast does — an Undo that outlives the message it belongs to would put a
  // section back under a cook who has moved on to something else.
  useEffect(() => {
    if (!toastMessage?.startsWith("Deleted ")) setLineDeleteUndo(null);
  }, [toastMessage]);

  useEffect(() => {
    function handleBeforePrint() {
      // The browser has taken the print. Two things follow from that: the
      // watchdog in `printNow` has its answer, and this document has now spent
      // the one print a phone browser will give it (see lib/printRearm), so the
      // next one has to come from a fresh load. `beforeprint` rather than
      // `afterprint` because it is the hook that fires for the user's own ⌘P
      // too, and that spends the document just the same.
      printAcceptedRef.current = true;
      markPrintSpent();
      clearPrintRetryMarker();
      // Synchronous on purpose: window.print() does not yield, so a normal
      // state update would not have committed before the snapshot is taken.
      //
      // This is now the Ctrl+P path rather than the usual one. Our own Print
      // button renders the full deck BEFORE it calls `print()`, so the spinner
      // can be on screen while that happens (see `printNow`) — by the time this
      // runs the flag is already true and React bails out of the update, so the
      // book is rendered once, not twice. What this still owns is the print
      // nobody asked us about: a cook pressing Ctrl+P gives us no click to hang
      // the preparation off, and a windowed deck would print placeholders.
      flushSync(() => setRenderAllPages(true));
    }
    window.addEventListener("beforeprint", handleBeforePrint);
    return () => window.removeEventListener("beforeprint", handleBeforePrint);
  }, []);

  useEffect(() => {
    function handleAfterPrint() {
      // Belt and braces for an engine that skips `beforeprint`: reaching here
      // at all means the print was real, so the watchdog must not call it
      // refused.
      printAcceptedRef.current = true;
      markPrintSpent();
      setRenderAllPages(false);
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

  // The photo-placement fields of a section opener's `dividerEdit`, shared by
  // both deck call sites (spread deck + single-page deck) so the two can never
  // drift. Drives the unified ImagePicker: the same None/In-card/Full-page row as
  // a recipe. A collage is NOT a top-level choice — under Full page the cook can
  // toggle the single facing photo into a grid of this chapter's own photos
  // (scoped to the section, not the whole-book candidates).
  const buildSectionPhotoEdit = (
    section: Section | undefined,
    // Where this picker is being rendered. The "Photo" button belongs ON the art
    // it changes: in the opener card when the opener shows the photo, and on the
    // facing page when the art lives there (`art`) — so a full-page or collage
    // chapter is edited by clicking the picture, not a button on the page next
    // to it. Everything else about the dialog is identical either way.
    surface: "opener" | "art" = "opener",
  ) => {
    const mode = resolveSectionPhotoMode(section ?? {}, photoStyle);
    const ownImages = section ? sectionRecipeImages(section) : [];
    const isGrid = mode === "grid";
    // A grid the BOOK chose behaves exactly like one the cook picked: the same
    // photos, already ticked, with "Select multiple" on — so the dialog opens on
    // a real selection they can add to or pare back.
    const gridImages = section?.gridImages?.length
      ? section.gridImages
      : defaultSectionGridImages(ownImages);
    return {
      photoUrl: section?.photoUrl,
      recipeImages: ownImages,
      // A single photo tile is only pickable in band / single Full-page mode
      // (grid has its own multi-select, none has no tiles) — keep the current
      // placement and set the one photo it names.
      onPhotoChange:
        surface === "art" || mode === "band"
          ? (url: string | undefined) => {
              if (!section) return;
              projectMeta.setSectionPhotoMode(section.id, mode === "band" ? "band" : "full", {
                photoUrl: url,
              });
            }
          : undefined,
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
          ? () => projectMeta.setSectionPhotoMode(section.id, "grid", { gridImages })
          : undefined,
      onExitGrid: section
        ? () =>
            projectMeta.setSectionPhotoMode(section.id, "full", {
              photoUrl: section.photoUrl ?? section.gridImages?.[0] ?? ownImages[0],
            })
        : undefined,
      // Pinning the tiles the moment one is toggled turns a defaulted collage
      // into the cook's own, which is what un-ticking a photo means.
      gridImages,
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
    const sectionId = projectMeta.addSection("New chapter");
    ids.forEach((id, index) => moveProjectItem(id, sectionId, index));
    clearRailSelection();
    setEditingSectionId(sectionId);
    setEditingSectionTitle("New chapter");
    setPendingFocusNavId(sectionId);
    track("cookbook_section_created_from_selection", { count: ids.length });
  }
  // Set one recipe's photo mode. Picking the book default clears the override so
  // the page keeps following the book; anything else pins an explicit choice.
  // The recipe usually moves to a different page (its full-page photo appears or
  // vanishes), so follow it there and keep it selected — and, if we're mid-edit,
  // keep it in edit mode across the jump.
  /**
   * A placement chosen for a recipe that has no photo yet, as a counter the
   * card's picker watches. Choosing "In card" or "Full page" IS the request
   * for a photo — the placement on its own points at nothing, and the cook is
   * left to find the small button that would have supplied one. The counter
   * rather than a boolean so choosing the same placement twice still opens it.
   */
  const [photoDialog, setPhotoDialog] = useState<{ key: string; tick: number } | null>(null);
  /**
   * Open the photo dialog for one page from outside it.
   *
   * The dialog belongs to the toolbar button now, so everything else that
   * should open it — double-clicking the picture, or choosing a placement for a
   * recipe that has no photo yet — asks through here rather than growing a
   * second copy of the dialog. A counter rather than a boolean, so asking twice
   * in a row still opens it.
   */
  function openPhotoDialog(key: string) {
    setPhotoDialog((current) =>
      current?.key === key ? { key, tick: current.tick + 1 } : { key, tick: 1 },
    );
  }
  const photoDialogSignal = (key: string) =>
    photoDialog?.key === key ? photoDialog.tick : undefined;

  function setRecipePhotoMode(recipeId: string, mode: PhotoStyle) {
    if (showEmptyFields && activeRecipeId === recipeId) keepEditingRef.current = recipeId;
    setPendingFocusRecipeId(recipeId);
    const image = items?.find((item) => item.id === recipeId)?.recipe?.image;
    if (mode !== "none" && !image) {
      openPhotoDialog(recipeId);
    }
    // Clearing the override lets the page follow the book — but only when the
    // book default would actually RESOLVE to the mode just chosen. "Full page"
    // falls back to a plain card for a recipe with no photo yet (see
    // `cookbookResolution`), so clearing here snapped the choice straight back
    // to None: the one placement you might pick in order to add a photo was
    // the one placement you could not pick until you had one.
    if (mode === photoStyle && (mode !== "full" || image)) {
      projectMeta.setItemPlacement(recipeId, undefined);
      return;
    }
    const hero = mode === "full" ? image : undefined;
    projectMeta.setItemPhotoMode(recipeId, mode, hero);
  }
  // The per-recipe photo placement toggle (cookbook): an always-present
  // None / In-card / Full-page switch that sits next to the Edit button, so
  // placement is one click away in every mode (not only when the photo is off).
  // The floating "Photo" button on the page still opens the fuller dialog
  // (placement + which photo). Shared desktop + mobile.
  const renderPagePhotoControl = (recipeId: string) => {
    const recipe = items?.find((item) => item.id === recipeId && item.recipe)?.recipe;
    // Every recipe page, photo or not. This used to bail on `!recipe.image`,
    // which hid the placement switch from exactly the recipes whose placement
    // you might want to set before finding a photo for them — and left the
    // toolbar looking as though the control had been taken out.
    if (!recipe) return null;
    const own = recipe.image;
    const history = projectMeta.meta.itemPlacements?.[recipeId]?.photoHistory ?? [];
    return (
      <ImagePicker
        current={own}
        // The recipe's own photo plus the ones it has worn before, so a photo
        // replaced by an upload stays reachable instead of vanishing.
        images={Array.from(new Set([...(own ? [own] : []), ...history]))}
        onSelect={(url) => updateRecipeAndRevealPhoto(recipeId, { ...recipe, image: url ?? "" })}
        // Placement is a COOKBOOK idea. `photoOnFor` in usePrintSheets only
        // consults `itemPlacements` for cookbook layouts, so offering None / In
        // card / Full page on a plain recipe card would be three buttons that
        // change nothing. In cards mode the dialog is just "which photo", and
        // whether photos show at all is the one setting in the panel.
        placement={cookbookMode ? photoModeFor(recipeId) : undefined}
        placementOptions={
          cookbookMode
            ? PHOTO_STYLE_OPTIONS.map((option) => ({
                id: option.id,
                label: option.short,
                hint: option.hint,
              }))
            : undefined
        }
        onPlacementChange={
          cookbookMode
            ? (mode) => setRecipePhotoMode(recipeId, mode as PhotoStyle)
            : undefined
        }
        // Says which job it is doing: there is nothing to change yet when the
        // recipe came in without a photo.
        label={own ? "Photo" : "Add photo"}
        className="recipe-page-toolbar__photo"
      />
    );
  };
  // A full-page photo's own control. The page it sits on is the recipe's hero
  // image, so this changes `heroImageUrl` rather than the recipe's photo, and
  // offers the same None / In card / Full page placement as the recipe page
  // facing it. Repositioning and zoom stay ON the artwork — those are direct
  // manipulation of the picture, not a dialog.
  const renderImagePagePhotoControl = (recipeId: string) => {
    const own = items?.find((item) => item.id === recipeId)?.recipe?.image;
    const placement = projectMeta.meta.itemPlacements?.[recipeId];
    const history = placement?.photoHistory ?? [];
    return (
      <ImagePicker
        current={placement?.heroImageUrl ?? own}
        // Only this recipe's own photo (plus upload) — never a grid of OTHER
        // recipes' images, which isn't what "change this photo" means.
        images={Array.from(new Set([...(own ? [own] : []), ...history]))}
        onSelect={(url) =>
          url
            ? projectMeta.setItemPhotoMode(recipeId, "full", url)
            : setRecipePhotoMode(recipeId, "none")
        }
        placement={photoModeFor(recipeId)}
        placementOptions={PHOTO_STYLE_OPTIONS.map((option) => ({
          id: option.id,
          label: option.short,
          hint: option.hint,
        }))}
        onPlacementChange={(mode) => setRecipePhotoMode(recipeId, mode as PhotoStyle)}
        openSignal={photoDialogSignal(recipeId)}
        label="Photo"
        className="recipe-page-toolbar__photo"
      />
    );
  };

  // The cover's photo control, in the page toolbar rather than floating on the
  // artwork. Same button, same dialog, same place as a recipe's — a title page
  // is a page with a picture on it, and there is no reason its picture is
  // changed somewhere else.
  const renderCoverPhotoControl = (side: "front" | "back" | "dedication") => {
    const cover = coverForSide(side) ?? defaultCover();
    const gridImages = (cover.gridImages ?? []).filter(Boolean);
    const candidates = coverPhotoCandidates;
    return (
      <ImagePicker
        current={cover.imageUrl}
        images={candidates}
        gridActive={cover.layout === "collage" && gridImages.length > 0}
        gridImages={gridImages}
        onSelect={(imageUrl) =>
          setCoverForSide(side, {
            ...cover,
            imageUrl,
            gridImages: undefined,
            layout: imageUrl ? "photo" : "typographic",
          })
        }
        onGridChange={(urls) =>
          setCoverForSide(side, {
            ...cover,
            gridImages: urls.length ? urls : undefined,
            imageUrl: undefined,
            layout: urls.length ? "collage" : "typographic",
          })
        }
        onSelectGrid={
          candidates.length >= 2
            ? () => {
                // Seed the collage with a sensible starting set; the cook then
                // curates how many and which ones in the picker.
                const count = candidates.length >= 6 ? 6 : candidates.length >= 4 ? 4 : 2;
                setCoverForSide(side, {
                  ...cover,
                  gridImages: candidates.slice(0, count),
                  imageUrl: undefined,
                  layout: "collage",
                });
              }
            : undefined
        }
        openSignal={photoDialogSignal(`cover:${side}`)}
        label={cover.imageUrl || gridImages.length ? "Photo" : "Add photo"}
        className="recipe-page-toolbar__photo"
      />
    );
  };

  const [activeNavIndex, setActiveNavIndex] = useState(0);
  /**
   * The still-importing or failed card the deck is showing, if any.
   *
   * These live outside the sheets pipeline, so `activeNavIndex` cannot name
   * them and the rail had no way to mark them. Selecting one clears itself the
   * moment the cook navigates to a real page (see `goToSlide` below), because
   * two rows claiming to be the current one is worse than neither.
   */
  const [activeImportId, setActiveImportId] = useState<string | null>(null);
  /**
   * Scrolling to another page gives the "current" mark back to that page.
   *
   * The skip is for the one case where the two agree rather than compete: the
   * auto-scroll below selects the placeholder AND parks `activeNavIndex` on
   * the slot it will occupy, in the same pass. Without this the park read as
   * "the cook moved" and cleared the selection it had just made, which is why
   * a failed import came up dimmed.
   */
  const keepImportSelectionRef = useRef(false);
  useEffect(() => {
    if (keepImportSelectionRef.current) {
      keepImportSelectionRef.current = false;
      return;
    }
    setActiveImportId(null);
  }, [activeNavIndex]);
  // Publish the setter through a ref in an effect rather than during render, so
  // the ref callers (`activeNavIndexResetRef.current?.(0)`) always read a value
  // from a committed render (setActiveNavIndex is stable, so this is a one-time
  // settle in practice).
  useEffect(() => {
    activeNavIndexResetRef.current = setActiveNavIndex;
  }, [setActiveNavIndex]);
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


  /* `<= 1`, not `=== 1`: an empty deck behaves exactly like a one-page deck —
     one thing centred, nothing to scroll between — and it needs the same top
     padding, or the empty-state page sits lower than the page it stands in for.
     The rule's other effects (`scroll-snap-align: start` on slides) are no-ops
     when there are no slides. */
  const singleRecipePrintView =
    (items?.filter((item) => Boolean(item.recipe)).length ?? 0) <= 1;

  // Cookbook "book view": the deck shows two-page SPREADS, so a deck slide is a
  // spread (not a single page). `activeNavIndex` then indexes `spreads`, and the
  // controls/editing target a FOCUSED page within the active spread.
  const cookbookView = spreads.length > 0;
  /**
   * The box a deck page occupies — the SAME question `ScaledPage` answers.
   *
   * This said "the deck previews at Letter, always", and it was true until
   * cookbook pages moved onto the preset's own sheet. ScaledPage followed that
   * change and this did not, so for a cookbook the deck sized every page it
   * drew at the preset's sheet while computing its fit scale, its centring pad
   * and its free-scroll threshold from Letter. Off by half an inch of page
   * height on hardcover.
   *
   * Nothing showed it as a wrong size, because the deck also MEASURES the real
   * slide centres to decide what is on screen. It showed up as the two
   * disagreeing: a scroll aimed at where the padding said a page rests, landing
   * where the page actually was, and snap pulling it back the difference. Which
   * is why it was cookbooks only — a card project has one answer to this
   * question and always did.
   */
  const previewDims = cookbookMode
    ? presetCardDims(getCookbookPreset(projectMeta.meta.cookbookPreset))
    : PAGE_DIMS[previewCardSize];
  const spreadWidth = previewDims.w * 2;
  // Sheet index → its representative nav item index (the first nav item on it).
  const navIndexForSheet = useMemo(() => {
    const map = new Map<number, number>();
    navItems.forEach((navItem, index) => {
      if (!map.has(navItem.sheetIndex)) map.set(navItem.sheetIndex, index);
    });
    return map;
  }, [navItems]);

  /**
   * Deck zoom. 1 is "fit this window", which is where the deck has always sat;
   * the buttons step out from there in 10% notches. Deliberately not persisted:
   * it is how you are looking at the page right now, not a fact about the
   * document.
   */
  const [deckZoom, setDeckZoom] = useState(1);
  const stepDeckZoom = useCallback((direction: 1 | -1) => {
    setDeckZoom((current) =>
      Math.min(
        DECK_ZOOM_MAX,
        Math.max(DECK_ZOOM_MIN, Math.round((current + direction * 0.1) * 10) / 10),
      ),
    );
  }, []);

  const {
    canvasSide,
    setCanvasSide,
    deckScale,
    deckRef,
    slideRefs,
    goToSlide,
    goToDeckElement,
  } = useDeckScroller({
    activeNavIndex,
    setActiveNavIndex,
    // Scrolling onto an import card selects THAT card. The deck used to answer
    // with the nearest page instead, which both marked the recipe above it and
    // re-centred on that recipe, carrying you back off the thing you had just
    // scrolled down to read.
    onImportSlideChange: setActiveImportId,
    navItemsLength: cookbookView ? spreads.length : navItems.length,
    cardSize: previewCardSize,
    sheetsLength: sheets.length,
    continueOnBack,
    singleRecipePrintView,
    pageWidth: cookbookView ? spreadWidth : PAGE_DIMS[previewCardSize].w,
    pageHeight: cookbookView ? previewDims.h : PAGE_DIMS[previewCardSize].h,
    layoutKey: `${railCollapsed ? "r" : ""}${panelCollapsed ? "p" : ""}`,
    zoom: deckZoom,
    zoomRange: DECK_ZOOM_BOUNDS,
    onZoomChange: setDeckZoom,
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
  /** Scroll the deck to an import's card, and mark its rail row as the one
      being shown. Both kinds carry their id on the slide, so the row points at
      its own card the same way a page row points at its page. */
  /** Navigate to a page, and give the "current" mark back from any import
      card that was holding it. The rail reaches `goToSlide` directly, so
      wrapping it here is what covers every row that navigates. */
  const goToPageSlide = (index: number) => {
    setActiveImportId(null);
    goToSlide(index);
  };

  const selectImport = (item: QueueItem) => {
    const selector =
      item.status === "error"
        ? `[data-failed-import-id="${item.id}"]`
        : `[data-pending-import-id="${item.id}"]`;
    if (goToDeckElement(selector)) setActiveImportId(item.id);
  };

  const focusSheetInSpread = (spreadIndex: number, sheetIndex: number | null) => {
    // Any call here means "show me a real page", so the import row gives the
    // mark back. Clearing on `activeNavIndex` alone was not enough: choosing
    // the page you were already on does not change the index, so the failed
    // row and the page row both read as current.
    setActiveImportId(null);
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
    effectiveRailSelection,
    clearRailSelection,
    orderedRailSelection,
  } = railSelection;

  // Set when a recipe is moved by a placement change while being edited, so the
  // inline editor keeps it in edit mode as focus follows it to its new page.
  const keepEditingRef = useRef<string | null>(null);
  /**
   * Choosing a photo for one recipe is choosing to SHOW it on that recipe.
   *
   * Photos have a book-wide default and a per-recipe override, and picking a
   * custom photo only ever wrote the photo — never the override. So with the
   * book default off, going to the trouble of uploading a picture for one
   * recipe appeared to do nothing at all: it was stored, and then hidden by a
   * setting the cook had made before they had a photo to show. The only way to
   * see it was to turn photos on for the whole book, which is the opposite of
   * what "just this one" means.
   *
   * Only when this recipe is currently showing NO photo. A recipe already set
   * to a full-page spread has made a more specific choice than this one, and
   * replacing its picture must not quietly demote it to an in-card thumbnail.
   */
  const updateRecipeAndRevealPhoto = useCallback(
    (id: string, next: Recipe) => {
      const previous = items?.find((item) => item.id === id)?.recipe;
      queue.updateRecipe(id, next);
      /**
       * Keep the photo being replaced, so it stays pickable.
       *
       * The recipe photo picker's candidate list for a recipe is literally
       * `[recipe.image]`, and choosing a custom photo overwrites that — so the
       * imported photo left the dialog the moment it was replaced, with no way
       * back short of re-importing the recipe.
       */
      if (previous?.image && previous.image !== next.image) {
        const kept = projectMeta.meta.itemPlacements?.[id]?.photoHistory ?? [];
        if (!kept.includes(previous.image)) {
          projectMeta.setItemPlacement(id, {
            // Newest first: the photo just replaced is the likeliest one to want
            // back, and the list is capped so a cook cycling through uploads
            // doesn't accumulate a wall of tiles.
            photoHistory: [previous.image, ...kept.filter((url) => url !== next.image)].slice(0, 8),
          });
        }
      }
      if (!next.image || next.image === previous?.image) return;
      if (cookbookMode) {
        if (photoModeFor(id) === "none") projectMeta.setItemPhotoMode(id, "card");
        return;
      }
      /* Recipe cards have no per-recipe override — `photoOnFor` in
         usePrintSheets only consults `itemPlacements` for cookbook layouts — so
         the placement written above was invisible here, and picking a photo
         with "Include recipe photo" off still showed nothing at all. In cards
         mode the equivalent of "show this" is the setting itself. */
      if (!showPhoto) setShowPhoto(true);
    },
    // `setItemPhotoMode` and `updateRecipe` are stable; the rest is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, photoModeFor, cookbookMode, showPhoto, queue.updateRecipe, projectMeta.setItemPhotoMode],
  );

  const { showEmptyFields, toggleShowEmptyFields, activeInlineEdit } = useRecipeInlineEditor({
    items,
    updateRecipe: updateRecipeAndRevealPhoto,
    activeRecipeId,
    activeRecipeItem,
    resetKey: String(activeNavIndex),
    keepEditingRef,
    includeDescription: showDescription,
    onLinesDeleted: reportLinesDeleted,
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
      /**
       * Selected text means the keystroke is aimed at words, not at the recipe.
       *
       * Dragging across two steps selects across two separate textareas, so the
       * drag ends outside the field it began in: the inline editor commits and
       * closes, focus falls back to the document, and `isEditable` above is
       * false by the time the cook presses Backspace to delete what they just
       * highlighted. Watched in a session replay — someone selecting a few
       * steps to delete them got the delete-this-recipe confirm instead, and
       * took it.
       */
      const selection = window.getSelection();
      if (selection && !selection.isCollapsed && selection.toString().trim()) return;
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
  /**
   * Go and wait at the loading page.
   *
   * What people actually do here is verify: add one recipe, look at how it came
   * out, then add the next. The deck is where you look at it, so a deck that
   * stays on the previous card breaks that loop at exactly the moment it
   * matters — you asked for a recipe and got shown the one before it.
   *
   * This used to be mobile-only, on the reasoning that a desktop cook can see
   * the import running in the rail and moving the deck under them would be
   * taking their view away. That holds for something arriving unbidden. It does
   * not hold here: the placeholder is the direct answer to a thing they just
   * pressed, and following it is what they asked for. The rail still scrolls its
   * own pending row into view (see the effect above), so both halves now agree
   * about where the new recipe is.
   *
   * Where the placeholder goes is `pendingAddAfterRecipeId`'s business
   * (PrintDeck); this only follows it there.
   */
  useEffect(() => {
    if (parsingImportCount === 0) return;
    // The placeholder mounts on the render that raises this count, so it is not
    // in the DOM during this pass. One frame is enough; the retry covers a
    // deck still re-measuring after the insert, which lands a frame or two
    // later and would otherwise leave the cook staring at the old page.
    let frame = 0;
    let attempts = 0;
    const tryScroll = () => {
      if (goToDeckElement("[data-pending-page]")) {
        // The placeholder is the current card while it loads, so it comes out
        // of the deck's dimmed state — and because a failure keeps the same
        // item id, the error card it becomes is readable the moment it
        // appears rather than sitting at 0.4 until someone finds it.
        keepImportSelectionRef.current = true;
        setActiveImportId(parsingImports[0]?.id ?? null);
        // Claim the slot the recipe is about to take, WITHOUT scrolling to it.
        //
        // This is what stops the deck moving again once the page arrives. The
        // placeholder is that recipe's page while it loads, so the cook is
        // already where they asked to be, and two things would otherwise
        // disagree: `useDeckScroller` re-centres on `activeNavIndex` whenever
        // the deck gains a page, and the just-added-recipe effect below jumps
        // to it. Both compare against `activeNavIndex` — pointing it at the
        // slot now makes the first a no-op and the second skip its scroll,
        // instead of bolting a "do not scroll" flag onto either.
        setActiveNavIndex(pendingSlotIndexIn(navItems, pendingAddAfterRecipeId));
        return;
      }
      if ((attempts += 1) > 8) return;
      frame = window.requestAnimationFrame(tryScroll);
    };
    frame = window.requestAnimationFrame(tryScroll);
    return () => window.cancelAnimationFrame(frame);
    // navItems/anchor are read at park time only; re-running on every layout
    // change would re-park a deck the cook has since scrolled away from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsingImportCount, goToDeckElement]);

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
      // The menu itself is portalled to the body, so containment in the add row
      // no longer covers it — a click on "Add chapter" would close the menu
      // before its own handler ran.
      const inMenu =
        target instanceof Element && target.closest(".recipe-page-rail__add-menu") !== null;
      if (addMenuOpen && !inMenu && !addMenuRef.current?.contains(target)) setAddMenuOpen(false);
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

  /**
   * A bookmarked project link that cannot be opened. Must come BEFORE the
   * loading gate below: `items` is still null in every one of these cases, so
   * that gate would otherwise render a spinner that never resolves.
   */
  if (projectAccess) {
    const copy = {
      "needs-auth": {
        title: "Sign in to see your project",
        body: "Your projects are saved to your account. Sign in and this one will be right here.",
        action: "Sign in",
      },
      missing: {
        title: "We couldn't find that project",
        body: "It might be saved to a different account. Signing in with that one will bring it back.",
        action: "Try another account",
      },
      failed: {
        title: "That project didn't load",
        body: "Something went wrong on the way to your account. Your project is safe, so it's worth another try.",
        action: "Try again",
      },
    }[projectAccess];
    return (
      <div className="h-full flex flex-col">
        <SiteHeader compact sticky wordmark={false} />
        <div className="flex-1 flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cp-accent-warm)]">
            <BookIcon size={28} className="text-[var(--cp-on-accent-warm)]" />
          </div>
          <p className="font-bold text-cp-h2">{copy.title}</p>
          <p className="text-ink-soft max-w-sm leading-relaxed">{copy.body}</p>
          <div className="flex flex-wrap items-center justify-center gap-cp-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                if (projectAccess === "failed") {
                  window.location.reload();
                  return;
                }
                setCookPilotLoginReason("default");
                setShowCookPilotLogin(true);
              }}
            >
              {copy.action}
            </button>
            <Link href="/" className="btn btn-secondary">
              Back to your recipes
            </Link>
          </div>
        </div>
        {showCookPilotLogin && !cookPilotUser && (
          <CookPilotLoginDialog
            onClose={() => {
              setShowCookPilotLogin(false);
              cancelSaveAfterLogin();
            }}
            onAuthenticated={() => setShowCookPilotLogin(false)}
            reason={cookPilotLoginReason}
          />
        )}
      </div>
    );
  }

  /**
   * Recipes are already on their way in from the importer, so this render will
   * be an empty deck for a beat and then a filling one.
   *
   * Read once, synchronously, at mount — before the effect that collects the
   * payload has run, and deliberately without consuming it.
   */
  if (
    leavingHome ||
    // `items === null` is the print job not yet read out of sessionStorage. It
    // earns a whole-page screen when the deck is about to be REPLACED, because
    // the alternative is a frame of the wrong contents. It does not earn one
    // when an import is inbound: the deck is empty either way, and the rail
    // already shows a placeholder per recipe the moment the payload lands. Both
    // together is the doubled wait — "Preparing…" over the whole page, then the
    // per-recipe loading underneath it — where the first screen says nothing
    // the second does not say better, and says it by hiding the workspace.
    (items === null && !importInbound) ||
    projectLoading ||
    projectContentPending ||
    cookbookAccessStatus === "loading"
  ) {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader compact sticky wordmark={false} />
        <RecipeLoadingState
          className="flex-1"
          label={
            leavingHome ?? (accountProjectId ? "Loading your project…" : "Preparing…")
          }
        />
      </div>
    );
  }

  /**
   * No "nothing to print" screen. An empty queue is not a failure, and the
   * three ways this page CAN fail — signed out, wrong account, load error —
   * already have their own screens above (`projectAccess`). What is left is
   * simply a workspace with nothing in it yet, which is what it now looks
   * like: same rail, same canvas, same settings, and an empty page in the
   * middle. Being thrown out to a not-found screen for deleting your own last
   * recipe read as having broken something.
   */
  return (
    <div className={`h-dvh recipe-print-page ${printWatermarked ? "rp-print-locked" : ""}`}>
      {measurers}
      {/* Header + the back-up bar share one grid row so the bar pushes the
          editor down instead of stealing the deck's `1fr` row (which left it
          floating mid-page). `.recipe-print-page` is a two-row grid — keep it
          to two children. */}
      <div className="recipe-print-topbar">
        <SiteHeader
          compact
          sticky
          wordmark={false}
          /*
            The top left says WHICH document this is, in place of the product's
            own name — on this page you already know what app you are in, and
            the thing you don't know is which project is open. The mark stays
            beside it as the way home. The right says what you can DO to it, in
            the order you'd reach for them: how it stands, then the action that
            finishes it.
          */
          lead={
            /* Rendered even with nothing in the queue. Recipe cards vs Cookbook
               is a choice ABOUT the project, not about its contents, and an
               emptied workspace is still a workspace — dropping the control
               made the bar go blank at exactly the moment the page below it
               already looked bare. */
            (
              <ProjectHeading
                title={headingTitle}
                /* A cookbook is a named thing you come back to, so its name
                   belongs in the bar. A card job is not: "Banana Bread + 2
                   more" is a description of the queue, not a title anyone
                   chose, and it was showing there the moment the project
                   happened to be saved. */
                showTitle={savedToProfile && cookbookMode}
                onRename={projectMeta.setProjectTitle}
                cookbookMode={cookbookMode}
                canBecomeCookbook={COOKBOOK_ENABLED}
                onSwitchToCards={exitCookbookToCards}
                onSwitchToCookbook={startCookbook}
              />
            )
          }
          actions={
            items?.length ? (
              <>
                {/* The "Make it a cookbook" button that sat here is gone: the
                    kind control in the middle of the bar now shows both kinds
                    side by side while you are in recipe cards, so the offer is
                    already visible and two controls for it in one bar was one
                    too many. See ProjectHeading. */
                }
                {/*
                  How this project stands, to the LEFT of the action rather than
                  out by the avatar. It reads as part of the same sentence as
                  Print, and the avatar goes back to being only the account.

                  Two shapes, because there are two situations. A signed-in
                  cookbook autosaves, so there is nothing to press and the word
                  is the whole story. Anything that does NOT autosave — every
                  card job, and a book belonging to someone signed out — gets a
                  real button, because for those "saved" is something you have
                  to ask for. Leaving the workspace files either of them anyway
                  (see `handleNavigateHome`); this is for saving without leaving.
                */}
                {autosaveEnabled
                  ? saveStatus &&
                    /* A button only when there is something to retry — a
                       focusable control that does nothing when activated is
                       worse than plain text. */
                    (SAVE_FAILURES.has(saveStatus) ? (
                      <button
                        type="button"
                        className="rp-save-state rp-save-state--failed"
                        onClick={handleRetrySave}
                        aria-live="polite"
                      >
                        {SAVE_STATUS_LABEL[saveStatus]}
                      </button>
                    ) : (
                      <span className="rp-save-state" role="status" aria-live="polite">
                        {saveStatus === "saving" ? (
                          <SpinnerIcon size={ICON_SIZE.sm} />
                        ) : saveStatus === "saved" ? (
                          <CheckIcon size={ICON_SIZE.sm} />
                        ) : null}
                        {SAVE_STATUS_LABEL[saveStatus]}
                      </span>
                    ))
                  : (
                      <button
                        type="button"
                        className="btn btn-secondary btn-compact"
                        onClick={() => void handleSaveProject()}
                      >
                        <SaveIcon size={ICON_SIZE.md} />
                        Save
                      </button>
                    )}

                {/*
                  One button, not two. Buying and printing are not separate
                  actions here — if the book has not been paid for, printing IS
                  the purchase, and the label has always said so. Splitting them
                  would put a Purchase button beside a Print button that does the
                  same thing when pressed, and leave someone unsure which one had
                  just charged them.
                */}
                <button
                  type="button"
                  className="btn btn-primary btn-compact"
                  disabled={printBlocked}
                  onClick={() => void handlePrint()}
                >
                  {printSpinner ? (
                    <SpinnerIcon size={ICON_SIZE.md} />
                  ) : (
                    <PrintIcon size={ICON_SIZE.md} />
                  )}
                  {/* Shorter than "Purchase & Print", and still says that money
                      is involved — which it has to. A button that charges has
                      to say so before it is pressed, however clearly the price
                      was stated on the way in: someone reopening a book days
                      later has not just read that dialog.

                      The price is deliberately NOT in the label. `cookbookPrice`
                      is a hardcoded fallback, not the customer's price — see
                      `COOKBOOK_PRICE_FALLBACK`, which exists because loading the
                      live one would configure the purchase SDK for anyone who
                      merely opens a cookbook. Printing a number here would quote
                      the wrong currency and the wrong amount to anyone outside
                      the US, and would go stale the moment the product's price
                      changes. Checkout states the authoritative price. */}
                  {cookbookLocked
                    ? "Buy & Print"
                    : templateLocked
                      ? "Unlock & Print"
                      : "Print"}
                </button>
              </>
            ) : undefined
          }
          onNavigateHome={() => void handleNavigateHome()}
        />

        {/* One-line "back up your cookbook" bar under the toolbar, shown to any
            signed-out owner. Not dismissable on purpose: a book that lives only
            in this browser stays worth saying so about until they make an
            account.

            This used to be gated on `!cookbookLocked`, so it only appeared once
            a book had been PAID for — which is both the smallest audience and
            the latest possible moment. Every unsaved book is worth keeping, and
            asking here, while the cook is in the middle of building one, is a
            far better moment than the one we were reaching for otherwise: a
            modal at the door on the way out, making an account the price of
            keeping their work. This says the same thing without holding
            anything hostage — the book is on the device's shelf either way (see
            lib/localProjects), and an account is how it stops being only there. */}
        {projectMeta.meta.cookbookMode && !cookPilotUser && (
          <div className="recipe-protect-bar no-print" role="status">
            <span className="recipe-protect-bar__text">
              {cookbookLocked
                ? "Your cookbook is saved only on this device. Create a free account so you don’t lose it."
                : "Your cookbook and your purchase are saved only on this device. Create a free account to keep them."}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-compact recipe-protect-bar__action"
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
    <>
      <main
        className={`recipe-print-shell px-cp-6 print:p-0 ${
          previewMeasuring ? "recipe-print-shell--measuring" : ""
        } ${showCookbookOfferDialog || cookbookBuilding ? "recipe-print-shell--entering-cookbook" : ""} ${
          organizeMode ? "recipe-print-shell--organizing" : ""
        } ${organizeWide ? "recipe-print-shell--organize-wide" : ""} ${
          organizeAnimating ? "recipe-print-shell--organize-animating" : ""
        } ${railCollapsed ? "recipe-print-shell--rail-collapsed" : ""} ${
          panelCollapsed ? "recipe-print-shell--panel-collapsed" : ""
        }`}
      >
        {/* One control per side, and it does not move when the panel does.
            It rides the panel's own edge — `left: var(--rail-w)` — so folding
            the column to zero carries it to the page edge without anything
            having to remember where it was. An arrow INSIDE a panel can only
            ever be the one that closes it, and then has to be replaced by a
            different control somewhere else the moment it works; this is the
            same button throughout, and only the chevron turns round. */}
        <button
          type="button"
          className="recipe-panel-toggle recipe-panel-toggle--left no-print"
          onClick={() => setRailCollapsed((collapsed) => !collapsed)}
          aria-expanded={!railCollapsed}
          aria-label={railCollapsed ? "Show pages" : "Hide pages"}
          title={railCollapsed ? "Show pages" : "Hide pages"}
        >
          {railCollapsed ? (
            <ChevronRightIcon size={ICON_SIZE.md} />
          ) : (
            <ChevronLeftIcon size={ICON_SIZE.md} />
          )}
        </button>
        <button
          type="button"
          className="recipe-panel-toggle recipe-panel-toggle--right no-print"
          onClick={() => setPanelCollapsed((collapsed) => !collapsed)}
          aria-expanded={!panelCollapsed}
          aria-label={`${panelCollapsed ? "Show" : "Hide"} ${cookbookMode ? "cookbook settings" : "print setup"}`}
          title={`${panelCollapsed ? "Show" : "Hide"} ${cookbookMode ? "cookbook settings" : "print setup"}`}
        >
          {panelCollapsed ? (
            <ChevronLeftIcon size={ICON_SIZE.md} />
          ) : (
            <ChevronRightIcon size={ICON_SIZE.md} />
          )}
        </button>
        <PageRail
          railScrollRef={railScrollRef}
          railDrag={railDrag}
          railSelection={railSelection}
          previewCardSize={previewCardSize}
          cardSize={cardSize}
          previewTemplate={previewTemplate}
          continueOnBack={continueOnBack}
          previewDescriptionOn={showDescription}
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
          onSelectImport={selectImport}
          activeImportId={activeImportId}
          settlingIds={settlingIds}
          goToSlide={goToPageSlide}
          railShake={railShake}
          pendingAddAfterRecipeId={pendingAddAfterRecipeId}
          pendingAddSectionId={pendingAddSectionId}
          pendingImportItems={pendingImportItems}
          setPendingAddSectionId={setPendingAddSectionId}
          setPendingAddIndex={setPendingAddIndex}
          setPendingAddAfterRecipeId={setPendingAddAfterRecipeId}
          setShowAddRecipeDialog={setShowAddRecipeDialog}
          openAddRecipeBelow={openAddRecipeBelow}
          addSectionDivider={addSectionDivider}
          makeSectionFromSelection={makeSectionFromSelection}
          moveRecipesToSection={moveRecipesToSection}
          railSortMode={railSortMode}
          applyRailSort={applyRailSort}
          addMenuOpen={addMenuOpen}
          setAddMenuOpen={setAddMenuOpen}
          addMenuRef={addMenuRef}
          suggestCookbookLayout={suggestCookbookLayout}
          undoCookbookOrganization={undoCookbookOrganization}
          canUndoOrganization={organizationUndo !== null}
        />

        {/* Center: large preview of the selected page */}
        <PrintDeck
          singleRecipePrintView={singleRecipePrintView}
          cookbookView={cookbookView}
          previewMeasuring={previewMeasuring}
          previewDims={previewDims}
          spreadWidth={spreadWidth}
          previewCardSize={previewCardSize}
          previewTemplate={previewTemplate}
          continueOnBack={continueOnBack}
          cardSize={cardSize}
          showCutLines={showCutLines}
          showSourceUrl={showSourceUrl}
          showDescription={showDescription}
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
          deckZoom={deckZoom}
          onRequestDelete={requestDeleteNavItem}
          onMoveRecipeToSection={moveRecipeToSection}
          onMoveRecipeToNewSection={moveRecipeToNewSection}
          openPhotoDialog={openPhotoDialog}
          onZoomStep={stepDeckZoom}
          onZoomSet={setDeckZoom}
          deckRef={deckRef}
          slideRefs={slideRefs}
          goToSlide={goToSlide}
          projectMeta={projectMeta}
          showEmptyFields={showEmptyFields}
          toggleShowEmptyFields={toggleShowEmptyFields}
          activeInlineEdit={activeInlineEdit}
          editingSectionId={editingSectionId}
          setEditingSectionId={setEditingSectionId}
          editingSectionTitle={editingSectionTitle}
          setEditingSectionTitle={setEditingSectionTitle}
          editSectionTitle={editSectionTitle}
          commitSectionEdit={commitSectionEdit}
          startSectionEdit={startSectionEdit}
          coverSideFromNavItem={coverSideFromNavItem}
          coverForSide={coverForSide}
          defaultCover={defaultCover}
          setCoverForSide={setCoverForSide}
          coverPhotoCandidates={coverPhotoCandidates}
          renderPagePhotoControl={renderPagePhotoControl}
          renderSectionPhotoControl={renderSectionPhotoControl}
          renderCoverPhotoControl={renderCoverPhotoControl}
          renderImagePagePhotoControl={renderImagePagePhotoControl}
          parsingImports={deckPendingImports}
          activeImportId={activeImportId}
          onSelectImport={selectImport}
          settlingIds={settlingIds}
          failedImports={failedImports}
          canRetryImport={queue.canRetry}
          onRetryImport={queue.retry}
          onRepairImportWithText={(id, text) => queue.repairItem(id, { kind: "text", text })}
          onRepairImportWithImages={(id, files) => queue.repairItem(id, { kind: "images", files })}
          onRemoveImport={queue.remove}
          pendingAddAfterRecipeId={pendingAddAfterRecipeId}
          openAddRecipeBelow={openAddRecipeBelow}
          sizeMenuOpen={sizeMenuOpen}
          setSizeMenuOpen={setSizeMenuOpen}
          settingsMenuOpen={settingsMenuOpen}
          setSettingsMenuOpen={setSettingsMenuOpen}
          hasPrintSettingsFields={hasPrintSettingsFields}
          renderPrintSettingsFields={renderPrintSettingsFields}
          renderAllPages={renderAllPages}
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
          showDescription={showDescription}
          setShowDescription={setShowDescription}
          anyRecipeHasDescription={anyRecipeHasDescription}
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
          {/* No way into a cookbook here on purpose. Building a book — covers,
              chapters, page layouts, the organizer — is not something the phone
              layout does well yet, and selling someone a $19.99 document they
              then can't comfortably edit is worse than not offering it. The
              desktop header carries the CTA; an existing book still OPENS and
              edits here, it just isn't created here. */}
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
          {/* Print sits DOWN here, under the tools, not up in the top bar.
              It is the thing this page is for and the last thing you do, and
              on a phone the bottom of the screen is where your thumb already
              is. Save stays at the top: it is housekeeping, not the finish. */}
          <button
            type="button"
            /* The SAME button the desktop header uses, widened — not a
               hand-rolled one that happens to look similar. The custom class
               only carries the full-width shape now; every colour, radius and
               weight comes from `.btn-primary`, so the two can never drift. */
            className="btn btn-primary recipe-mobile-actions__print"
            onClick={handleMobilePrint}
            disabled={printBlocked}
          >
            {printSpinner ? <SpinnerIcon size={ICON_SIZE.md} /> : <PrintIcon size={ICON_SIZE.md} />}
            {cookbookLocked ? "Purchase & Print" : templateLocked ? "Unlock & Print" : "Print"}
          </button>
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
          undoCookbookOrganization={undoCookbookOrganization}
          canUndoOrganization={organizationUndo !== null}
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

      <PrintDialogs
        showDonateDialog={showDonateDialog}
        onCloseDonateDialog={() => setShowDonateDialog(false)}
        onOpenFeedbackDialog={() => setShowFeedbackDialog(true)}
        showDeleteRecipeDialog={pendingDelete !== null}
        deleteItemTitle={pendingDelete?.title ?? "this item"}
        deleteItemDescription={
          pendingDelete?.kind === "section"
            ? "The chapter page and grouping will be removed from this print project."
            : pendingDelete?.kind === "cover"
              ? "The cover page will be removed from this print project."
              : "It'll be removed from your print list. This can't be undone."
        }
        deletePrimaryLabel={
          pendingDelete?.kind === "section"
            ? "Delete chapter"
            : pendingDelete?.kind === "cover"
              ? "Delete cover"
              : "Delete recipe"
        }
        sectionRecipeCount={pendingDelete?.kind === "section" ? pendingDelete.recipeIds.length : undefined}
        onCancelDeleteRecipe={() => setPendingDelete(null)}
        onConfirmDeleteRecipe={confirmPendingDelete}
        onConfirmDeleteSectionRecipes={confirmDeleteSectionRecipes}
      />
      {/* Leaving with a project that only exists in this browser.
          
          The old copy contradicted its own button: the description said the
          project would be kept on this device while the button underneath said
          "Leave without saving". Nothing is lost by leaving, and saying so is
          what makes the real difference (this browser vs every device) worth
          reading. */}
      {/* The print never opened, and reloading into a fresh document did not
          change that (see lib/printRearm) — so the remaining explanation is a
          browser that cannot print at all, which is what the ones built into
          other apps are. Say the one useful thing about that and offer the one
          action still worth taking. What it must never do is nothing, which is
          what a refused print looked like before: twenty-four taps on a button
          that answered none of them. */}
      <ConfirmDialog
        open={printRefusedNotice}
        tone="primary"
        title="The print dialog didn't open"
        description={
          <>
            Some browsers that run inside other apps can&apos;t open one. If you got here from
            a link in another app, opening recipeprinter.com in Safari or Chrome will print.
          </>
        }
        confirmLabel="Try again"
        secondaryLabel="Close"
        onSecondary={() => setPrintRefusedNotice(false)}
        onCancel={() => setPrintRefusedNotice(false)}
        onConfirm={() => {
          setPrintRefusedNotice(false);
          // A fresh document is still the best shot, and the marker that says
          // "we already tried that" is what stopped this one being taken
          // automatically. They asked, so let it.
          clearPrintRetryMarker();
          window.location.href = printAgainHref(window.location);
        }}
      />
      <ConfirmDialog
        open={confirmLeave}
        tone="primary"
        title="Keep this project?"
        description={
          <>
            This project stays in this browser, and you can open it again from Projects.
            Signing in keeps it in your account instead, so it is there on your phone and
            any other computer too.
          </>
        }
        confirmLabel="Sign in and save it"
        secondaryLabel="Leave it in this browser"
        onSecondary={() => {
          setConfirmLeave(false);
          void handleNavigateHome({ confirmed: true });
        }}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          // Arms `saveAfterLoginRef` and opens the sign-in dialog; the save
          // runs itself the moment an account exists.
          void handleSaveProject();
        }}
      />
      <CookbookWelcomeDialog
        open={showCookbookOfferDialog}
        cover={projectMeta.meta.cover ?? defaultCover()}
        price={cookbookPrice}
        /* `cookbookLocked` is false whenever the project isn't a cookbook at
           all, so the unlock has to be read directly — this screen is shown
           FROM recipe-cards mode, where `cookbookMode` is false. */
        purchased={isCookbookProjectUnlocked(cookbookProjectId)}
        onClose={() => {
          // The X, Escape and the backdrop only dismiss the panel. The cook
          // just watched this book get built; closing the thing sitting on top
          // of it is not a decision to throw it away.
          track("cookbook_onboarding_dismissed", { price: cookbookPrice });
          setShowCookbookOfferDialog(false);
        }}
        onLeave={() => {
          // Only the button that says "Back to recipe cards" undoes the switch.
          track("cookbook_onboarding_dismissed", { price: cookbookPrice });
          setShowCookbookOfferDialog(false);
          exitCookbookToCards();
        }}
        onStart={() => {
          setShowCookbookOfferDialog(false);
        }}
      />
      <CookbookBuildReveal open={cookbookBuilding} />
      <CookbookReadyDialog
        open={showCookbookPrintDialog}
        justPurchased={cookbookJustPurchased}
        onClose={() => {
          setShowCookbookPrintDialog(false);
          setCookbookJustPurchased(false);
          setLastCookbookExport(null);
        }}
        onExport={(presetId, coverSheet) => void exportCookbookAs(presetId, coverSheet)}
        lastExport={lastCookbookExport}
        onExportAnother={() => setLastCookbookExport(null)}
        pageCount={sheets.length}
        exportingPreset={exportingPreset}
        exportError={cookbookExportError}
        exportNeedsAuth={cookbookExportNeedsAuth}
        exportNeedsAccount={cookbookExportNeedsAccount}
        onSignIn={() => {
          track("protect_prompt_clicked", { source: "cookbook_export" });
          setCookPilotLoginReason("purchase");
          setShowCookPilotLogin(true);
        }}
        onPrinterClick={(printer, url) => {
          track("cookbook_printer_clicked", { printer, preset: activePreset.id });
          window.open(url, "_blank", "noopener,noreferrer");
        }}
      />
      <AddRecipeDialog
        open={showAddRecipeDialog}
        onClose={() => setShowAddRecipeDialog(false)}
        items={queue.items}
        focusedItemId={queue.focusedItemId}
        focusNonce={queue.focusNonce}
        onAddUrl={queue.addUrl}
        onAddImageFiles={queue.addImageFiles}
        onAddText={queue.addText}
        onAddReadyRecipes={queue.addReadyRecipes}
        onAddManual={addManualRecipe}
      />
      <FeedbackDialog
        open={showFeedbackDialog}
        onClose={() => setShowFeedbackDialog(false)}
        initialType="print_issue"
      />
      {showCookPilotLogin && !cookPilotUser && (
        <CookPilotLoginDialog
          onClose={() => {
            setShowCookPilotLogin(false);
            cancelSaveAfterLogin();
          }}
          onAuthenticated={() => setShowCookPilotLogin(false)}
          reason={cookPilotLoginReason}
        />
      )}
      {toastMessage && (
        <div
          className={`recipe-toast no-print ${toastTone === "error" ? "recipe-toast--error" : ""}`}
          /* A failure interrupts; a confirmation does not. Screen readers get
             the same distinction the colour makes for everyone else. */
          role={toastTone === "error" ? "alert" : "status"}
          aria-live={toastTone === "error" ? "assertive" : "polite"}
        >
          <span>{toastMessage}</span>
          {lineDeleteUndo && toastMessage?.startsWith("Deleted ") && (
            <button
              type="button"
              className="recipe-toast__action"
              onClick={() => {
                lineDeleteUndo();
                setLineDeleteUndo(null);
                setToastMessage(null);
              }}
            >
              Undo
            </button>
          )}
          {organizationUndo && toastMessage === "Cookbook organized" && (
            <button type="button" className="recipe-toast__action" onClick={undoCookbookOrganization}>
              Undo
            </button>
          )}
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => {
              setToastMessage(null);
            }}
          >
            <XIcon size={ICON_SIZE.sm} />
          </button>
        </div>
      )}
    </div>
  );
}
