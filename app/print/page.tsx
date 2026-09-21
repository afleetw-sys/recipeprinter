"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SAVE_FAILURES, SAVE_STATUS_LABEL } from "@/components/AccountControl";
import { fileProjectLocally } from "@/lib/localProjects";
import type { AccountSaveStatus } from "@/components/AccountControl";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { PrintDialogs } from "@/components/PrintDialogs";
import { AddRecipeDialog } from "@/components/AddRecipeDialog";
import { sectionOrderChanged, sortSectionsByTitle } from "@/lib/sectionSort";
import { recipeLinkOn } from "@/lib/recipeLink";
import { CookbookWelcomeDialog } from "@/components/CookbookWelcomeDialog";
import { CookbookReadyDialog } from "@/components/CookbookReadyDialog";
import {
  CookbookPdfError,
  cookbookPdfFileName,
  downloadCookbookPdf,
} from "@/lib/cookbookPdfExport";
import type { CoverSheetSpec } from "@/types/export";
import { ImagePicker } from "@/components/ImagePicker";
import { Checkbox, CheckboxGroup } from "@/components/Controls";
import { RecipeLoadingState } from "@/components/RecipeLoadingState";
import { useModalFocus } from "@/lib/useModalFocus";
import { navigateAfterOverlayHistory, useBackDismiss } from "@/lib/useBackDismiss";
import type { PrintCardSize, RecipePrintTemplate } from "@/components/RecipeCardPrint";
import { PHOTO_STYLE_OPTIONS } from "@/components/print/photoStyle";
import { MobileStructureSheet } from "@/components/print/MobileStructureSheet";
import { MobileSheet } from "@/components/print/MobileSheet";
import { PrintConfigPanel } from "@/components/print/PrintConfigPanel";
import { PrintFormatToggle } from "@/components/print/PrintFormatToggle";
import { PageRail, type RailSortMode } from "@/components/print/PageRail";
import { PrintDeck, pendingSlotIndexIn } from "@/components/print/PrintDeck";
import { deckIndexForPendingSlot } from "@/lib/pendingDeckSlot";
import {
  usePrintSheets,
  type NavItem,
} from "@/lib/usePrintSheets";
import {
  buildSections,
  namedSectionCount,
  sectionDisplayTitle,
  useProjectMeta,
  type ProjectMeta,
  type PhotoStyle,
} from "@/lib/project";
import { type CookbookScaffoldPatch } from "@/lib/projectCopy";
import { materializeProjectPhotos } from "@/lib/photoStorage";
import {
  createPrintProjectId,
  savePrintProject,
  savedProjectOpensAsCookbook,
  assemblePrintProject,
  projectContentFromMeta,
  type PrintLayoutSettings,
  loadPrintProject,
  loadPrintProjectHead,
  PrintProjectConflictError,
} from "@/lib/printProjects";
import { adoptAnonymousProject, readAdoptionManifest } from "@/lib/anonymousProjectAdoption";
import { forgetSaveIntent, rememberSaveIntent, takeSaveIntent } from "@/lib/saveIntent";
import {
  forgetPendingPrintAfterCheckout,
  forgetProUpgradeIntent,
  hasPendingPrintAfterCheckout,
  rememberPendingPrintAfterCheckout,
  rememberProUpgradeIntent,
  takeProUpgradeIntent,
} from "@/lib/proUpgradeIntent";
import type { ProBillingCycle } from "@/lib/proProduct";
import { loadLocalProject } from "@/lib/localProjects";
import { printDocumentTitle } from "@/lib/printDocumentTitle";
import { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import { useRailDrag, type RailDragKind, type RailDropResolved } from "@/lib/useRailDrag";
import { useRailSelection } from "@/lib/useRailSelection";
import { PAGE_DIMS } from "@/lib/printGeometry";
import { addRecipeTarget } from "@/lib/addRecipeTarget";
import { useDeckScroller } from "@/lib/useDeckScroller";
import { usePremiumTemplatePurchase } from "@/lib/usePremiumTemplatePurchase";
import { useCookbookPurchase } from "@/lib/useCookbookPurchase";
import { useProPurchase } from "@/lib/useProPurchase";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { proUpgradeCopy } from "@/lib/proUpgradeCopy";
import {
  activeProLockReasons,
  computeProLocks,
  hasMultiRecipeEntitlement,
  hasProEntitlement,
} from "@/lib/recipePrinterPurchases";
import { resolveEffectiveCustomerInfo } from "@/lib/proAccessFallback";
import { isFirstCookbookDiscountEligible } from "@/lib/cookbookProduct";
import {
  DEFAULT_COOKBOOK_PRESET_ID,
  getCookbookPreset,
  presetCardDims,
} from "@/lib/cookbookPresets";
import { track } from "@/lib/analytics";
import {
  BookIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CrownIcon,
  ICON_SIZE,
  ImageIcon,
  InfoIcon,
  LinkIcon,
  PlusIcon,
  PrintIcon,
  SizeIcon,
  SpinnerIcon,
  TemplateIcon,
  XIcon,
} from "@/components/icons";
import { cookbookTemplateFor } from "@/lib/premiumTemplates";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import {
  loadRecipePrinterUserProfile,
  type RecipePrinterMirroredEntitlement,
} from "@/lib/recipePrinterUserProfile";
import {
  createCurrentPrintJob,
  readCurrentPrintJobIds,
  useQueue,
  type MultiRecipeBlockedInfo,
} from "@/lib/queue";
import {
  initialPrintCardSize,
  initialRecipePrintTemplate,
  isPrintCardSize,
  isRecipePrintTemplate,
  usePrintSettingsPersistence,
} from "@/lib/printSettings";
import { openingPageFor } from "@/lib/frontMatterPage";
import type {
  CookbookFrontMatter,
  CookbookPresetId,
  CoverConfig,
  PrintProject,
  QueueItem,
  Recipe,
  Section,
} from "@/types/recipe";
import { postPrintPrompt, purchaseGate, type PostPrintAction } from "@/lib/purchaseAccess";
import { isCookbookProjectUnlocked } from "@/lib/cookbookUnlocks";
import {
  markPrintPreviewStable,
  PRINT_PREVIEW_STABILITY_MS,
} from "@/lib/printErrorRecovery";
import { hasPendingImport, takePendingImport } from "@/lib/pendingImport";
import { nextPaint } from "@/lib/nextPaint";
import { markPostPrintDialogShown, shouldShowPostPrintDialog } from "@/lib/postPrintDialog";
import { useToast } from "@/lib/useToast";
import { printProjectFingerprint, type PendingSave } from "@/lib/printSave";
import { writeProject as runSaveWrite } from "@/lib/printSaveWrite";
import { autosaveVerdict, LOADED_BASELINE, shouldFlushOnHide } from "@/lib/printAutosave";

/** This section's own recipe photos, in item order, capped for a collage. Scopes
    the opener picker to the chapter (unlike the whole-book `coverPhotoCandidates`). */
function sectionRecipeImages(section: Section): string[] {
  return section.items
    .map((item) => item.recipe?.image)
    .filter((url): url is string => Boolean(url))
    .slice(0, 9);
}


// A ready-made dedication seeded when the page is turned on — real, editable
// content (not a hidden placeholder), so a cook who likes it can just keep it
// and it prints as-is.
const DEFAULT_DEDICATION_BODY = "For the ones who taught us to cook, and who made every table feel like home.";


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
  /**
   * Puts back the lines a drag deleted in one go.
   *
   * A bulk delete is the one edit on this page that can take a whole section
   * out at once, and it does not stop to ask — so the way back is on the toast
   * that reports it, held until that toast goes.
   */
  const [lineDeleteUndo, setLineDeleteUndo] = useState<(() => void) | null>(null);
  /** The toast reporting that a roundup URL, a multi-recipe photo, or a
      library commit found more than one recipe but this account can only add
      one (see `queue.configureMultiRecipeGate`) carries an Upgrade action —
      held until that toast goes, same as `lineDeleteUndo`. */
  const [multiRecipeUpsellPending, setMultiRecipeUpsellPending] = useState(false);
  // The organizer's "Sort by". `custom` is whatever order the cook has built by
  // hand; `title` is A–Z within every section. `customOrderUndo` holds the
  // arrangement A–Z replaced, so switching back restores it rather than leaving
  // the book alphabetized forever.
  const [customOrderUndo, setCustomOrderUndo] = useState<ProjectMeta["sections"] | null>(null);
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
  /**
   * Whether the LAST successful save agreed with the mode being edited right
   * now — the thing `autosaveEnabled` alone can't tell apart.
   *
   * `autosaveEnabled` answers "has this document ever been saved," which is
   * not the same question as "has THIS MODE of it." A recipe-cards project
   * that was explicitly saved gives a free pass to a cookbook scaffold that
   * was never asked to be kept: switch to Cookbook, and `scaffoldCookbook`'s
   * cover/chapters would autosave within the 1.5s debounce below, with
   * nobody having pressed anything. Comparing this ref against the current
   * `cookbookMode` is what tells "an edit to something already agreed to be
   * kept" apart from "a mode nobody has said yes to yet" — set on every
   * successful save (`writeProject`) and on load (a reopened project's own
   * `cookbookMode` IS the last thing it was saved as, so it starts agreeing
   * with itself).
   */
  const lastSavedCookbookModeRef = useRef<boolean>(false);
  const lastAttemptedFingerprintRef = useRef<string | null>(null);
  const saveInFlightRef = useRef(false);
  /** The first save of a new cookbook is made on the cook's behalf and the rail
      already reports it, so it skips the "Saved to Projects" toast a card job's
      first save gets. */
  const quietFirstSaveRef = useRef(false);
  /**
   * Which write the page is currently waiting on.
   *
   * Bumped when a save starts, so a write that finally answers after it has
   * been given up on (see `SAVE_TIMEOUT_MS`) or superseded cannot report its
   * result over a newer one's — it would otherwise set "Saved" on top of a
   * failure, or hand back a revision that has already moved.
   */
  const saveGenerationRef = useRef(0);
  /**
   * A save that arrived while another was in flight, held as the finished
   * DOCUMENT rather than as an intention to build one later.
   *
   * This used to be a bare "one more, please" flag replayed through
   * `latestSaveRef`, which re-read the workspace at replay time — and the one
   * moment a save is most likely to be queued is also the moment the workspace
   * is about to be emptied. Leaving the page files the project and then calls
   * `queue.clear()`; if an autosave was still in flight, the save leaving asked
   * for was replayed a moment later against the cleared desk, where
   * `currentProject()` answers null and the save returns having written
   * nothing. The header's last word was "Saved", and the account had no copy.
   *
   * Holding the assembled snapshot means a queued save writes what was on
   * screen when it was asked for, whatever has happened since.
   */
  const queuedSaveRef = useRef<PendingSave | null>(null);
  const flushOnHideRef = useRef<() => void>(() => undefined);
  /**
   * A save waiting on the account, within THIS document's lifetime.
   *
   * The durable copy is `lib/saveIntent`, which is what carries the same
   * promise across a sign-in redirect; this ref exists alongside it so the
   * popup path (desktop) does not have to round-trip through storage, and so a
   * browser with storage disabled still saves after signing in without leaving
   * the page. Either one being set means the same thing, and both are spent
   * together.
   */
  const saveAfterLoginRef = useRef(false);
  /** The cook answered the "Newer version found" prompt by choosing to
      overwrite, and this save is that answer. Read once by the adoption path,
      which otherwise refuses to replace a document it has never written, and
      cleared as soon as the save it authorized has been attempted — an approval
      is for one write, not a standing permission. */
  const adoptionOverwriteApprovedRef = useRef(false);
  const projectIdRef = useRef<string>(createPrintProjectId());
  const {
    toastMessage,
    setToastMessage,
    toastTone,
    setToastTone,
    showToast,
    showErrorToast,
    clearToast,
  } = useToast();
  // The durable, server-verified fallback for when the live RevenueCat SDK
  // can't be reached — see lib/proAccessFallback.ts. Null until a signed-in
  // profile has actually loaded; there is nothing to fall back to for a
  // signed-out browser (an anonymous purchase has no server-side mirror).
  const [mirroredEntitlements, setMirroredEntitlements] =
    useState<Record<string, RecipePrinterMirroredEntitlement> | null>(null);
  const [mirrorSyncedAtMs, setMirrorSyncedAtMs] = useState<number | null>(null);
  // When this account's first-ever cookbook was granted (server-written,
  // write-once — see lib/cookbookProduct.ts's isFirstCookbookDiscountEligible).
  // Null means never. Set optimistically the instant a discounted purchase
  // grants (see the `onCookbookGranted` callback below) so a second cookbook
  // purchase started later in the SAME session can't also resolve the
  // discounted product before the next real profile load would catch it.
  const [firstCookbookGrantedAt, setFirstCookbookGrantedAt] = useState<number | null>(null);
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
   * Does this project hold a book — either on screen, or set aside?
   *
   * `stashedCookbook` counts: a book being viewed as recipe cards is still a
   * book (see `currentProject`), which is what keeps a save from writing the
   * emptiness left behind over a cookbook someone bought, and what makes a
   * conflict on this document never resolvable by forking it.
   *
   * It deliberately no longer decides whether the project SAVES itself. Holding
   * a book is not the same as having asked us to keep one — see
   * `autosaveEnabledForCurrentMode`.
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
   * A persistent card answers "what happened to the one I just added?" after
   * a toast would have expired. It deliberately offers one recovery route:
   * reopen the shared Add recipes sheet and choose another source. Repeating
   * the same parse is normally deterministic, and separate paste/photo buttons
   * only recreated part of that sheet here.
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
    // Seeded from what's actually printed (which may be hidden, i.e. ""), not
    // the chapter's organizational name — otherwise clicking in and clicking
    // straight back out of a hidden title would silently un-hide it by
    // re-committing the unchanged org name.
    const section = sections.find((candidate) => candidate.id === sectionId);
    setEditingSectionId(sectionId);
    setEditingSectionTitle(section ? sectionDisplayTitle(section) : "");
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
  const updateSection = projectMeta.updateSection;
  const setArtPhoto = projectMeta.setArtPhoto;
  const setArtCaption = projectMeta.setArtCaption;

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
    if (!pending) return;
    const trimmed = pending.value.trim();
    // A non-empty title renames the chapter (and shows again if it had been
    // hidden). An emptied field is NOT a request to unname the chapter — that
    // would drop its opener and rail header out from under the cook mid-edit
    // — it only hides the printed title, via `titleOverride`; the section's
    // real name (`title`) is untouched, so the rail/mobile sheet/TOC/running
    // header keep showing it.
    if (trimmed) {
      updateSection(pending.sectionId, { title: trimmed, titleOverride: undefined });
    } else {
      updateSection(pending.sectionId, { titleOverride: "" });
    }
  }, [updateSection]);

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
    // Committing an empty title hides it on the page (`titleOverride`)
    // without renaming the chapter away — see `flushSectionRename`.
    const trimmed = editingSectionTitle.trim();
    if (trimmed) {
      updateSection(editingSectionId, { title: trimmed, titleOverride: undefined });
    } else {
      updateSection(editingSectionId, { titleOverride: "" });
    }
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

  /**
   * The defaults that turn a stack of recipes into a book: a cover, a table
   * of contents, and chapters when there's enough to group. Pure — reads
   * `meta`/`scaffoldItems`/`currentTemplate`, returns a patch rather than
   * committing one — which is what lets `scaffoldCookbook` below apply it in
   * place for a legacy document. Anything already set up (a cover, named
   * sections) is respected, not overwritten — each field is only returned
   * when the source doesn't already have one.
   */
  function buildCookbookScaffoldPatch(
    meta: ProjectMeta,
    scaffoldItems: QueueItem[],
    currentTemplate: RecipePrintTemplate,
  ): CookbookScaffoldPatch {
    const joinedSections = buildSections(scaffoldItems, meta);
    // Open a fresh book on a premium theme so the first view looks designed. A
    // premium theme the cook already chose is respected; anything else (the plain
    // Classic default) opens on Bistro.
    const bookTemplate = cookbookTemplateFor(currentTemplate);
    // Lead with a confident, giftable title instead of exposing an empty-state
    // implementation detail such as "Untitled Cookbook".
    const images = Array.from(
      new Set(scaffoldItems.map((item) => item.recipe?.image).filter((src): src is string => Boolean(src))),
    );
    const gridCount = images.length >= 6 ? 6 : images.length >= 4 ? 4 : images.length >= 2 ? 2 : 0;
    const cover: CoverConfig | undefined = meta.cover
      ? undefined
      : {
          title: "Our Favorite Recipes",
          subtitle: "Recipes worth making again and again",
          template: bookTemplate,
          style: "photo",
          creditLabel: "compiled-by",
          layout: gridCount > 0 ? "collage" : images.length === 1 ? "photo" : "typographic",
          ...(gridCount > 0
            ? { gridImages: images.slice(0, gridCount) }
            : images.length === 1
              ? { imageUrl: images[0] }
              : {}),
        };
    // A minimal closing page (template band on the theme's paper); the cook
    // can add a blurb / "from the kitchen of" line by editing it.
    const backCover: CoverConfig | undefined = meta.backCover
      ? undefined
      : { title: "", template: bookTemplate };
    const frontMatter: CookbookFrontMatter | undefined =
      namedSectionCount(joinedSections) === 0 && !meta.frontMatter && !meta.dedication
        ? { kind: "dedication", heading: "Dedication", body: "" }
        : undefined;
    return {
      template: bookTemplate,
      // Give the book a default print format (US Letter) so export geometry is
      // set from the start; a returning book keeps whatever it chose.
      cookbookPreset: meta.cookbookPreset ? undefined : DEFAULT_COOKBOOK_PRESET_ID,
      // The premium default is an editorial spread: the recipe's full-bleed
      // photograph on the left, with its recipe page facing it on the right.
      photoStyle: meta.photoStyle ? undefined : "full",
      cover,
      backCover,
      tableOfContents: true,
      sectionDividers: false,
      frontMatter,
    };
  }

  // Turning a print job into a cookbook shouldn't drop the cook into an empty
  // shell — scaffold the book they'd have built by hand. Reached from the
  // pending-import effect above, for a fresh project born from the homepage's
  // Cookbook tab.
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
    const patch = buildCookbookScaffoldPatch(projectMeta.meta, items ?? [], template);
    if (patch.template !== template) setTemplate(patch.template);
    // Turn recipe photos on so the scaffolded book looks finished rather than
    // bare. The source link stays OFF by default — a bound cookbook rarely wants
    // a URL under every recipe; the cook can turn it on if they do.
    if (patch.cookbookPreset) projectMeta.setCookbookPreset(patch.cookbookPreset);
    if (patch.photoStyle) projectMeta.setPhotoStyle(patch.photoStyle);
    if (patch.cover) projectMeta.setCover(patch.cover);
    if (patch.backCover) projectMeta.setBackCover(patch.backCover);
    projectMeta.setTableOfContents(patch.tableOfContents);
    projectMeta.setSectionDividers(patch.sectionDividers);
    if (patch.frontMatter) projectMeta.setFrontMatter(patch.frontMatter);
    projectMeta.setCookbookWelcomeCompleted(true);
    // Every recipe gets its own full page — no auto-pairing. The cook can turn
    // an individual recipe into a full-page photo spread from the page controls.
    return patch.template;
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
      // one: someone should see a book before being asked to pay for one.
      track("cookbook_welcome_shown", { price: cookbookPrice, recipeCount: items?.length ?? 0 });
      setShowCookbookOfferDialog(true);
    }, 1650);
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
  // the stored book default. So setting all recipes to "In page" flips the
  // book-wide control to "In page" too.
  // Returns null when recipes use a MIX of photo modes, so the book-wide control
  // shows nothing selected rather than pretending one option applies to all.
  const bookPhotoStyle = useMemo<PhotoStyle | null>(() => {
    const withImage = (items ?? []).filter((item) => item.recipe?.image);
    if (withImage.length === 0) return photoStyle;
    const modes = new Set(withImage.map((item) => photoModeFor(item.id)));
    return modes.size === 1 ? (Array.from(modes)[0] as PhotoStyle) : null;
  }, [items, photoModeFor, photoStyle]);

  // Toggling the book-wide "Recipe link" setting overrides every per-recipe
  // choice, the same way a book-wide Photos option does (above): the book snaps
  // to what was just chosen, so "off" means off. Handed to every control that
  // flips the setting; loading a saved project sets it directly and leaves the
  // overrides alone.
  const setBookShowSourceUrl = useCallback(
    (next: SetStateAction<boolean>) => {
      setShowSourceUrl(next);
      projectMeta.clearItemLinkOverrides();
    },
    // `clearItemLinkOverrides` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectMeta.clearItemLinkOverrides],
  );

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


  // The opener CARD's own toolbar button — independent of the facing/art
  // page's (`renderArtPhotoControl` below). Not one dialog offering both
  // slots: this opens a PLAIN picker (no placement row) scoped to the card's
  // own photo/collage, exactly like a recipe's or the cover's.
  const renderCardPhotoControl = (sectionId: string) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) return null;
    const ownImages = sectionRecipeImages(section);
    // Nothing to place if the section has neither a chosen photo nor any recipe
    // image to seed one from — hide the toggle rather than offer a blank page.
    if (!section.cardPhotoUrl && !section.cardGridImages?.length && ownImages.length === 0) {
      return null;
    }
    const edit = buildCardPhotoEdit(section);
    return (
      <ImagePicker
        current={edit.photoUrl}
        images={edit.recipeImages ?? []}
        onSelect={(url) => edit.onPhotoChange?.(url)}
        gridImages={edit.gridImages}
        onGridChange={edit.onGridChange}
        gridMax={edit.gridMax}
        openSignal={photoDialogSignal(`card:${sectionId}`)}
        onOpenSignalConsumed={() => clearPhotoDialogSignal(`card:${sectionId}`)}
        label={section.cardPhotoUrl || section.cardGridImages?.length ? "Photo" : "Add photo"}
        className="recipe-page-toolbar__photo"
      />
    );
  };

  // The facing/art page's own toolbar button — independent of the opener
  // card's above. Same plain-picker shape.
  const renderArtPhotoControl = (sectionId: string) => {
    const section = sections.find((candidate) => candidate.id === sectionId);
    if (!section) return null;
    const ownImages = sectionRecipeImages(section);
    if (!section.artPhotoUrl && !section.artGridImages?.length && ownImages.length === 0) {
      return null;
    }
    const edit = buildArtPhotoEdit(section);
    return (
      <ImagePicker
        current={edit.photoUrl}
        images={edit.recipeImages ?? []}
        onSelect={(url) => edit.onPhotoChange?.(url)}
        gridImages={edit.gridImages}
        onGridChange={edit.onGridChange}
        gridMax={edit.gridMax}
        openSignal={photoDialogSignal(`art:${sectionId}`)}
        onOpenSignalConsumed={() => clearPhotoDialogSignal(`art:${sectionId}`)}
        label={section.artPhotoUrl || section.artGridImages?.length ? "Photo" : "Add photo"}
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
          imageUrl: frontMatter.imageUrl,
          gridImages: frontMatter.gridImages,
          layout: frontMatter.layout,
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
              imageUrl: cover.imageUrl,
              gridImages: cover.gridImages,
              layout: cover.layout,
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
    if (navItem.kind === "section-photo") {
      // This is the facing page's OWN delete, not the chapter's — clearing it
      // just drops the art (photo/collage/caption), which collapses the leaf
      // away, exactly like picking "None" in its photo dialog. No confirm: a
      // lost photo is a much smaller loss than a lost chapter, re-added in one
      // click, and every other photo removal in this app already works this
      // way. Falling through to the generic cover-delete branch below would be
      // wrong here — `coverSideFromNavItem` defaults to "front" for anything
      // it doesn't recognize, which would have deleted the book's FRONT COVER
      // instead of this page's art.
      setArtPhoto(navItem.recipeId, "none");
      setArtCaption(navItem.recipeId, undefined);
      return;
    }
    const side = coverSideFromNavItem(navItem);
    setPendingDelete({
      kind: "cover",
      side,
      title: navItem.label || (side === "front" ? "cover" : "back cover"),
    });
  }, [items, itemIdsForSection, sectionTitleForId, setArtPhoto, setArtCaption]);

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

  async function printNow() {
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
    // it from a 350ms `setTimeout` with no gesture at all.
    window.print();
    // `window.print()` returns at once whether or not a sheet opens, so watch
    // for `beforeprint`. iOS Safari lets a tab print once and puts its own
    // "blocked from automatically printing" alert (Ignore / Allow) in front of
    // every print after that. `print()` has already returned and no event fires
    // until they tap Allow, so from here this looks exactly like a refusal, and
    // it is not one: leave the page alone. Reloading it here, as this used to,
    // took the alert away with it and made the tap look eaten (see
    // one-print-per-document in memory). The sheet still arrives via
    // `beforeprint`, which re-renders the deck itself.
    if (printWatchdogRef.current !== null) window.clearTimeout(printWatchdogRef.current);
    printWatchdogRef.current = window.setTimeout(() => {
      printWatchdogRef.current = null;
      setPrintAwaitingBrowser(false);
      if (printAcceptedRef.current) return;
      // No `beforeprint` yet, so nothing is going to fire `afterprint` to put
      // the deck back to its five-page window. Left as it is, a print that is
      // still waiting on Safari's alert (or was dismissed) leaves the entire
      // book rendered on a page the cook is still using.
      setRenderAllPages(false);
      track("print_refused_by_browser", { template, cardSize });
    }, PRINT_ACCEPTANCE_GRACE_MS);
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

  function recipeTitleForId(itemId: string) {
    const item = items?.find((entry) => entry.id === itemId);
    return (item?.recipe?.title || item?.title || "").trim();
  }

  // Sorting is a real reorder, not a view: the organizer shows the book, so A–Z
  // has to move the pages themselves — otherwise the tiles and the printed
  // order would disagree. Each section sorts within itself; section order is
  // the cook's own.
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
    // A name the cook typed outranks any we would derive — the same first rule
    // `projectDisplayTitle` applies to the device shelf. Without this the
    // rename lived only in session metadata: the library went on showing the
    // cover's title, and reopening the project dropped the new name entirely.
    // Past that first rule the two chains differ: the shelf appends "+ N more"
    // and ends in a plain label, an account save takes the first recipe's title
    // as it is and ends in a dated one.
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
    forgetSaveIntent();
  }

  /** `projectIdOverride` points this save at a specific document — used when
      leaving files the content back over the project it already was. */
  async function handleSaveProject(projectIdOverride?: string) {
    if (!cookPilotUser) {
      // Written down, not just remembered. On a phone the next thing that
      // happens is `signInWithRedirect` taking the page away — see
      // `lib/saveIntent`, which is what makes the press survive that.
      saveAfterLoginRef.current = true;
      rememberSaveIntent(cookbookProjectId);
      setCookPilotLoginReason("default");
      setShowCookPilotLogin(true);
      return;
    }
    if (!projectAttachChecked) {
      /**
       * Signed in, but we do not yet know whether this account already holds
       * this project — the reattach read is still out.
       *
       * Saving into that gap sends the write down the ADOPTION path, because
       * not having a save identity is what chooses that path, and adoption
       * replaces the destination rather than writing against its revision. It
       * refuses a document it has never written, so the cook gets "Newer
       * version found" about their own book, a second after opening it, for no
       * reason but our timing. Waiting a round trip turns the same press into
       * an ordinary save against a known revision.
       *
       * The press is not dropped: `saveAfterLoginRef` is the existing "a save
       * is waiting for the account to be ready" flag, and the effect that
       * consumes it already waits on exactly this. The status says so, so the
       * button is never a press that appears to do nothing.
       */
      saveAfterLoginRef.current = true;
      setSaveStatus("saving");
      return;
    }
    // Assembled BEFORE the in-flight check, so a save that has to wait waits
    // holding the book it was asked to write. The workspace it came from is
    // carried with it for the same reason — see `PendingSave`.
    //
    // `projectIdOverride` rides along inside the assembled document (it is the
    // `id` the project was built with), so there is no longer a second thing to
    // remember to queue beside the intention: a save aimed at a specific
    // document cannot lose its aim on the way to being replayed.
    const pending = currentPendingSave(projectIdOverride);
    if (!pending) {
      // Nothing to write — an empty workspace, or no account. Whatever the
      // autosave loop marked as attempted was therefore never attempted at all,
      // and must not be treated as a change that has had its turn (see
      // `lastAttemptedFingerprintRef`), or this edit is never offered again.
      lastAttemptedFingerprintRef.current = null;
      return;
    }
    if (saveInFlightRef.current) {
      // Newest wins: the queue holds one save because only the latest state is
      // worth writing, and each snapshot already contains everything before it.
      queuedSaveRef.current = pending;
      return;
    }
    await writeProject(pending);
  }

  /** The workspace as a document to write, or null when there is nothing to
      write — no account, or nothing on the desk. */
  function currentPendingSave(projectIdOverride?: string): PendingSave | null {
    const project = currentProject(projectIdOverride);
    if (!project) return null;
    return {
      project,
      items,
      meta: projectMeta.meta,
      layout: currentLayoutSettings(),
      overwriteApproved: adoptionOverwriteApprovedRef.current,
    };
  }

  /**
   * Writes one assembled document — the body lives in `lib/printSaveWrite`, which
   * has the latch, the generation and the deadline and is tested on its own.
   * What stays here is only what belongs to this component: the refs it shares
   * with the rest of the save path, and the setters and I/O the write reports
   * through. Built when a write starts and reused for a queued replay, which is
   * what the closure this replaced did.
   */
  async function writeProject(pending: PendingSave) {
    await runSaveWrite(pending, {
      refs: {
        saveInFlight: saveInFlightRef,
        saveGeneration: saveGenerationRef,
        queuedSave: queuedSaveRef,
        projectRevision: projectRevisionRef,
        savedProjectId: savedProjectIdRef,
        lastSavedCookbookMode: lastSavedCookbookModeRef,
        lastSavedFingerprint: lastSavedFingerprintRef,
        quietFirstSave: quietFirstSaveRef,
      },
      materializePhotos: materializeProjectPhotos,
      saveProject: savePrintProject,
      adoptProject: adoptAnonymousProject,
      isConflictError: (error) => error instanceof PrintProjectConflictError,
      adoptionFailed: () => readAdoptionManifest()?.status === "failed",
      setSaveStatus,
      setSavedProjectId,
      showToast,
      adoptUploadedPhotos: (uploaded) => queue.adoptUploadedPhotos(uploaded),
      metaProjectId: () => projectMeta.meta.projectId,
      setMetaProjectId: (id) => projectMeta.setProjectId(id),
    });
  }

  /**
   * Going home: navigate right away, then put this project away and start a
   * fresh one behind that.
   *
   * The filing work — `fileProjectLocally` re-serializes the WHOLE local
   * shelf, up to `MAX_LOCAL_PROJECTS` projects with their recipes inline (see
   * the comment on that constant) — used to run before `goHome()`, on the
   * reasoning that clearing the desk had to be gated on the write succeeding.
   * That reasoning still holds, but blocking the navigation on it does not:
   * a click on the logo froze on however large the shelf had grown, when nothing
   * about leaving actually depends on the write finishing first.
   *
   * So navigation goes first, and the write/clear/save follow in a `setTimeout`
   * right after — off the paint that takes you to "/", not off the safety
   * gate. Clearing still only happens once the write reports success: a
   * failed write (private mode, quota) leaves the working copy exactly where
   * it was, sessionStorage and all, and the homepage's own recovery has
   * nothing to do because there was never a `/print` reload to recover from.
   *
   * The ACCOUNT copy is fired and not awaited, same as before — it is not
   * load-bearing, the device copy already made this safe, and a signed-in
   * cook ends up with both copies regardless of timing.
   */
  /** Re-entrancy guard: one click on the logo should file the project once,
      not once per click before navigation actually leaves. */
  const leavingHomeRef = useRef(false);

  /**
   * Home, on the far side of any dialog's history bookkeeping.
   *
   * A dialog closing in the same breath as a navigation used to eat the
   * navigation outright — see `navigateAfterOverlayHistory`, which is where the
   * whole mechanism is written down.
   */
  function goHome() {
    navigateAfterOverlayHistory(() => router.push("/"));
  }

  /**
   * Leaving never asks. There used to be a "Keep this project?" confirm here for
   * a signed-out cook; it is gone on purpose. It showed for a lone recipe (a
   * quick print, which is not a project) and could show for signed-in cooks whose
   * auth had not resolved yet, and neither is a moment to interrupt someone leaving.
   */
  function handleNavigateHome() {
    if (leavingHomeRef.current) return;

    const printable = queue.items.some((item) => item.status === "ready" && item.recipe);

    leavingHomeRef.current = true;
    goHome();
    if (!printable) return;

    // Filing the project — and the account save riding on it — happens after
    // navigation has actually kicked off, so the (possibly large) shelf
    // rewrite in `fileProjectLocally` never sits between a click and the page
    // leaving. See the comment above this function for why blocking on it was
    // never required for safety in the first place.
    window.setTimeout(() => {
      // Files under the project this content already is, if it has been
      // printed before — so the account save below is pointed at the same
      // document rather than creating its own copy of it.
      const filed = fileProjectLocally(queue.items, projectMeta.meta);
      if (filed) projectMeta.setProjectId(filed);
      /**
       * Leaving does not put a draft in the account.
       *
       * This used to be `cookPilotUser && filed`, so being signed in was the
       * whole condition: print a few cards, click the logo, and a copy landed
       * in the profile of someone who never asked for one. Signing in is how
       * you reach your saved work, not a standing instruction to keep
       * everything you touch, and a library that fills itself with every
       * Tuesday's dinner prints is a log rather than a library.
       *
       * `autosaveEnabledForCurrentMode` is the existing answer to "did the
       * cook ask us to keep THIS" — this mode of this project has been saved
       * at least once. Reusing it rather than restating the condition keeps
       * the two from drifting apart. The local shelf below is unaffected:
       * that is the working copy people rely on when they reopen /print, and
       * it never leaves the device.
       */
      if (filed && autosaveEnabledForCurrentMode) void handleSaveProject(filed);

      // Only now is the desk safe to clear — and releasing the project id is
      // the half that makes the next import a NEW project rather than another
      // edit of this one.
      if (filed) {
        queue.clear();
        projectMeta.startNewProject();
      }
    }, 0);
  }

  // Best-effort push to Firestore when the tab is being hidden/closed, so a
  // signed-in edit still inside the 1.5s autosave debounce isn't left only in
  // the local recovery mirror until the next visit. The durable localStorage
  // mirror (lib/queue, lib/project) is the real safety net; this just narrows
  // the window where the *cloud* copy is a beat behind. Republished each commit
  // via an effect (not during render, mirroring handlePrintRef below) so it
  // closes over the current book. It must never trigger the sign-in modal on the
  // way out, and must not save when nothing changed — otherwise every tab close
  // would write and could bump the revision other tabs are editing against.
  useEffect(() => {
    flushOnHideRef.current = () => {
      const worthFlushing = shouldFlushOnHide(
        {
          autosaveEnabledForCurrentMode,
          projectAttachChecked,
          itemCount: items?.length ?? 0,
          saveInFlight: saveInFlightRef.current,
          saveQueued: queuedSaveRef.current !== null,
          lastSavedFingerprint: lastSavedFingerprintRef.current,
        },
        () => printProjectFingerprint(items, projectMeta.meta, currentLayoutSettings()),
      );
      if (worthFlushing) void handleSaveProject();
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
   * know what that account already holds. Also the save that was waiting only
   * on the second half of that, pressed while the reattach read was still out
   * (see `handleSaveProject`).
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
    if (!cookPilotUser || !projectAttachChecked) return;
    /**
     * And there must be something to save.
     *
     * After a sign-in REDIRECT this runs on a freshly loaded page, where the
     * account arrives well before the recipes do — the queue hydrates from
     * storage, and `jobIds` is projected from it. Firing the save into that
     * gap meant `currentProject()` answered null, the save returned having
     * written nothing, and the promise was spent: the one path where the whole
     * mechanism exists was the one where it reliably did nothing. So wait for
     * the book, the same way the autosave loop does.
     */
    if (projectLoading || !items?.length) return;
    // And the working copy must know which project it IS. `cookbookProjectId`
    // falls back to a freshly minted id until the metadata has hydrated, and
    // the check below clears an intent recorded against a different project —
    // so reading it a beat early would not merely miss the save, it would throw
    // the promise away. Both routes into this effect already imply hydration;
    // saying so is cheaper than depending on that staying true.
    if (!projectMeta.hydrated) return;
    // Both halves of the same promise, spent together. `takeSaveIntent` is
    // one-shot and is also how a save survives the page being destroyed by a
    // sign-in redirect; the ref covers the popup path and a browser that
    // cannot store anything.
    const asked = takeSaveIntent(cookbookProjectId);
    if (!saveAfterLoginRef.current && !asked) return;
    saveAfterLoginRef.current = false;
    forgetSaveIntent();
    void handleSaveProject();
    // The uid, not the User object — Firebase replaces that object on every
    // token refresh, and this should fire on signing in, not hourly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotUser?.uid, projectAttachChecked, projectLoading, items, projectMeta.hydrated]);

  // Resumes checkout once an account exists, for a cook who chose a Pro plan
  // and was then sent through a phone's sign-in redirect — which reloads the
  // page and would otherwise lose the plan they already chose inside
  // `ProUpgradeDialog`. A same-tab sign-in (popup or email/password) never
  // reaches this effect at all: the dialog calls `onChoose` itself the
  // moment `CookPilotLoginForm` reports success, with no reload in between.
  // No project to wait on here, unlike the save intent above — just an
  // account.
  useEffect(() => {
    if (!cookPilotUser) return;
    const intent = takeProUpgradeIntent();
    if (!intent) return;
    // `intent.trigger` is passed explicitly rather than left to read
    // `proUpgradeTrigger` state: `setProUpgradeTrigger` below wouldn't be
    // reflected until the next render, and `continueProCheckout` needs the
    // right answer in THIS call, synchronously, to decide whether to resume
    // a print afterward.
    setProUpgradeTrigger(intent.trigger);
    continueProCheckout(intent.cycle, intent.trigger);
    // The uid, not the User object — see the save-intent effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotUser?.uid]);

  const {
    revenueCatUserId,
    customerInfo,
    customerInfoStatus,
    customerInfoLastVerifiedAtMs,
    setCustomerInfo,
    markCustomerInfoVerified,
    selectedPremiumTemplate,
  } = usePremiumTemplatePurchase({
    items,
    cookPilotUser,
    cookPilotAuthReady,
    template,
    showToast,
    showErrorToast,
  });

  // The live RevenueCat read whenever it succeeded — even confirming
  // "nothing owned" — or, only when that live check itself failed, a
  // bounded fallback built from the last server-verified Firestore mirror.
  // Every entitlement predicate downstream (via `computeProLocks`) reads
  // this instead of the raw `customerInfo`, so an already-verified paying
  // user isn't randomly locked out by a momentary RevenueCat/network outage
  // — and a mirror that's actually past its real expiration still fails
  // locked, recomputed against the current clock on every render. See
  // lib/proAccessFallback.ts.
  const effectiveCustomerInfo = useMemo(
    () =>
      resolveEffectiveCustomerInfo({
        liveCustomerInfo: customerInfo,
        liveStatus: customerInfoStatus,
        liveLastVerifiedAtMs: customerInfoLastVerifiedAtMs,
        mirroredEntitlements,
        mirrorSyncedAtMs,
        nowMs: Date.now(),
      }),
    [customerInfo, customerInfoStatus, customerInfoLastVerifiedAtMs, mirroredEntitlements, mirrorSyncedAtMs],
  );

  // Resumes a print that was waiting on Pro checkout when a reload tore the
  // page down mid-purchase — see `rememberPendingPrintAfterCheckout`'s doc
  // comment for why that can happen even though checkout is normally a
  // same-page overlay. Never retries the purchase itself: it only fires
  // once `customerInfoStatus` reaches "ok", a live RevenueCat read, and only
  // then checks whether that read actually shows Pro active. A purchase that
  // hadn't gone through before the reload just leaves the cook back at a
  // locked Print button, exactly as if they'd never opened checkout — never
  // a second charge attempt.
  useEffect(() => {
    if (customerInfoStatus !== "ok") return;
    if (!hasPendingPrintAfterCheckout()) return;
    forgetPendingPrintAfterCheckout();
    if (hasProEntitlement(effectiveCustomerInfo.customerInfo)) void handlePrint();
    // `handlePrint` and `effectiveCustomerInfo` are both defined further
    // down in this component (a hoisted function declaration and a plain
    // value respectively); omitted here because effectiveCustomerInfo
    // recomputes on every RevenueCat poll and would otherwise refire this
    // effect on each one — `customerInfoStatus` settling to "ok" is the one
    // transition actually worth reacting to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerInfoStatus]);

  // Eligible for 20% off THIS cookbook purchase — active Pro (through the
  // same fallback-aware resolution as every other Pro check, never the raw
  // SDK value directly, since a discount is money) and this account has
  // never had a cookbook grant land before. Recomputed every render, not
  // cached past a purchase — see `onCookbookGranted` below for how a fresh
  // grant invalidates this immediately, in the same session.
  const cookbookDiscountEligible = isFirstCookbookDiscountEligible({
    hasPro: hasProEntitlement(effectiveCustomerInfo.customerInfo),
    firstCookbookGrantedAt,
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
    discountEligible: cookbookDiscountEligible,
    showToast,
    showErrorToast,
    clearToast,
    // Cookbook protection is handled by the persistent banner in cookbook
    // mode. Do not interrupt a newly purchased book with a login modal.
    onFreshPurchase: () => undefined,
    // Optimistic: the real, webhook-confirmed timestamp lands in Firestore
    // asynchronously regardless, but a second cookbook purchase attempted
    // later in this same session must not also see `firstCookbookGrantedAt`
    // as null before that round trip completes.
    onCookbookGranted: (usedDiscount) => {
      if (usedDiscount) setFirstCookbookGrantedAt(Date.now());
    },
  });

  const { proBusy, purchaseProAndContinue } = useProPurchase({
    revenueCatUserId,
    customerInfo,
    setCustomerInfo,
    markCustomerInfoVerified,
    cookPilotUser,
    showToast,
    showErrorToast,
    clearToast,
    // Unlike a template purchase, Pro checkout only ever runs signed in (see
    // `ProUpgradeDialog`'s sign-in step and `continueProCheckout`), so there
    // is no signed-out buyer to prompt for an account afterward — this
    // always resolves to "none".
    onFreshPurchase: () => {
      postPrintActionRef.current = "none";
    },
  });
  const [showProUpgradeDialog, setShowProUpgradeDialog] = useState(false);
  // State, not a ref: the dialog's title read this during render
  // (see `proUpgradeLockReasons` below) to name the actual reason it opened,
  // which needs a re-render to show up.
  const [proUpgradeTrigger, setProUpgradeTrigger] = useState<string>("print_button");

  // `items` (below) is projected through `jobIds`, which only gains an id
  // once a parse resolves to "ready" — see the "newlyReady" effect further
  // down. So a fresh import this session just started never shows up here
  // at all while it's still parsing, and counting only `items` left the free
  // tier's one-recipe gate reading 0 for the entire time recipe #1 was
  // loading: nothing stopped a second "+Add recipe" click (or a second
  // landing-page import) from starting in that window, and both could land
  // as real recipes with neither ever having been refused. `isOursToAwait`
  // (used the same way by that same effect) scopes this to an import this
  // page session actually started, not some unrelated stale "parsing" item
  // left behind by a crashed tab — that kind of ghost item should never be
  // able to permanently lock a free account out of adding anything.
  const hasInFlightImport = queue.items.some(
    (item) => item.status === "parsing" && isOursToAwait(item.id),
  );
  const recipeCount = (items?.length ?? 0) + (hasInFlightImport ? 1 : 0);
  const { themeLocked, cardSizeLocked, multiRecipeLocked, multiRecipeAddLocked, proLocked } =
    computeProLocks({
      customerInfo: effectiveCustomerInfo.customerInfo,
      cookbookMode,
      template,
      selectedPremiumTemplate,
      cardSize,
      recipeCount,
    });
  // A free, non-cookbook account can never hold more than one recipe — see
  // `hasMultiRecipeEntitlement`'s doc comment ("nothing to grandfather...
  // either allowed or it doesn't happen"). Unlike `multiRecipeAddLocked`
  // above, this is NOT recipe-count-dependent: it's what lets an empty
  // project's library picker still offer exactly one pick rather than none.
  const singleRecipeOnly = !cookbookMode && !hasMultiRecipeEntitlement(effectiveCustomerInfo.customerInfo);
  function handleMultiRecipeBlocked(info: MultiRecipeBlockedInfo) {
    if (info.source === "library") {
      // The pickers already refuse to let a locked account select more than
      // fits (see `libraryLocked`/`librarySingleSelect` below), so this only
      // fires as a safety net — still worth saying something rather than the
      // recipes just quietly not being there.
      showToast("Adding more than one recipe at a time is part of Pro.");
    } else {
      const noun = info.source === "image" ? "photo" : "page";
      showToast(
        `This ${noun} had ${info.foundCount} recipes — we kept the first. Printing more than one at a time is part of Pro.`,
      );
    }
    setMultiRecipeUpsellPending(true);
  }
  // Called every render (not from an effect — see `configureMultiRecipeGate`'s
  // own doc comment): cheap, and keeps the gate correct within the very
  // render that first resolves entitlement rather than one render behind.
  queue.configureMultiRecipeGate({
    singleRecipeOnly,
    onMultiRecipeBlocked: handleMultiRecipeBlocked,
  });
  function proLockFeature(): "batch_print" | "card_size" | "theme" {
    const reasons = activeProLockReasons({ themeLocked, cardSizeLocked, multiRecipeLocked }, "print_button");
    if (reasons.includes("multi_recipe")) return "batch_print";
    return reasons.includes("card_size") ? "card_size" : "theme";
  }
  // Names the actual reason(s) this dialog opened rather than a generic
  // pitch, and says so plainly when more than one applies at once (a locked
  // theme AND a locked card size, say) instead of silently picking whichever
  // happens to be checked first.
  const proUpgradeLockReasons = activeProLockReasons(
    { themeLocked, cardSizeLocked, multiRecipeLocked },
    proUpgradeTrigger,
  );
  const proUpgradeDialogCopy = proUpgradeCopy(proUpgradeLockReasons, proUpgradeTrigger);

  /**
   * Opens the upgrade dialog — plan choice first, for everyone, signed in or
   * not. `ProUpgradeDialog` itself turns into sign-in in place if the cook
   * picks a plan while signed out (see `onSignInRequired`/`onChoose` below);
   * this function no longer branches on sign-in state at all.
   */
  function openProUpgradeDialog(trigger: string) {
    setProUpgradeTrigger(trigger);
    track("paywall_viewed", { trigger });
    setShowProUpgradeDialog(true);
  }

  /**
   * A plan was chosen while signed out — `ProUpgradeDialog` is about to swap
   * to its own sign-in step, and checkout will start automatically once that
   * succeeds (see `onAuthenticated` inside the dialog, and the intent-
   * spending effect below for the case where sign-in reloads the page).
   */
  function handleProSignInRequired(cycle: ProBillingCycle) {
    rememberProUpgradeIntent(proUpgradeTrigger, cycle);
  }

  /** Starts checkout for `cycle` — called by `ProUpgradeDialog` once it's
   *  known the cook is signed in (immediately, or right after signing in
   *  inside the dialog's own sign-in step). Settles to every outcome the
   *  same way: close the dialog and return to the editor; only a completed
   *  purchase started from the PRINT button also resumes that print.
   *
   *  `trigger` defaults to the current `proUpgradeTrigger` state — right for
   *  the direct, same-tab path (`ProUpgradeDialog`'s `onChoose`), where
   *  nothing has reloaded between opening the dialog and choosing a plan.
   *  The sign-in-redirect resumption effect passes it explicitly instead,
   *  since it needs the answer synchronously and a `setProUpgradeTrigger`
   *  call right before this one wouldn't be reflected in state until the
   *  next render.
   *
   *  Every OTHER trigger — "add_more_recipes" chief among them — opens this
   *  exact same dialog but was never a print attempt, so a completed
   *  purchase from one of those must not open the system print dialog: a
   *  cook who clicked "Add more recipes," bought Pro, and landed back on
   *  /print to find the browser's print sheet already open over it, as if
   *  they'd clicked Print, is the bug this guards against.
   *
   *  Same reasoning applies to the save right below: a completed purchase
   *  is not a Save click, so it must not be the thing that first writes an
   *  unsaved project to the account (see the "save then autosave" rule —
   *  nothing reaches Firestore before an explicit Save). It only continues
   *  a save that was already agreed to, via `autosaveEnabledForCurrentMode`
   *  — the same gate the debounced autosave effect uses — so a project
   *  that's already been saved once keeps saving through a purchase, but
   *  one that never was doesn't get its first save from a purchase alone. */
  function continueProCheckout(cycle: ProBillingCycle, trigger: string = proUpgradeTrigger) {
    // Covers checkout itself being torn down by a reload (a bank redirect, 3-D
    // Secure) the same way `rememberProUpgradeIntent` covers the sign-in step
    // before it — see that function's doc comment. Cleared the moment
    // `onSettled` actually runs, since that only happens when checkout
    // resolved in this same session and needs no persisted fallback.
    if (trigger === "print_button") rememberPendingPrintAfterCheckout();
    void purchaseProAndContinue(cycle, (outcome) => {
      forgetPendingPrintAfterCheckout();
      setShowProUpgradeDialog(false);
      if (outcome !== "purchased" && outcome !== "already-active") return;
      if (outcome === "purchased") {
        track("pro_feature_used", { feature: proLockFeature() });
        if (cookPilotUser && autosaveEnabledForCurrentMode) void handleSaveProject();
      }
      if (trigger === "print_button") void handlePrint();
    });
  }

  async function handlePrint() {
    if (cookbookPurchaseBusy || proBusy) return;
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
      proLocked,
    });
    if (gate === "unlock-cookbook") {
      // No interstitial paywall dialog — a click on Export goes straight to
      // checkout, which states the price and collects the email itself (same
      // shape as the Pro branch below). A completed purchase re-runs
      // handlePrint, which now clears the gate and exports. Signed-out
      // buying is intentionally allowed; the unlock is backed up to Firestore
      // as soon as the buyer has an account (at purchase if signed in, else on
      // the adopt-on-sign-in path).
      void purchaseCookbookAndContinue((freshPurchase) => {
        if (freshPurchase) setCookbookJustPurchased(true);
        // Buying a book is asking us to keep it.
        //
        // Saving is otherwise something a cook asks for by pressing Save, and
        // that is right for a book they are still deciding about — but nobody
        // pays $19.99 for a copy that lives in one browser. Signed out there is
        // no account to put it in; the unlock is recorded locally and the book
        // is filed to the device, and the adopt-on-sign-in path carries both
        // across when an account turns up.
        if (freshPurchase && cookPilotUser) void handleSaveProject();
        void handlePrint();
      });
      return;
    }
    if (gate === "unlock-pro") {
      // A real Pro upsell screen, unlike the cookbook's single-purchase
      // straight-to-checkout flow — Pro unlocks many things at once, so it
      // earns a dialog instead of firing checkout on the spot. The button
      // itself never reveals this in its label (always "Print") — pressing
      // it is what decides whether the job goes straight through or opens
      // this. See components/ProUpgradeDialog.tsx.
      track("pro_feature_encountered", {
        feature: proLockFeature(),
        source: "print_button",
      });
      openProUpgradeDialog("print_button");
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

  // The Print button is truly *disabled* while a purchase is settling (a real
  // async operation the click can't preempt) or while the deck is empty (there
  // is nothing a print could do). It is NOT disabled for a measuring layout: a
  // click then is queued (see `printPending`), so the button stays live and
  // just shows a spinner until the layout is ready.
  /**
   * Would a print right now produce something that hasn't been paid for?
   *
   * Drives the print-time watermark (see `.rp-print-locked` in print.css). Both
   * paywalls used to stop at a button label, and the deck on screen is what a
   * browser print captures — so Cmd-P produced the finished article from either
   * a locked premium theme or an unpurchased cookbook. Nothing about the
   * on-screen preview changes; this only marks the paper.
   */
  const printWatermarked = proLocked || cookbookLocked;

  // Nothing on the deck yet — recipe cards read `navItems`, a cookbook reads
  // `spreads` (cookbookView is itself `spreads.length > 0`, so this only ever
  // fires in the recipe-cards case, but checking both keeps this correct if
  // that relationship ever changes).
  const nothingToPrint = navItems.length === 0 && spreads.length === 0;
  const printBlocked = proBusy || cookbookPurchaseBusy || nothingToPrint;
  // `printAwaitingBrowser` is the second or so between asking to print and
  // knowing whether the browser took it. Nothing is on screen during that gap
  // when the answer turns out to be no, and a button that looks untouched is
  // what a refused print has always looked like. Deliberately NOT keyed on
  // `nothingToPrint` — a spinner reads as "working", and a disabled button
  // sitting on an empty deck isn't.
  const printSpinner = proBusy || cookbookPurchaseBusy || printPending || printAwaitingBrowser;

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
    if (printPending && printLayoutReady && !proBusy && !cookbookPurchaseBusy) {
      void handlePrintRef.current();
    }
  }, [printPending, printLayoutReady, proBusy, cookbookPurchaseBusy]);

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
     *    `LOADED_BASELINE` sentinel either: that sentinel exists to stop a freshly
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
          cookbookMode: savedProjectOpensAsCookbook(project),
          cookbookWelcomeCompleted: project.settings.cookbookWelcomeCompleted,
          cookbookPreset: project.settings.bookPreset,
          tableOfContents: project.settings.tableOfContents,
          sectionDividers: project.settings.sectionDividers,
          tocKicker: project.settings.tocKicker,
          tocTitle: project.settings.tocTitle,
          photoStyle: project.settings.photoStyle,
          railSortMode: project.settings.railSortMode,
          lastImportSource: project.settings.lastImportSource,
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
            titleOverride: section.titleOverride,
            subtitle: section.subtitle,
            cardPhotoMode: section.cardPhotoMode,
            cardPhotoUrl: section.cardPhotoUrl,
            cardGridImages: section.cardGridImages,
            artPhotoMode: section.artPhotoMode,
            artPhotoUrl: section.artPhotoUrl,
            artGridImages: section.artGridImages,
            artCaption: section.artCaption,
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
          lastSavedFingerprintRef.current = LOADED_BASELINE;
          // Whatever this document loaded as IS the last thing it was saved
          // as — the same value just used to set `cookbookMode` above, so a
          // reopened project starts agreeing with itself.
          lastSavedCookbookModeRef.current = savedProjectOpensAsCookbook(project);
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
        // The other reattach path (the `?project=` loader above) sets these
        // same three right after finding its match; this one didn't, which
        // is the whole bug report — a refresh restored the ID (autosave
        // correctly kept targeting the real document) but never told
        // `saveStatus` or the header about it, so the Save button came back
        // for a project that was never actually unsaved.
        setSaveStatus("saved");
        // `LOADED_BASELINE` is a sentinel the autosave effect below already
        // knows how to consume: it seeds the real fingerprint from the
        // live document on its first pass instead of comparing against
        // nothing, which is what a bare `null` here would do — declaring
        // an untouched reload "changed" and firing a real save at nothing.
        lastSavedFingerprintRef.current = LOADED_BASELINE;
        // `loadPrintProjectHead` reads identity and revision only (see its
        // own doc comment) — not settings, so there's no saved `cookbookMode`
        // to read here the way the full-project loader above has one. The
        // live value is the right stand-in: nothing has changed it since
        // the save this is reattaching to, or there'd be a real edit to
        // autosave in the first place.
        lastSavedCookbookModeRef.current = cookbookMode;
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
      // The homepage's Cookbook tab carries its choice the same way "New
      // cookbook" from the library does — `cookbookIntent` on project meta,
      // set by `startNewProject({ cookbook: true })` right before the
      // handoff. Consumed HERE rather than left to the separate
      // cookbookIntent effect further down: that one waits on `items` to
      // finish hydrating, and the recipe this same pending import is about
      // to start parsing can resolve before it gets there. A roundup link or
      // a multi-recipe photo blooms into every recipe it found only while
      // `cookbookMode` is already true (see `singleRecipeOnlyRef` in
      // lib/queue.ts) — so the scaffold has to land before `queue.addX`
      // below, not sometime after it.
      //
      // `offerAfter: true`, unlike the library's "New cookbook" flow: the
      // homepage tab dropped its own pricing banner in favor of this dialog
      // doing that job once the book is actually built, over the finished
      // article rather than a bare choice of tabs.
      if (projectMeta.meta.cookbookIntent && !projectMeta.meta.cookbookMode) {
        projectMeta.clearCookbookIntent();
        beginCookbookBuild({ offerAfter: true });
      }
      // A cookbook begun with nothing in it: the book is built above, and
      // there is no recipe to add.
      if (pending.kind === "empty") return;
      // A landing page's capture block means "start me a fresh recipe",
      // never "add to whatever is already open" — the whole point of that
      // page is a free, single-recipe import (see SeoCapture's own file
      // comment). Import one, then use Back to return to the SEO page you
      // came from (the project you just built is still sitting on /print)
      // and submit a second link there, and it used to land in that SAME
      // project — which on the free tier meant either silently growing a
      // batch-print job nobody paid for, or (an earlier version of this
      // fix) refusing the second recipe outright. Neither is right: the
      // cook didn't ask to combine two recipes, they asked to import a
      // different one. Clearing first makes the second import replace the
      // first, the same "fresh start" the capture block always promised —
      // and it only applies on the free tier, where nothing could have
      // been printed as a batch anyway; Pro and cookbook mode keep
      // accumulating recipes across imports, same as before.
      //
      // Recomputed here rather than reusing the outer `multiRecipeAddLocked`
      // on purpose: that one is derived from `items`, which is itself
      // projected through `jobIds` — and `jobIds` is only set by a LATER
      // bootstrap effect that reads a separately-persisted job-id list,
      // which can still be empty on a brand-new mount even once the queue
      // itself already holds the earlier recipe. `queue.items` doesn't go
      // through that second hop: `useQueue`'s hydration sets it in the same
      // batch as `hydrated`, so it's already correct the moment this effect
      // (gated on `queue.hydrated`) runs — which is exactly the fresh-mount
      // case this happens in (Back always remounts this page).
      const recipeCountNow = queue.items.filter(
        (it) => it.status === "ready" && Boolean(it.recipe),
      ).length;
      const { multiRecipeAddLocked: wouldBeLocked } = computeProLocks({
        customerInfo: effectiveCustomerInfo.customerInfo,
        cookbookMode,
        template,
        selectedPremiumTemplate,
        cardSize,
        recipeCount: recipeCountNow,
      });
      if (wouldBeLocked) queue.clear();
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

  /**
   * Which projects write themselves to the account, without being asked: the
   * ones somebody asked us to keep, and only those. One rule, both kinds.
   *
   * Once a copy exists, every edit after that is an edit to a thing in your
   * library, so it goes there on its own. Until then nothing is written and the
   * bar makes no claim. What starts the first copy is `keptAutomatically` (a
   * cookbook, or a second recipe) or a signed-out cook signing in to keep it.
   *
   * Cookbooks used to be exempt — `isCookbookDocument` was ORed in here, so a
   * book autosaved from its first edit on the reasoning that building one was
   * deliberate enough to count as asking. Two things were wrong with that. A
   * card job that had once been a cookbook still carries the book in
   * `stashedCookbook`, so it counted too: printing a few cards, looking at what
   * a cookbook would be, and coming back put an ordinary print job into the
   * autosaving state — which is where the header went quiet and said "Saved"
   * about a document nobody had asked for. And a save that happens without
   * being asked is a save nobody watches: when one silently stopped landing,
   * there was no button and no moment where a cook could have noticed.
   */
  const autosaveEnabled = savedToProfile;

  /**
   * `autosaveEnabled` alone answers "has this document ever been saved" —
   * not "has THIS MODE of it." Comparing `lastSavedCookbookModeRef` (set on
   * every successful save and on load — see its own comment) against the
   * CURRENT `cookbookMode` is what closes the gap: a cards project already
   * saved keeps autosaving cards edits normally (the two already agree), but
   * the moment `cookbookMode` flips to `true` in memory without a save
   * having happened yet, they disagree and every automatic save site below
   * stands down until an explicit Save press brings them back into
   * agreement. Explicit saves (a button press, a completed purchase, the
   * sign-in-intent replay) are untouched by this — they should always be
   * allowed to save regardless of which mode was last agreed to, since an
   * explicit save is exactly what restores agreement.
   */
  const autosaveEnabledForCurrentMode = autosaveEnabled && lastSavedCookbookModeRef.current === cookbookMode;

  /**
   * The two kinds of job a signed-in cook never has to ask us to keep.
   *
   * A cookbook is kept from the moment it exists: it is deliberate, and it is
   * the thing most worth not losing. A card job is kept once it has a second
   * recipe: one recipe is a quick print that should not feel like a project,
   * two is something a cook is putting together and will want back. Neither
   * has a Save button. Below that (one card) nothing is written until the job
   * grows or somebody signs in and asks, from the leave dialog.
   *
   * This is the one save nobody presses. It fires once per project, after the
   * build reveal has finished so the book that lands is the finished one and
   * not the empty shell, and it hands over to the ordinary autosave the moment
   * it lands (`savedProjectId` is set, and `lastSavedCookbookModeRef` now
   * agrees with the mode). It is level-triggered, not an event on "a recipe
   * was added": a job that reaches two recipes while signed out is kept the
   * moment its cook signs in, and a job restored with several recipes is not a
   * quick print either.
   *
   * The reasons cookbooks lost this before are answered differently. A card
   * job that was once a cookbook no longer counts as one — the switch back to
   * recipe cards is gone, and this reads `cookbookMode`, never the stash. And
   * the save is not silent: the header (cards) or the rail (cookbooks) says
   * "Saving…" then "Saved", the first save of a card job says so in a toast,
   * and a failure surfaces in the header with a retry.
   */
  const keptOnItsOwnRef = useRef<string | null>(null);
  const keptAutomatically = cookbookMode || (items?.length ?? 0) >= 2;
  useEffect(() => {
    if (!cookPilotUser || !keptAutomatically || savedToProfile) return;
    if (projectLoading || !projectAttachChecked || cookbookBuilding || !items?.length) return;
    if (keptOnItsOwnRef.current === cookbookProjectId) return;
    keptOnItsOwnRef.current = cookbookProjectId;
    // A save is already carrying this job (a sign-in intent replayed just
    // before this ran). It reports itself, and a failure has its own retry.
    if (saveInFlightRef.current) return;
    quietFirstSaveRef.current = cookbookMode;
    void handleSaveProject();
    // handleSaveProject reads the latest render state, like the autosave below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    cookPilotUser,
    keptAutomatically,
    savedToProfile,
    projectLoading,
    projectAttachChecked,
    cookbookBuilding,
    items,
    cookbookProjectId,
  ]);


  /**
   * How many recipes a cookbook holds, and whether it is kept — at the top of
   * the page rail, above Add recipes. There is no separate name for the book
   * here: its title is the one on its cover, edited on the page itself, and the
   * header keeps the product's name the way every other page does.
   *
   * Saved is only ever said for a signed-in cook whose book is in the account
   * (`savedToProfile`) or is on its way there. A failure is not repeated here:
   * the header's save control already carries it, with the retry.
   */
  const bookSaveNote =
    cookPilotUser && saveStatus === "saving" ? (
      <span className="rp-save-status" role="status" aria-live="polite">
        <SpinnerIcon size={ICON_SIZE.sm} />
        {SAVE_STATUS_LABEL.saving}
      </span>
    ) : cookPilotUser && savedToProfile && !(saveStatus && SAVE_FAILURES.has(saveStatus)) ? (
      <span className="rp-save-status" role="status" aria-live="polite">
        <CheckIcon size={ICON_SIZE.sm} />
        {SAVE_STATUS_LABEL.saved}
      </span>
    ) : null;
  const railBookHeader = cookbookMode ? (
    <div className="recipe-page-rail__book">
      <p className="recipe-page-rail__book-meta">
        <span>
          {recipeCount} {recipeCount === 1 ? "recipe" : "recipes"}
        </span>
        {bookSaveNote}
      </p>
    </div>
  ) : null;


  useEffect(() => {
    if (projectLoading || !projectAttachChecked || !items?.length) return;
    // A draft nobody asked to keep, or a mode nobody has saved yet. The
    // status this project does show is the draft effect's business, below.
    if (!autosaveEnabledForCurrentMode) return;
    // Lazily computed — the fingerprint is a JSON.stringify of the whole book, so
    // it's produced only where actually needed (the load baseline below, and once
    // per debounce settle inside the timer), never eagerly on every keystroke.
    const fingerprint = () =>
      printProjectFingerprint(items, projectMeta.meta, currentLayoutSettings());
    if (lastSavedFingerprintRef.current === LOADED_BASELINE) {
      lastSavedFingerprintRef.current = fingerprint();
      return;
    }
    if (saveStatus === "conflict") return;
    // Debounce the whole change: only when edits settle for 1.5s do we compute the
    // fingerprint and decide whether to save. The change-detection and retry guard
    // therefore run inside the timer, against that single settled fingerprint.
    const timer = window.setTimeout(() => {
      const fp = fingerprint();
      // Only autosave once per genuine content change — see `autosaveVerdict`,
      // which explains the retry storm this stands between the page and.
      if (
        autosaveVerdict(fp, lastSavedFingerprintRef.current, lastAttemptedFingerprintRef.current) !==
        "save"
      ) {
        return;
      }
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
    autosaveEnabledForCurrentMode,
    saveStatus,
  ]);

  // The effect that used to sit here cleared the save status whenever this
  // project was not autosaving, to stop a stale "Saved" standing after a sign
  // out. It also cleared the status of the FIRST save — the one press that
  // turns autosave on — so that press reported neither its progress nor its
  // failure. Signing out is handled where it happens: the account-change effect
  // above resets the save identity and the status together, which is the only
  // event that can make this project's status a lie about somebody else's.

  useEffect(() => {
    const online = () => {
      if (saveStatus === "offline") void handleSaveProject();
    };
    const offline = () => {
      // Same reasoning as the debounce effect: a mode that hasn't been
      // explicitly saved yet has nothing pending to report as "offline."
      if (autosaveEnabledForCurrentMode) setSaveStatus("offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveStatus, autosaveEnabledForCurrentMode]);

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

  /**
   * How this project stands — shared by the desktop header and the mobile
   * topbar (see PrintDeck.tsx) so the two can't drift into reporting save
   * state differently.
   *
   * There is no prominent Save button. One recipe is a quick, one-time print
   * and should not feel like a project; from the second recipe, and from the
   * start for a cookbook, a signed-in cook's job is kept on its own (see
   * `keptAutomatically`). So this reports rather than asks:
   *
   * - a failure: the word as a button that retries, in the error colour;
   * - saving: a quiet spinner and "Saving…";
   * - kept: a quiet, persistent check and "Saved". A cookbook says this in
   *   the page rail beside its recipe count (`bookSaveNote`), so its header
   *   keeps it screen-reader-only instead of saying it twice;
   * - not kept and nothing to report: nothing.
   *
   * The one place a button survives is a SIGNED-OUT cook with a project worth
   * keeping (two recipes or a cookbook). There is no account to write to, so
   * nothing can happen automatically and the only way to keep it is to sign
   * in; "Save" is the door to that. A single card gets no door at all: it is a
   * quick print, and leaving never asks about it.
   */
  function renderSaveControl() {
    if (saveStatus) {
      // A button only when there is something to retry — a focusable
      // control that does nothing when activated is worse than plain text.
      if (SAVE_FAILURES.has(saveStatus)) {
        return (
          <button
            type="button"
            className="rp-save-state rp-save-state--failed"
            onClick={handleRetrySave}
            aria-live="polite"
          >
            {SAVE_STATUS_LABEL[saveStatus]}
          </button>
        );
      }
      // A cookbook's rail already says Saving/Saved; still announced here
      // for anyone on a screen reader, just not painted twice.
      if (cookbookMode) {
        return (
          <span className="sr-only" role="status" aria-live="polite">
            {SAVE_STATUS_LABEL[saveStatus]}
          </span>
        );
      }
      if (saveStatus === "saving") {
        return (
          <span className="rp-save-status" role="status" aria-live="polite">
            <SpinnerIcon size={ICON_SIZE.sm} />
            {SAVE_STATUS_LABEL.saving}
          </span>
        );
      }
    }
    if (savedToProfile) {
      return cookbookMode ? null : (
        <span className="rp-save-status" role="status" aria-live="polite">
          <CheckIcon size={ICON_SIZE.sm} />
          {SAVE_STATUS_LABEL.saved}
        </span>
      );
    }
    // Signed in, not kept yet: a single card, or a job about to be kept on its
    // own. Nothing to press and nothing to claim.
    if (cookPilotUser || !keptAutomatically) return null;
    return (
      <button
        type="button"
        className="btn btn-secondary btn-compact"
        onClick={() => void handleSaveProject()}
        aria-label={cookbookMode ? "Sign in to save cookbook" : "Sign in to save project"}
      >
        Save
      </button>
    );
  }

  /**
   * The one place Pro is offered as a product, not as a lock icon on
   * whichever control a cook happened to reach first.
   *
   * Every other Pro touchpoint (a theme tile's crown, "Add more recipes"
   * turning gold, the size picker) marks something ELSE as gated — which
   * teaches "this one thing needs Pro," not "Pro is a thing I could just
   * go get." This button is reachable the same way regardless of what a
   * cook is doing when they think of it, which is the only way "anytime"
   * actually holds. Reuses the exact same dialog and `openProUpgradeDialog`
   * every gated control already opens, so nothing here is a second upgrade
   * flow — only a second door into the one that exists. Hidden once Pro
   * is actually active; the point is to be found, not to nag someone who
   * already bought it.
   *
   * Also hidden in cookbook mode. Pro and cookbook are two separate
   * purchases — `computeProLocks` already waives every theme, card-size and
   * multi-recipe gate the moment `cookbookMode` is true, so there is nothing
   * left in here for Pro to unlock. A cook who owns neither would otherwise
   * see an "Upgrade to Pro" door standing open in a room where nothing is
   * actually locked.
   */
  function renderProUpgradeButton() {
    if (cookbookMode || hasProEntitlement(effectiveCustomerInfo.customerInfo)) return null;
    return (
      <button
        type="button"
        className="btn btn-premium btn-compact"
        onClick={() => openProUpgradeDialog("topbar_button")}
      >
        <CrownIcon size={ICON_SIZE.md} className="text-[var(--cp-premium-bright)]" />
        Upgrade to Pro
      </button>
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
              label={
                <span className="recipe-checkbox-label-row">
                  Two-sided
                  {/* Always here, on or off: the instruction is "how to set
                      this up once it's on," which is worth knowing while
                      deciding whether to turn it on at all, not only after.
                      It used to sit below as a permanent banner shown only
                      once the toggle was already on — this hint replaces
                      that, and doesn't wait for the same condition its
                      predecessor did. */}
                  <span className="recipe-hint">
                    <button
                      type="button"
                      className="recipe-hint__trigger"
                      aria-label="How to set up two-sided printing"
                      /* Empty on purpose: every actionable element gets a
                         native hover title for free from ActionTitles
                         (components/ActionTitles.tsx), built off aria-label
                         — which duplicated this button's own bubble right
                         beside it. `title=""` is the escape hatch that
                         component already checks for (an element that
                         already has a `title` attribute is left alone), so
                         this stays the only tooltip. */
                      title=""
                      /* Inside the checkbox's own <label>, so a plain click
                         would toggle the checkbox via the browser's normal
                         label-activates-control behavior — this is a hint,
                         not a second control, so it swallows the click
                         rather than fire that. */
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <InfoIcon size={ICON_SIZE.sm} />
                    </button>
                    <span className="recipe-hint__bubble" role="tooltip">
                      {/* The period lives INSIDE the <strong>, not after it
                          — the closing tag is a break opportunity in this
                          narrow a box, and with the period on the outside
                          it would wrap onto its own line by itself. */}
                      Turn on two-sided printing in your printer&apos;s settings, flipped on the{" "}
                      <strong>long edge.</strong>
                    </span>
                  </span>
                </span>
              }
              hint="Longer recipes print on the back too."
              checked={doubleSided}
              onChange={(event) => setDoubleSided(event.target.checked)}
          />
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
            label="Dedication"
            checked={Boolean(projectMeta.meta.frontMatter || projectMeta.meta.dedication)}
            onChange={toggleDedication}
        />
        <Checkbox
            label="Table of contents"
            checked={Boolean(projectMeta.meta.tableOfContents)}
            onChange={(event) => projectMeta.setTableOfContents(event.target.checked)}
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
    // No `offerAfter`: pitching the cookbook to someone who just clicked
    // "New cookbook" is asking a question they have already answered.
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
    if (cookPilotRedirectError) showErrorToast(cookPilotRedirectError);
  }, [cookPilotRedirectError]);

  useEffect(() => {
    if (!cookPilotUser || revenueCatUserId !== cookPilotUser.uid) return;
    setShowCookPilotLogin(false);
  }, [cookPilotUser, revenueCatUserId]);

  useEffect(() => {
    if (!cookPilotUser) {
      setMirroredEntitlements(null);
      setMirrorSyncedAtMs(null);
      setFirstCookbookGrantedAt(null);
      return;
    }
    let cancelled = false;
    loadRecipePrinterUserProfile(cookPilotUser.uid)
      .then((profile) => {
        if (cancelled) return;
        setMirroredEntitlements(profile.mirroredEntitlements);
        setMirrorSyncedAtMs(profile.syncedAtMs);
        setFirstCookbookGrantedAt(profile.firstCookbookGrantedAt);
      })
      .catch((error) => {
        if (cancelled) return;
        console.warn("RecipePrinter: could not load account profile", error);
        // Leave mirroredEntitlements/mirrorSyncedAtMs at whatever they were —
        // a Firestore read failure here shouldn't discard an already-loaded
        // fallback the live-SDK path might still need a moment from now.
      });
    return () => {
      cancelled = true;
    };
    // Same again: keyed on the uid, so a token refresh does not re-read the
    // profile document for an account that has not changed. /projects already
    // keys its account effects this way and documents why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cookPilotUser?.uid]);

  // The way back to deleted lines lives on their toast, so it goes when the
  // toast does — an Undo that outlives the message it belongs to would put a
  // section back under a cook who has moved on to something else.
  useEffect(() => {
    if (!toastMessage?.startsWith("Deleted ")) setLineDeleteUndo(null);
  }, [toastMessage]);

  // Same reasoning as `lineDeleteUndo` above: the Upgrade action belongs to
  // the toast that explained why a recipe didn't make it in, not to whatever
  // toast shows up next.
  useEffect(() => {
    if (!toastMessage?.endsWith("part of Pro.")) setMultiRecipeUpsellPending(false);
  }, [toastMessage]);

  useEffect(() => {
    function handleBeforePrint() {
      // The browser has taken the print, so the watchdog in `printNow` has its
      // answer. This also fires late, after a tap on Safari's "blocked from
      // automatically printing" alert, which is why it re-renders the deck.
      printAcceptedRef.current = true;
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
      setRenderAllPages(false);
      // Chrome on macOS sometimes doesn't hand keyboard/mouse focus back to
      // the page once a native panel (the OS "system dialog" print sheet,
      // reached via Print -> Advanced) closes - the tab looks normal but
      // stops receiving input until something forces a refocus. A reload
      // does it, which is why "refresh a few times" was the only fix a cook
      // found; asking the window to refocus itself here is the same fix
      // without losing their place.
      window.focus();
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

  // The opener CARD's own photo edit wiring — entirely independent of the
  // facing/art page below. Drives a PLAIN ImagePicker (no placement row: the
  // dialog is just "this slot's photo, or a collage, or none" — deleting the
  // photo is the None tile the plain picker already offers).
  const buildCardPhotoEdit = (section: Section | undefined) => {
    const ownImages = section ? sectionRecipeImages(section) : [];
    // Nothing ticked until the cook taps a tile. (The printed page still falls
    // back to the chapter's own recipe photos while the collage is empty; see
    // `defaultSectionGridImages` — that fallback is the renderer's, not this
    // dialog's, and stays untouched here.) Every tap writes "grid" — a single
    // ticked photo is a one-photo collage, not a different stored mode; see
    // ImagePicker's own note on why there's no separate single/multi switch.
    const gridImages = section?.cardGridImages ?? [];
    return {
      photoUrl: section?.cardPhotoUrl,
      recipeImages: ownImages,
      // Reached only by the "None" tile now — clears the photo outright.
      onPhotoChange: (url: string | undefined) => {
        if (!section || url !== undefined) return;
        projectMeta.setCardPhoto(section.id, "none");
      },
      gridImages,
      onGridChange: (urls: string[]) => {
        if (!section) return;
        projectMeta.setCardPhoto(section.id, "grid", { gridImages: urls });
      },
      gridMax: 9,
    };
  };

  // The facing/art page's own photo edit wiring — same shape as the card's
  // above, entirely independent of it (see `buildCardPhotoEdit`).
  const buildArtPhotoEdit = (section: Section | undefined) => {
    const ownImages = section ? sectionRecipeImages(section) : [];
    // See buildCardPhotoEdit: nothing ticked until the cook taps a tile.
    const gridImages = section?.artGridImages ?? [];
    return {
      photoUrl: section?.artPhotoUrl,
      recipeImages: ownImages,
      onPhotoChange: (url: string | undefined) => {
        if (!section || url !== undefined) return;
        projectMeta.setArtPhoto(section.id, "none");
      },
      gridImages,
      onGridChange: (urls: string[]) => {
        if (!section) return;
        projectMeta.setArtPhoto(section.id, "grid", { gridImages: urls });
      },
      gridMax: 9,
    };
  };
  /**
   * The one place every "add a recipe" entry point goes through — the rail's
   * header button, the mobile toolbar's Recipe button, and the empty-deck's
   * own Add recipes button all call this rather than opening the dialog
   * directly, so the multi-recipe Pro gate lives in exactly one place rather
   * than being re-checked (and possibly re-derived slightly differently) at
   * each button. The gate only applies once there is already a recipe to add
   * a second one to — an empty project's first recipe is always free — and
   * never in cookbook mode, which has always supported many recipes under
   * its own, separate per-project purchase (see hasMultiRecipeEntitlement's
   * doc comment). A cookbook's own per-chapter "Add recipes" button bypasses
   * this function entirely (it sets the pending-add state directly), which
   * is correct for the same reason.
   */
  function openAddRecipeBelow(navItem: NavItem | null = activeNavItem) {
    if (multiRecipeAddLocked) {
      track("pro_feature_encountered", { feature: "batch_print", source: "add_more_recipes" });
      openProUpgradeDialog("add_more_recipes");
      return;
    }
    const target = addRecipeTarget(navItem, sections);
    setPendingAddSectionId(target?.sectionId ?? sections[0]?.id ?? null);
    setPendingAddIndex(target?.index ?? 0);
    setPendingAddAfterRecipeId(target?.anchorId ?? null);
    setShowAddRecipeDialog(true);
  }
  /**
   * A failed parse has no useful same-input retry. Clear its terminal
   * placeholder and reopen the shared source picker so the cook can choose a
   * link, recipe app, image, or pasted text without meeting a second recovery
   * UI. This bypasses the normal "add another" gate only for the failed slot
   * itself — being replaced isn't being added to. It does NOT bypass the gate
   * for a free account that already has a real recipe sitting somewhere else:
   * that recipe was never the failed item, so removing the failed item
   * doesn't free up anything for it to be replacing.
   */
  function tryAnotherImportWay(id: string) {
    if (multiRecipeAddLocked) {
      track("pro_feature_encountered", { feature: "batch_print", source: "add_more_recipes" });
      openProUpgradeDialog("add_more_recipes");
      return;
    }
    queue.remove(id);
    setPendingAddSectionId(sections[0]?.id ?? null);
    setPendingAddIndex(0);
    setPendingAddAfterRecipeId(null);
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
   * card's picker watches. Choosing "In page" or "Full page" IS the request
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
  /**
   * Turns the signal back into a one-shot pulse once the picker has acted on
   * it. Left set, the same tick was still there the next time the deck
   * scrolled this page's picker back into view — a fresh mount with no memory
   * of ever having opened it — so the stale signal opened the dialog again on
   * every arrival, whether or not the cook had since closed it.
   */
  const clearPhotoDialogSignal = (key: string) =>
    setPhotoDialog((current) => (current?.key === key ? null : current));

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
  // None / In-page / Full-page switch that sits next to the Edit button, so
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
        openSignal={photoDialogSignal(recipeId)}
        onOpenSignalConsumed={() => clearPhotoDialogSignal(recipeId)}
      />
    );
  };
  // A full-page photo's own control. The page it sits on is the recipe's hero
  // image, so this changes `heroImageUrl` rather than the recipe's photo, and
  // offers the same None / In page / Full page placement as the recipe page
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
        onOpenSignalConsumed={() => clearPhotoDialogSignal(recipeId)}
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
        gridImages={gridImages}
        // Reached only by the "None" tile now — clears the photo outright.
        onSelect={(imageUrl) => {
          if (imageUrl !== undefined) return;
          setCoverForSide(side, {
            ...cover,
            imageUrl: undefined,
            gridImages: undefined,
            layout: "typographic",
          });
        }}
        onGridChange={(urls) =>
          setCoverForSide(side, {
            ...cover,
            gridImages: urls.length ? urls : undefined,
            imageUrl: undefined,
            layout: urls.length ? "collage" : "typographic",
          })
        }
        openSignal={photoDialogSignal(`cover:${side}`)}
        onOpenSignalConsumed={() => clearPhotoDialogSignal(`cover:${side}`)}
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
  /**
   * And Back closes it, like every other overlay in the app.
   *
   * This drawer and the structure sheet are the two overlays that do not go
   * through `Dialog`, which is where `useBackDismiss` is applied for everything
   * else — so they were the two where the device Back gesture fell through to
   * the router instead. On /print that is not a surprise, it is a loss: leaving
   * lands on the home page, which files the project and starts clean, so a Back
   * meant to shut a drawer read as the recipes having been deleted. These are
   * also the only two overlays that are MOBILE-ONLY, which is precisely where
   * Back is the close gesture and there is no Escape key to reach for instead.
   */
  useBackDismiss(Boolean(mobileDrawer), () => setMobileDrawer(null));
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);


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
      /**
       * Typing a link into one recipe is choosing to SHOW it on that recipe,
       * for the same reason as a photo above: the book-wide "Recipe link"
       * setting starts off, so a link typed before anyone found the setting
       * was stored and then hidden. Written as this recipe's own override,
       * never the book-wide setting, so one recipe's link does not switch
       * links on for the rest of the book.
       *
       * Cookbook only: a recipe card has no per-recipe placement.
       */
      if (
        cookbookMode &&
        next.sourceUrl &&
        next.sourceUrl !== previous?.sourceUrl &&
        !recipeLinkOn(showSourceUrl, true, projectMeta.meta.itemPlacements?.[id])
      ) {
        projectMeta.setItemPlacement(id, { showSourceUrl: true });
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
    [items, photoModeFor, cookbookMode, showPhoto, showSourceUrl, queue.updateRecipe, projectMeta.setItemPhotoMode],
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
        setActiveNavIndex(
          deckIndexForPendingSlot({
            cookbookView,
            slot: pendingSlotIndexIn(navItems, pendingAddAfterRecipeId),
            navItems,
            spreads,
          }),
        );
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
  /**
   * Close the rail's Add overflow on an outside click. Escape also clears any
   * organizer selection; normal recipe clicks manage selection themselves.
   *
   * The one dismissal in the app that deliberately is NOT `useMenuDismiss`, so
   * it does not read as the last copy nobody got round to. Two reasons, either
   * of which would be enough:
   *
   * - The Add menu is PORTALLED to the body (see `recipe-page-rail__add-menu`
   *   in PageRail), so "inside" is not `contains` on one ref — the hook's whole
   *   containment test. Teaching it a second ref or a selector to cover this
   *   one caller is how a shared thing becomes a confusing one.
   * - Escape here does two jobs. It shuts the menu AND clears the rail
   *   selection, which is page state the rail's own menus have no business
   *   touching.
   */
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
  }, [addMenuOpen, clearRailSelection, effectiveRailSelection.size]);
  // Selection is a cookbook-only, page-scoped concern: drop it whenever we leave
  // cookbook mode or the recipe set changes, so stale ids can't linger.
  useEffect(() => {
    clearRailSelection();
  }, [clearRailSelection, cookbookMode, items]);

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
        <SiteHeader sticky chrome />
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
        <SiteHeader sticky chrome />
        <RecipeLoadingState
          className="flex-1"
          label={accountProjectId ? "Loading your project…" : "Preparing…"}
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
          sticky
          chrome
          /*
            The wordmark stays, for cookbooks too. A cookbook's own name lives
            at the top of the page rail, above Add recipes (see `railBookHeader`),
            where it sits with the count and the save state it belongs with. The right says what you can DO to it, in
            the order you'd reach for them: how it stands, then the action that
            finishes it.
          */
          lead={renderProUpgradeButton()}
          actions={
            items?.length ? (
              <>
                {/* How this project stands, to the LEFT of the action rather
                    than out by the avatar — it reads as part of the same
                    sentence as Print, and the avatar goes back to being only
                    the account. See `renderSaveControl`'s own doc comment
                    for why the control and the state are one thing. Shared
                    with the mobile topbar (PrintDeck.tsx). */}
                {renderSaveControl()}

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
                  {/* "Buy & Print" still says money is involved for a cookbook
                      that hasn't been paid for — a button that charges has to
                      say so before it is pressed, however clearly the price
                      was stated on the way in: someone reopening a book days
                      later has not just read that dialog. RecipePrinter Pro is
                      different on purpose: the label never reveals whether the
                      current setup is Pro-locked. Pressing "Print" either
                      prints or opens the upgrade flow, decided by the same
                      gate this button's onClick already calls — see
                      `purchaseGate` in handlePrint. A locked setup is already
                      marked where the choice was made (the theme, the card
                      size, Add more recipes), not re-announced here.

                      The price is deliberately NOT in the label. `cookbookPrice`
                      is a hardcoded fallback, not the customer's price — see
                      `COOKBOOK_PRICE_FALLBACK`, which exists because loading the
                      live one would configure the purchase SDK for anyone who
                      merely opens a cookbook. Printing a number here would quote
                      the wrong currency and the wrong amount to anyone outside
                      the US, and would go stale the moment the product's price
                      changes. Checkout states the authoritative price. */}
                  {cookbookLocked ? "Buy & Print" : "Print"}
                </button>
              </>
            ) : undefined
          }
          onNavigateHome={() => handleNavigateHome()}
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
                // This bar says "create an account to KEEP them", so making one
                // has to be what keeps them. Arming the same intent a press on
                // Save arms means signing in from here files the book, and —
                // since this is a phone banner as much as a desktop one, and a
                // phone signs in by redirect — that promise survives the page
                // being destroyed on the way to Google. See `lib/saveIntent`.
                saveAfterLoginRef.current = true;
                rememberSaveIntent(cookbookProjectId);
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
        } ${showCookbookOfferDialog ? "recipe-print-shell--entering-cookbook" : ""} ${
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
          /* `recipeCount`, not `items?.length`: it already folds in an
             in-flight import (see its own definition above), which
             `multiRecipeAddLocked` reads too. Reading `items` here instead
             — ready recipes only — let the two disagree for the whole time
             recipe #1 was parsing: this stayed "Add recipe" (nothing ready
             yet) while the lock had already engaged, so the button briefly
             read "Add recipe" with a Pro badge bolted on — neither of the
             two states this button is supposed to have. Sharing the same
             count means the label and the badge always flip together. */
          hasRecipes={recipeCount > 0}
          bookHeader={railBookHeader}
          multiRecipeAddLocked={multiRecipeAddLocked}
          railScrollRef={railScrollRef}
          railDrag={railDrag}
          railSelection={railSelection}
          previewCardSize={previewCardSize}
          cardSize={cardSize}
          previewTemplate={previewTemplate}
          continueOnBack={continueOnBack}
          previewDescriptionOn={showDescription}
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
        />

        {/* Center: large preview of the selected page */}
        <PrintDeck
          saveControl={renderSaveControl()}
          proUpgradeButton={renderProUpgradeButton()}
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
          setShowSourceUrl={setBookShowSourceUrl}
          showDescription={showDescription}
          singleRecipeOnly={singleRecipeOnly}
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
          renderCardPhotoControl={renderCardPhotoControl}
          renderArtPhotoControl={renderArtPhotoControl}
          sectionRecipeImages={sectionRecipeImages}
          photoStyle={photoStyle}
          renderCoverPhotoControl={renderCoverPhotoControl}
          renderImagePagePhotoControl={renderImagePagePhotoControl}
          parsingImports={deckPendingImports}
          activeImportId={activeImportId}
          onSelectImport={selectImport}
          settlingIds={settlingIds}
          failedImports={failedImports}
          onTryAnotherImportWay={tryAnotherImportWay}
          onRemoveImport={queue.remove}
          pendingAddAfterRecipeId={pendingAddAfterRecipeId}
          openAddRecipeBelow={openAddRecipeBelow}
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
          cardSize={cardSize}
          setCardSize={setCardSize}
          anyRecipeHasImage={anyRecipeHasImage}
          anyRecipeHasSourceUrl={anyRecipeHasSourceUrl}
          bookPhotoStyle={bookPhotoStyle}
          applyBookPhotoStyle={applyBookPhotoStyle}
          showPhoto={showPhoto}
          setShowPhoto={setShowPhoto}
          showSourceUrl={showSourceUrl}
          setShowSourceUrl={setBookShowSourceUrl}
          bookDesignSettings={renderBookDesignSettings()}
          template={template}
          setTemplate={setTemplate}
          customerInfo={effectiveCustomerInfo.customerInfo}
          setToastMessage={setToastMessage}
          hasPrintSettingsFields={hasPrintSettingsFields}
          cardSettingsFields={renderPrintSettingsFields()}
        />

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
              {/* The crown REPLACES the plus rather than sitting in a corner
                  over it — a corner badge needs room to hang off, which
                  a 92px-wide scrolling tile row doesn't reliably have (see
                  the clipping this fixed vs. reintroduced). Swapping the
                  glyph itself says the same thing — this action needs Pro —
                  without needing any of that room. */}
              <span className="recipe-mobile-toolbar__btn-icon">
                {multiRecipeAddLocked ? (
                  <CrownIcon size={ICON_SIZE.lg} className="text-[var(--cp-premium-bright)]" />
                ) : (
                  <PlusIcon size={ICON_SIZE.lg} />
                )}
              </span>
              {/* "Add recipe" for a blank project, "Add more" once there is
                  one — the desktop rail's same rule, read off the same count
                  (an import still parsing counts), so the two never disagree. */}
              {recipeCount > 0 ? "Add more" : "Add recipe"}
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
              <button
                type="button"
                className={`recipe-mobile-toolbar__btn ${sizeMenuOpen ? "is-active" : ""}`}
                aria-haspopup="dialog"
                aria-expanded={sizeMenuOpen}
                onClick={() => setSizeMenuOpen((open) => !open)}
              >
                <span className="recipe-mobile-toolbar__btn-icon">
                  <SizeIcon size={ICON_SIZE.lg} />
                </span>
                Size
              </button>
            )}
            <button
              type="button"
              className={`recipe-mobile-toolbar__btn ${mobileDrawer === "template" ? "is-active" : ""}`}
              aria-pressed={mobileDrawer === "template"}
              onClick={() => {
                setSizeMenuOpen(false);
                setMobileDrawer((drawer) => (drawer === "template" ? null : "template"));
              }}
            >
              <span className="recipe-mobile-toolbar__btn-icon">
                <TemplateIcon size={ICON_SIZE.lg} />
              </span>
              Themes
            </button>
            {/* With more than one recipe possible, this is the only place on
                mobile to show/hide photos across all of them at once — the
                per-page toolbar's photo control only ever acts on the one
                recipe it's floating over. `singleRecipeOnly` drops it: with
                exactly one recipe, that page's own toolbar already covers
                the same ground (its picker's "None" tile hides the photo),
                so this became a second control for the same one thing. */}
            {anyRecipeHasImage && !cookbookMode && !singleRecipeOnly && (
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
                Show Photo
              </button>
            )}
            {/* Same reasoning as Show Photo above, but this one still shows
                in a cookbook (`singleRecipeOnly` is always false there — a
                book can hold many recipes regardless of Pro) since a
                cookbook's per-page toolbar has no link toggle of its own;
                see the matching gate on that toolbar button in
                PrintDeck.tsx. */}
            {anyRecipeHasSourceUrl && !singleRecipeOnly && (
              <button
                type="button"
                className="recipe-mobile-toolbar__btn"
                aria-pressed={showSourceUrl}
                onClick={() => setBookShowSourceUrl((value) => !value)}
              >
                <span
                  className={`recipe-mobile-toolbar__btn-icon ${
                    showSourceUrl ? "" : "recipe-mobile-toolbar__btn-icon--off"
                  }`}
                >
                  <LinkIcon size={ICON_SIZE.lg} />
                </span>
                Show Link
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
            {cookbookLocked ? "Purchase & Print" : "Print"}
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
          structureSheetOpen={structureSheetOpen}
          setStructureSheetOpen={setStructureSheetOpen}
        />

        <MobileSheet
          open={sizeMenuOpen}
          onClose={() => setSizeMenuOpen(false)}
          title="Size"
          className="recipe-mobile-size-sheet"
        >
          {/* Same component the desktop panel uses (PrintFormatToggle) — one
              card-size picker, not two that could drift apart. Still closes
              itself on Full Page, which is the same transient-chooser pick
              it always was; Card no longer does, since Card settings (below)
              only appear once Card is actually chosen, and closing the
              instant it's tapped would hide the very settings that choice
              just made relevant. */}
          <PrintFormatToggle
            cardSize={cardSize}
            setCardSize={(next) => {
              setCardSize(next);
              if (next !== "card-6x4") setSizeMenuOpen(false);
            }}
            customerInfo={effectiveCustomerInfo.customerInfo}
          />
          {/* Cut lines / two-sided, right under the size that makes them
              relevant — the same "Card settings" section the desktop panel
              shows inline, now here instead of behind its own separate
              gear-icon sheet (which had nothing left in it once this moved).
              See the matching desktop section in PrintSetupControls.tsx for
              why this isn't gated to `cardSize === "card-6x4"`: two-sided can
              still matter for a long recipe printed at Full Page. */}
          {hasPrintSettingsFields && (
            <div className="recipe-mobile-size-sheet__card-settings">
              <span className="recipe-config-label">Card settings</span>
              {renderPrintSettingsFields()}
            </div>
          )}
        </MobileSheet>
      </main>
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
      <CookbookWelcomeDialog
        open={showCookbookOfferDialog}
        cover={projectMeta.meta.cover ?? defaultCover()}
        price={cookbookPrice}
        onClose={() => {
          // The X, Escape and the backdrop only dismiss the panel. The cook
          // just watched this book get built; closing the thing sitting on top
          // of it is not a decision to throw it away.
          track("cookbook_onboarding_dismissed", { price: cookbookPrice });
          setShowCookbookOfferDialog(false);
        }}
        onStart={() => {
          setShowCookbookOfferDialog(false);
        }}
      />
      {showProUpgradeDialog && (
        <ProUpgradeDialog
          busy={proBusy}
          cookPilotUser={cookPilotUser}
          {...proUpgradeDialogCopy}
          onClose={() => {
            // Closing after picking a plan but before finishing sign-in must
            // drop the stored intent — otherwise signing in later through an
            // unrelated flow (e.g. pressing Save) would surprise-launch a
            // checkout for a plan the cook never actually committed to.
            forgetProUpgradeIntent();
            setShowProUpgradeDialog(false);
          }}
          onSignInRequired={handleProSignInRequired}
          onChoose={continueProCheckout}
        />
      )}
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
        lastSource={projectMeta.meta.lastImportSource ?? "url"}
        onSourceUsed={projectMeta.setLastImportSource}
        libraryLocked={multiRecipeAddLocked}
        librarySingleSelect={singleRecipeOnly && !multiRecipeAddLocked}
        onLibraryLockedTap={() => {
          track("pro_feature_encountered", { feature: "batch_print", source: "add_more_recipes" });
          openProUpgradeDialog("add_more_recipes");
        }}
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
          {multiRecipeUpsellPending && (
            <button
              type="button"
              className="recipe-toast__action"
              onClick={() => {
                setToastMessage(null);
                // Same trigger the rail's own `+ Add recipe` gate uses:
                // `activeProLockReasons` special-cases it to name the
                // multi-recipe feature outright rather than counting
                // recipes on screen, which would read as zero right after
                // this toast kept the deck at exactly one.
                openProUpgradeDialog("add_more_recipes");
              }}
            >
              Upgrade
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
