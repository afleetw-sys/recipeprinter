"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { Select } from "@/components/Select";
import { useModalFocus } from "@/components/useModalFocus";
import {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  RecipeCardFace,
  type RecipeCardInlineEdit,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { usePrintSheets, type NavItem, type PageSheet, type SheetSlot } from "@/lib/usePrintSheets";
import { useRecipeInlineEditor } from "@/lib/useRecipeInlineEditor";
import { useDeckScroller } from "@/lib/useDeckScroller";
import { usePremiumTemplatePurchase } from "@/lib/usePremiumTemplatePurchase";
import {
  CheckIcon,
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
import type { QueueItem, Recipe } from "@/types/recipe";

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
// on-screen scaler/thumbnails so a card looks true-to-size, just smaller. The
// navigator still browses and previews one recipe's card at a time (see
// NavItem below) even for 6x4, where two cards end up sharing a physical
// printed page — so this stays the size of a single card, not the (assumed,
// unknown) physical sheet. The print-time page assumption lives entirely in
// the `.recipe-card-page` print CSS in globals.css and never touches this.
const PAGE_DIMS: Record<PrintCardSize, { w: number; h: number }> = {
  letter: { w: 8.5 * 96, h: 11 * 96 },
  "card-6x4": { w: 6 * 96, h: 4 * 96 },
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
 * `@media print` un-scaling it) that's the whole point, since up to two
 * slots' worth of cards share one printed page. On screen, though, browsing
 * still happens one recipe at a time like it always has: `data-preview-hidden`
 * (a screen-only rule) hides the whole front/back group that isn't
 * `activeSide` — otherwise its declared page-sized height still pushes the
 * flex column taller even with its cards individually hidden, shoving the
 * side you want to see out of the scaler's clipped viewport — and, within
 * whichever group is showing, hides every card except the one matching
 * `activeSlotIndex`. One tree, so preview and print can't drift apart even
 * though they show different amounts of it at once.
 */
const ScaledPage = memo(function ScaledPage({
  sheet,
  isLastSheet,
  activeSlotIndex,
  activeSide,
  scale,
  size,
  cardsPerSheet,
  template,
  doubleSided,
  showImage,
  showSourceUrl,
  showCutLines,
  inlineEdit,
}: {
  sheet: PageSheet;
  isLastSheet: boolean;
  activeSlotIndex: number;
  activeSide: "front" | "back";
  scale: number;
  size: PrintCardSize;
  cardsPerSheet: 1 | 2;
  template: RecipePrintTemplate;
  doubleSided: boolean;
  showImage: boolean;
  showSourceUrl: boolean;
  showCutLines: boolean;
  inlineEdit?: RecipeCardInlineEdit;
}) {
  const dims = PAGE_DIMS[size];
  const anySlot = sheet.slots.find((slot): slot is SheetSlot => slot !== null) ?? null;
  if (!anySlot) return null;

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
          data-cards-per-sheet={size === "card-6x4" ? cardsPerSheet : 1}
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
                // An empty front slot just means the queue ran out of
                // recipes (an odd count leaves the last sheet's second slot
                // unfilled) — leave it empty rather than printing a blank
                // card. Blank cards are only for the back side, to keep a
                // duplex job's physical page count in sync (see
                // `backGroupNeeded`), not for the front.
                slot ? (
                  <RecipeCardFace
                    key={`front-${slotIndex}`}
                    recipe={slot.recipe}
                    ingredients={slot.front.ingredients}
                    instructions={slot.front.instructions}
                    side="front"
                    showHeader={!slot.isContinuation}
                    layout={slot.front.layout}
                    hasBackFace={slot.hasBack}
                    showImage={showImage}
                    showSourceUrl={showSourceUrl}
                    continued={slot.isContinuation}
                    template={template}
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
                  if (!slot) return null;

                  return slot.back ? (
                    <RecipeCardFace
                      key={`back-${slotIndex}`}
                      recipe={slot.recipe}
                      ingredients={slot.back.ingredients}
                      instructions={slot.back.instructions}
                      side="back"
                      showHeader={false}
                      layout={slot.back.layout}
                      hasBackFace={slot.hasBack}
                      template={template}
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
  try {
    const lastShown = Number(window.localStorage.getItem(POST_PRINT_DIALOG_STORAGE_KEY));
    return !lastShown || Date.now() - lastShown >= POST_PRINT_DIALOG_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markPostPrintDialogShown() {
  try {
    window.localStorage.setItem(POST_PRINT_DIALOG_STORAGE_KEY, String(Date.now()));
  } catch {
    /* Ignore storage failures; the dialog can still be dismissed normally. */
  }
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
  const [cardsPerSheet, setCardsPerSheet] = useState<1 | 2>(2);
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSourceUrl, setShowSourceUrl] = useState(false);
  const [showDonateDialog, setShowDonateDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [showAddRecipeDialog, setShowAddRecipeDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteRecipeDialog, setShowDeleteRecipeDialog] = useState(false);
  const [pendingFocusRecipeId, setPendingFocusRecipeId] = useState<string | null>(null);
  const queue = useQueue();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [freeTemplateStatus, setFreeTemplateStatus] = useState<RecipePrinterFreeTemplateStatus | null>(null);
  const { user: cookPilotUser, redirectError: cookPilotRedirectError } = useCookPilotAuth();
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
    sheets,
    navItems,
    measurers,
  } = usePrintSheets({ items, cardSize, cardsPerSheet, doubleSided, photosOn, sourceUrlOn, template });

  const [activeNavIndex, setActiveNavIndex] = useState(0);
  const [mobileDrawer, setMobileDrawer] = useState<"template" | null>(null);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const printSettingsDialogRef = useRef<HTMLDivElement>(null);

  // Close the print-settings dialog if its trigger disappears (e.g. size
  // switches to letter with no back side), so it doesn't reopen stale next
  // time the trigger comes back.
  useEffect(() => {
    if (!hasRecipeBackSide && cardSize !== "card-6x4") {
      setPrintSettingsOpen(false);
    }
  }, [hasRecipeBackSide, cardSize]);

  useModalFocus(printSettingsDialogRef, () => setPrintSettingsOpen(false), {
    disabled: !printSettingsOpen,
  });

  const singleRecipePrintView =
    (items?.filter((item) => Boolean(item.recipe)).length ?? 0) === 1;

  const { canvasSide, setCanvasSide, deckScale, deckRef, slideRefs, goToSlide } = useDeckScroller({
    activeNavIndex,
    setActiveNavIndex,
    navItemsLength: navItems.length,
    cardSize,
    sheetsLength: sheets.length,
    continueOnBack,
    singleRecipePrintView,
    pageWidth: PAGE_DIMS[cardSize].w,
    pageHeight: PAGE_DIMS[cardSize].h,
  });

  const activeRecipeId = navItems[activeNavIndex]?.recipeId ?? null;
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
    window.print();
  }

  function showToast(message: string) {
    setToastMessage(message);
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
    unlockTemplateAndPrint,
    claimTemplateAndPrint,
  } = usePremiumTemplatePurchase({
    items,
    cookPilotUser,
    template,
    freeTemplateStatus,
    setFreeTemplateStatus,
    showToast,
    clearToast: () => setToastMessage(null),
    printNow,
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
      if (!activeRecipeItem) return;
      if (
        showAddRecipeDialog ||
        showDeleteRecipeDialog ||
        showDonateDialog ||
        showUnlockDialog ||
        showFeedbackDialog ||
        showCookPilotLogin
      ) {
        return;
      }
      event.preventDefault();
      setShowDeleteRecipeDialog(true);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    activeRecipeItem,
    showAddRecipeDialog,
    showDeleteRecipeDialog,
    showDonateDialog,
    showUnlockDialog,
    showFeedbackDialog,
    showCookPilotLogin,
  ]);

  function deleteActiveRecipe() {
    if (!activeRecipeItem) return;
    const id = activeRecipeItem.id;
    const nextItems = (items ?? []).filter((item) => item.id !== id);
    setItems(nextItems);
    createCurrentPrintJob(nextItems.map((item) => item.id));
    queue.remove(id);
    setShowDeleteRecipeDialog(false);
  }

  // Jump to a just-added recipe once its page actually exists in the deck
  // (mirrors PowerPoint landing on a freshly inserted slide).
  useEffect(() => {
    if (!pendingFocusRecipeId) return;
    const index = navItems.findIndex((navItem) => navItem.recipeId === pendingFocusRecipeId);
    if (index === -1) return;
    goToSlide(index);
    setPendingFocusRecipeId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFocusRecipeId, navItems]);

  async function handlePrint() {
    if (purchaseBusy) return;
    if (!printLayoutReady) {
      showToast("Preparing the print layout. Try again in a moment.");
      return;
    }
    if (selectedPremiumTemplate) {
      if (selectedTemplateLocked) {
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
    setPendingFocusRecipeId((current) => current ?? newlyReady[0]!.id);
  }, [queue.items, items]);

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

  // Shared between the desktop "Print settings" popover and the mobile
  // settings menu, so both surfaces stay in sync rather than drifting into
  // two separately-maintained lists of the same controls.
  function renderPrintSettingsFields() {
    return (
      <>
        {cardSize === "card-6x4" && (
          <div className="recipe-config-section recipe-config-section--cards-per-page">
            <span className="recipe-config-label">Cards per page</span>
            <div className="recipe-cards-per-page" role="radiogroup" aria-label="Cards per page">
              {([1, 2] as const).map((count) => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={cardsPerSheet === count}
                  className={`recipe-cards-per-page__option ${
                    cardsPerSheet === count ? "is-active" : ""
                  }`}
                  onClick={() => setCardsPerSheet(count)}
                >
                  {count}
                </button>
              ))}
            </div>
            <small className="recipe-cards-per-page__hint">
              2 needs a full sheet of paper (like Letter) to fit both cards. If you&apos;re
              printing on individual precut 4x6 cards, choose 1.
            </small>
          </div>
        )}
        {cardSize === "card-6x4" && cardsPerSheet === 2 && (
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
    cardsPerSheet,
    setCardsPerSheet,
  });

  // Auto-open the print dialog when the user chose Print instead of Preview.
  useEffect(() => {
    if (
      shouldPrint &&
      items &&
      items.length > 0 &&
      printLayoutReady &&
      (!selectedPremiumTemplate || revenueCatUserId) &&
      !autoPrintAttemptedRef.current
    ) {
      autoPrintAttemptedRef.current = true;
      const t = window.setTimeout(() => void handlePrint(), 350);
      return () => window.clearTimeout(t);
    }
  }, [items, revenueCatUserId, selectedPremiumTemplate, shouldPrint, template, customerInfo, printLayoutReady]);

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
      if (!shouldShowPostPrintDialog()) return;

      markPostPrintDialogShown();
      window.setTimeout(() => setShowDonateDialog(true), 150);
    }

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

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
      <SiteHeader onBack={cameFromSharedLink ? undefined : () => router.back()} compact sticky />

      {/* Print preview / printed content */}
      <main className="recipe-print-shell px-cp-6 print:p-0">
        <nav
          className={`recipe-page-rail recipe-page-rail--${cardSize} no-print`}
          aria-label="Pages"
        >
          {navItems.map((navItem, index) => (
            <button
              key={`${sheets[navItem.sheetIndex]?.id}-${navItem.slotIndex}`}
              type="button"
              className={`recipe-page-rail__item ${
                index === activeNavIndex ? "is-active" : ""
              }`}
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
                  size={cardSize}
                  cardsPerSheet={cardsPerSheet}
                  template={template}
                  doubleSided={continueOnBack}
                  showImage={photosOn}
                  showSourceUrl={sourceUrlOn}
                  showCutLines={false}
                />
              </span>
              <span className="recipe-page-rail__label">
                <span className="recipe-page-rail__title">{navItem.label}</span>
                <span className="recipe-page-rail__meta">{navItem.pageLabel}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            className="recipe-page-rail__add"
            onClick={() => setShowAddRecipeDialog(true)}
          >
            <PlusIcon size={ICON_SIZE.md} />
            Add recipe
          </button>
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
              {(hasRecipeBackSide || cardSize === "card-6x4") && (
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
                disabled={purchaseBusy || !printLayoutReady}
              >
                {purchaseBusy || !printLayoutReady ? <SpinnerIcon size={ICON_SIZE.md} /> : <PrintIcon size={ICON_SIZE.md} />}
                {selectedTemplateLocked ? "Unlock & Print" : "Print"}
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
                          "--preview-w": `${PAGE_DIMS[cardSize].w * deckScale}px`,
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
                      {activeRecipeItem?.recipe && (
                        <div className="recipe-page-canvas__controls-right">
                          <button
                            type="button"
                            className={`recipe-page-edit-toggle ${pageEditMode ? "is-active" : ""}`}
                            aria-pressed={pageEditMode}
                            onClick={(event) => {
                              event.stopPropagation();
                              togglePageEditMode();
                            }}
                          >
                            <EditIcon size={ICON_SIZE.xs} />
                            {pageEditMode ? "Done" : "Edit"}
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
                    size={cardSize}
                    cardsPerSheet={cardsPerSheet}
                    template={template}
                    doubleSided={continueOnBack}
                    showImage={photosOn}
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
                    showCutLines={showCutLines && cardSize === "card-6x4" && cardsPerSheet === 2}
                    inlineEdit={
                      pageEditMode && isActive && activeRecipeItem?.id === navItem.recipeId
                        ? activeInlineEdit
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
          className={`recipe-config-panel no-print ${
            mobileDrawer ? "is-mobile-open" : ""
          }`}
          aria-label="Recipe print settings"
          aria-modal={mobileDrawer ? "true" : undefined}
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
                      setToastMessage(null);
                      setMobileDrawer(null);
                    }}
                  >
                    {locked && (
                      <span className="recipe-template-option__premium" aria-label="Premium">
                        <CrownIcon size={ICON_SIZE.xs} />
                        {premiumTemplate && templatePrices[premiumTemplate] ? (
                          <span>{templatePrices[premiumTemplate]}</span>
                        ) : null}
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
              disabled={purchaseBusy || !printLayoutReady}
            >
              {purchaseBusy || !printLayoutReady ? <SpinnerIcon size={ICON_SIZE.md} /> : <PrintIcon size={ICON_SIZE.md} />}
              {selectedTemplateLocked ? "Unlock & Print" : "Print"}
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
            {(hasRecipeBackSide || cardSize === "card-6x4") && (
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

        {printSettingsOpen && (
          <div
            ref={printSettingsDialogRef}
            className="print-success-dialog no-print"
            role="dialog"
            aria-modal="true"
            aria-labelledby="print-settings-dialog-title"
            tabIndex={-1}
          >
            <div className="print-success-dialog__backdrop" aria-hidden />
            <div className="print-success-dialog__panel">
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
            </div>
          </div>
        )}

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
              Add
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
        purchaseBusy={purchaseBusy}
        onUnlockTemplate={(premiumTemplate) => void unlockTemplateAndPrint(premiumTemplate)}
        canClaimFree={canClaimSelectedTemplateFree}
        claimBusy={claimBusy}
        onClaimTemplate={(premiumTemplate) => void claimTemplateAndPrint(premiumTemplate)}
        showDeleteRecipeDialog={showDeleteRecipeDialog}
        deleteRecipeTitle={activeRecipeItem?.recipe?.title || activeRecipeItem?.title || "this recipe"}
        onCancelDeleteRecipe={() => setShowDeleteRecipeDialog(false)}
        onConfirmDeleteRecipe={deleteActiveRecipe}
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
          settings={{ template, cardSize, cardsPerSheet, showPhoto, showSourceUrl, showCutLines, doubleSided }}
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
