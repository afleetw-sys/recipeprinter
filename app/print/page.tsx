"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { Select } from "@/components/Select";
import { useModalFocus } from "@/components/useModalFocus";
import { friendlyClaimError, friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  RecipeCardFace,
  type RecipeCardInlineEdit,
  type RecipeCardEditTarget,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { usePrintSheets, type NavItem, type PageSheet, type SheetSlot } from "@/lib/usePrintSheets";
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
import {
  isPremiumTemplate,
  type PremiumRecipePrintTemplate,
} from "@/lib/premiumTemplates";
import {
  hasTemplateEntitlement,
  identifyRecipePrinterCustomer,
  loadRecipePrinterCustomerInfo,
  loadRecipePrinterTemplatePrices,
  purchaseRecipePrinterTemplate,
  recipePrinterCustomerId,
  syncRecipePrinterCustomerAttributes,
} from "@/lib/recipePrinterPurchases";
import { CookPilotLoginDialog, useCookPilotAuth } from "@/components/CookPilotAuth";
import {
  claimFreeRecipePrinterTemplate,
  loadFreeTemplateStatus,
  loadRecipePrinterUserProfile,
  type RecipePrinterFreeTemplateStatus,
} from "@/lib/recipePrinterFreeTemplateClaim";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import {
  createCurrentPrintJob,
  printableRecipe,
  readCurrentPrintJobIds,
  readQueue,
  updateQueuedRecipe,
  useQueue,
} from "@/lib/queue";
import {
  isPrintCardSize,
  isRecipePrintTemplate,
  usePrintSettingsPersistence,
} from "@/lib/printSettings";
import type { QueueItem, Recipe } from "@/types/recipe";
import type { CustomerInfo } from "@revenuecat/purchases-js";

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
const SINGLE_RECIPE_DECK_TOP_PADDING = 16;


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

function friendlyPurchaseError(error: unknown): string {
  return friendlyPurchaseSetupError(error);
}

interface RecipeEditSelection {
  recipeId: string;
  target: RecipeCardEditTarget;
}

function ingredientLine(ingredient: Recipe["ingredients"][number]): string {
  if (ingredient.raw) return ingredient.raw;
  const amount = [ingredient.amount, ingredient.unit].filter(Boolean).join(" ");
  return [amount, ingredient.name].filter(Boolean).join(" ") + (ingredient.note ? `, ${ingredient.note}` : "");
}

function stripStepPrefix(value: string): string {
  return value
    .trim()
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+[\).:-]\s*/, "")
    .trim();
}

// Section headers group consecutive ingredients/steps that share a `section`
// value (see `sectionGroups` in RecipeCardPrint). Renaming one only touches
// that consecutive run, starting at the group's first item, so a later group
// that happens to reuse the same title text is left alone.
function applySectionTitleEdit<T extends { section?: string }>(
  items: T[],
  startIndex: number,
  newTitle: string,
): T[] {
  const originalTitle = items[startIndex]?.section?.trim() || undefined;
  const trimmedNewTitle = newTitle.trim() || undefined;
  const next = items.slice();
  for (let i = startIndex; i < next.length; i++) {
    const itemTitle = next[i].section?.trim() || undefined;
    if (itemTitle !== originalTitle) break;
    next[i] = { ...next[i], section: trimmedNewTitle };
  }
  return next;
}

function applyRecipeTargetEdit(recipe: Recipe, target: RecipeCardEditTarget, value: string): Recipe {
  const trimmed = value.trim();
  if (target.kind === "title") {
    return printableRecipe({ ...recipe, title: trimmed || recipe.title || "Untitled recipe" });
  }
  if (target.kind === "cookTime") {
    return printableRecipe({
      ...recipe,
      cookTime: trimmed || undefined,
      totalTime: trimmed || undefined,
    });
  }
  if (target.kind === "servings") {
    return printableRecipe({
      ...recipe,
      servings: trimmed || undefined,
    });
  }
  if (target.kind === "image") {
    return printableRecipe({
      ...recipe,
      image: trimmed || undefined,
    });
  }
  if (target.kind === "sourceUrl") {
    return printableRecipe({
      ...recipe,
      sourceUrl: trimmed || undefined,
    });
  }
  if (target.kind === "ingredient") {
    if (!trimmed) {
      return printableRecipe({
        ...recipe,
        ingredients: recipe.ingredients.filter((_, index) => index !== target.index),
      });
    }
    return printableRecipe({
      ...recipe,
      ingredients: recipe.ingredients.map((ingredient, index) =>
        index === target.index
          ? {
              ...ingredient,
              amount: undefined,
              unit: undefined,
              name: trimmed,
              note: undefined,
              raw: trimmed,
            }
          : ingredient,
      ),
    });
  }
  if (target.kind === "ingredientSection") {
    return printableRecipe({
      ...recipe,
      ingredients: applySectionTitleEdit(recipe.ingredients, target.index, trimmed),
    });
  }
  if (target.kind === "instructionSection") {
    return printableRecipe({
      ...recipe,
      instructions: applySectionTitleEdit(recipe.instructions, target.index, trimmed),
    });
  }
  const text = stripStepPrefix(trimmed);
  if (!text) {
    return printableRecipe({
      ...recipe,
      instructions: recipe.instructions
        .filter((_, index) => index !== target.index)
        .map((step, index) => ({ ...step, step: index + 1 })),
    });
  }
  return printableRecipe({
    ...recipe,
    instructions: recipe.instructions.map((step, index) =>
      index === target.index ? { ...step, text } : step,
    ),
  });
}

// The new line inherits whichever section the item at (or just before,
// for an append at the end) that index belongs to, so inserting in the
// middle of a "For the sauce" group doesn't fork off an unlabeled group.
function sectionForInsertion<T extends { section?: string }>(items: T[], index: number): string | undefined {
  return items[index]?.section ?? items[index - 1]?.section;
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
  const [revenueCatUserId, setRevenueCatUserId] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [templatePrices, setTemplatePrices] = useState<Partial<Record<PremiumRecipePrintTemplate, string>>>({});
  const [freeTemplateStatus, setFreeTemplateStatus] = useState<RecipePrinterFreeTemplateStatus | null>(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [freeTemplateBannerDismissed, setFreeTemplateBannerDismissed] = useState(false);
  const { user: cookPilotUser, redirectError: cookPilotRedirectError } = useCookPilotAuth();
  const [isRecipePrinterAdmin, setIsRecipePrinterAdmin] = useState(false);
  const [showCookPilotLogin, setShowCookPilotLogin] = useState(false);
  const linkedCookPilotUidRef = useRef<string | null>(null);
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
  const [canvasSide, setCanvasSide] = useState<"front" | "back">("front");
  const [mobileDrawer, setMobileDrawer] = useState<"template" | null>(null);
  const [pageEditMode, setPageEditMode] = useState(false);
  const [editingEdit, setEditingEdit] = useState<RecipeEditSelection | null>(null);
  const [editValue, setEditValue] = useState("");
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const printSettingsDialogRef = useRef<HTMLDivElement>(null);
  const [deckScale, setDeckScale] = useState(0.5);
  // While we scroll the deck programmatically (after a click), ignore the
  // scroll-driven selection so it doesn't yank the outline back to whichever
  // page is momentarily centred mid-animation.
  const suppressScrollSyncRef = useRef(false);
  const scrollSyncTimerRef = useRef<number | undefined>(undefined);

  // Keep the active recipe valid as the page list changes (size / two-sided).
  useEffect(() => {
    setActiveNavIndex((index) => Math.min(index, Math.max(0, navItems.length - 1)));
  }, [navItems.length]);

  // Always start a freshly selected recipe on its front face.
  useEffect(() => {
    setCanvasSide("front");
  }, [activeNavIndex, continueOnBack]);

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

  // Scale each deck page to fit the available width while leaving room above
  // and below so the previous / next pages peek in (implying you can scroll).
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    const { w: pageW, h: pageH } = PAGE_DIMS[cardSize];
    const update = () => {
      const mobile = window.matchMedia("(max-width: 820px)").matches;
      // On mobile each slide is narrower than the deck itself (100vw - 96px)
      // so neighbouring pages peek in on both sides; the scale must fit that
      // slide width, not the full deck width, or the card overflows its slot.
      const availW = el.clientWidth - (mobile ? 96 : 40);
      const availH = el.clientHeight;
      if (availW > 0 && availH > 0) {
        const widthScale = availW / pageW;
        const heightScale = (availH * (mobile ? 0.86 : 0.74)) / pageH;
        setDeckScale(Math.max(0.12, Math.min(1.05, widthScale, heightScale)));
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardSize, sheets.length]);

  // Scrolling the deck selects whichever slide is closest to the centre.
  // Every nav item — including a second recipe sharing a sheet with the
  // first — has its own slide, so this is a direct index lookup.
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      if (suppressScrollSyncRef.current) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mobile = window.matchMedia("(max-width: 820px)").matches;
        const mid = mobile ? el.scrollLeft + el.clientWidth / 2 : el.scrollTop + el.clientHeight / 2;
        let bestIndex = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        slideRefs.current.forEach((slide, index) => {
          if (!slide) return;
          const center = mobile
            ? slide.offsetLeft + slide.offsetWidth / 2
            : slide.offsetTop + slide.offsetHeight / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            bestIndex = index;
          }
        });
        setActiveNavIndex(bestIndex);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [navItems.length]);

  // Centre the active page when the deck is first laid out or rescaled.
  useEffect(() => {
    centerSlide(activeNavIndex);
    // Only re-centre on structural / size changes, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navItems.length, deckScale, cardSize]);

  const singleRecipePrintView =
    (items?.filter((item) => Boolean(item.recipe)).length ?? 0) === 1;
  const activeRecipeId = navItems[activeNavIndex]?.recipeId ?? null;
  const activeRecipeItem =
    activeRecipeId && items
      ? items.find((item) => item.id === activeRecipeId && item.recipe)
      : null;
  const editingRecipeItem =
    editingEdit?.recipeId && items
      ? items.find((item) => item.id === editingEdit.recipeId && item.recipe)
      : null;

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

  function scrollDeckTo(deck: HTMLDivElement, options: ScrollToOptions) {
    if (options.behavior === "smooth") {
      // scroll-snap-type: mandatory fights a smooth scrollTo() that spans
      // multiple snap points — the deck stops at an intermediate slide
      // instead of the requested one. Suspend snapping for the animation.
      deck.style.scrollSnapType = "none";
      const restore = () => {
        deck.style.scrollSnapType = "";
      };
      deck.addEventListener("scrollend", restore, { once: true });
      window.setTimeout(restore, 600);
    }
    deck.scrollTo(options);
  }

  function centerSlide(index: number, behavior: ScrollBehavior = "auto") {
    const deck = deckRef.current;
    const slide = slideRefs.current[index];
    if (!deck || !slide) return;

    if (window.matchMedia("(max-width: 820px)").matches) {
      const targetLeft = slide.offsetLeft - (deck.clientWidth - slide.offsetWidth) / 2;
      const maxLeft = deck.scrollWidth - deck.clientWidth;
      scrollDeckTo(deck, {
        left: Math.max(0, Math.min(targetLeft, maxLeft)),
        behavior,
      });
      return;
    }

    const targetTop = singleRecipePrintView
      ? slide.offsetTop - SINGLE_RECIPE_DECK_TOP_PADDING
      : slide.offsetTop - (deck.clientHeight - slide.offsetHeight) / 2;
    const maxTop = deck.scrollHeight - deck.clientHeight;
    scrollDeckTo(deck, {
      top: Math.max(0, Math.min(targetTop, maxTop)),
      behavior,
    });
  }

  function goToSlide(navIndex: number) {
    // Every nav item has its own slide now (see the deck render below), even
    // when two recipes share a physical sheet, so this is always a real
    // scroll rather than just a same-sheet slot swap.
    if (navIndex !== activeNavIndex) {
      const behavior = Math.abs(navIndex - activeNavIndex) <= 3 ? "smooth" : "auto";
      // Hold off the scroll listener until the animation settles, otherwise it
      // overwrites our selection with the page that's centred partway through.
      suppressScrollSyncRef.current = true;
      window.clearTimeout(scrollSyncTimerRef.current);
      scrollSyncTimerRef.current = window.setTimeout(
        () => {
          suppressScrollSyncRef.current = false;
        },
        behavior === "smooth" ? 500 : 120,
      );
      centerSlide(navIndex, behavior);
    }
    setActiveNavIndex(navIndex);
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

  const selectedPremiumTemplate = isPremiumTemplate(template) ? template : null;
  const selectedTemplateOption = RECIPE_PRINT_TEMPLATE_OPTIONS.find(
    (option) => option.id === template,
  );
  const selectedTemplateLabel = selectedTemplateOption?.label ?? "this";
  const selectedTemplateLocked =
    selectedPremiumTemplate !== null &&
    !hasTemplateEntitlement(customerInfo, selectedPremiumTemplate);
  const hasUnclaimedFreeTemplate =
    Boolean(freeTemplateStatus?.cookPilotActive) && !freeTemplateStatus?.granted;
  const canClaimSelectedTemplateFree = selectedTemplateLocked && hasUnclaimedFreeTemplate;

  function printNow() {
    printRequestedRef.current = true;
    window.print();
  }

  function showToast(message: string) {
    setToastMessage(message);
  }

  async function refreshCustomerInfo(userId = revenueCatUserId): Promise<CustomerInfo | null> {
    if (!userId) return null;
    const info = await loadRecipePrinterCustomerInfo(userId);
    syncRecipePrinterCustomerAttributes({
      userId,
    }).catch((error) => {
      console.warn("RecipePrinter: could not sync RevenueCat customer attributes", error);
    });
    setCustomerInfo(info);
    return info;
  }

  async function unlockTemplateAndPrint(premiumTemplate: PremiumRecipePrintTemplate) {
    if (!revenueCatUserId) {
      showToast("Purchase service is still getting ready. Try Print again in a moment.");
      return;
    }

    setPurchaseBusy(true);
    setToastMessage(null);
    try {
      const latestInfo = customerInfo ?? (await refreshCustomerInfo(revenueCatUserId));
      if (hasTemplateEntitlement(latestInfo, premiumTemplate)) {
        setShowUnlockDialog(false);
        printNow();
        return;
      }

      const result = await purchaseRecipePrinterTemplate({
        userId: revenueCatUserId,
        template: premiumTemplate,
      });
      setCustomerInfo(result.customerInfo);

      if (result.cancelled) {
        showToast("Purchase cancelled. Your recipe cards are still here when you're ready.");
        return;
      }

      if (!hasTemplateEntitlement(result.customerInfo, premiumTemplate)) {
        showToast("Purchase finished, but the template is still syncing. Try Print again in a moment.");
        return;
      }

      setShowUnlockDialog(false);
      printNow();
    } catch (error) {
      showToast(friendlyPurchaseError(error));
    } finally {
      setPurchaseBusy(false);
    }
  }

  async function claimTemplateAndPrint(premiumTemplate: PremiumRecipePrintTemplate) {
    if (!cookPilotUser) return;

    setClaimBusy(true);
    setToastMessage(null);
    try {
      await claimFreeRecipePrinterTemplate(premiumTemplate);
      const [status] = await Promise.all([
        loadFreeTemplateStatus(cookPilotUser.uid).then((result) => {
          setFreeTemplateStatus(result);
          return result;
        }),
        refreshCustomerInfo(),
      ]);

      if (!status.grantedConfirmed) {
        showToast("Claim is finishing up — try Print again in a moment.");
        return;
      }

      setShowUnlockDialog(false);
      printNow();
    } catch (error) {
      showToast(friendlyClaimError(error));
    } finally {
      setClaimBusy(false);
    }
  }

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

  const startEditTarget = useCallback(
    (target: RecipeCardEditTarget, value: string) => {
      if (!activeRecipeItem?.recipe) return;
      setEditingEdit({ recipeId: activeRecipeItem.id, target });
      setEditValue(value);
    },
    [activeRecipeItem],
  );

  const cancelEditTarget = useCallback(() => {
    setEditingEdit(null);
    setEditValue("");
  }, []);

  const commitEditTarget = useCallback(
    (value = editValue) => {
      if (!editingEdit || !editingRecipeItem?.recipe) return;
      const target = editingEdit.target;
      const nextRecipe = applyRecipeTargetEdit(editingRecipeItem.recipe, target, value);
      updateQueuedRecipe(editingRecipeItem.id, nextRecipe);
      setItems((current) =>
        current?.map((item) =>
          item.id === editingRecipeItem.id
            ? { ...item, recipe: nextRecipe, title: nextRecipe.title || "Untitled recipe" }
          : item,
        ) ?? current,
      );
      setEditingEdit(null);
      setEditValue("");
    },
    [editValue, editingEdit, editingRecipeItem],
  );

  const insertIngredientAt = useCallback(
    (index: number) => {
      if (!activeRecipeItem?.recipe) return;
      const recipe = activeRecipeItem.recipe;
      const section = sectionForInsertion(recipe.ingredients, index);
      const ingredients = recipe.ingredients.slice();
      ingredients.splice(index, 0, { raw: "", name: "", section });
      const nextRecipe = printableRecipe({ ...recipe, ingredients });
      updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
      setItems((current) =>
        current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
          current,
      );
      setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "ingredient", index } });
      setEditValue("");
    },
    [activeRecipeItem],
  );

  const insertStepAt = useCallback(
    (index: number) => {
      if (!activeRecipeItem?.recipe) return;
      const recipe = activeRecipeItem.recipe;
      const section = sectionForInsertion(recipe.instructions, index);
      const instructions = recipe.instructions.slice();
      instructions.splice(index, 0, { step: 0, text: "", section });
      const renumbered = instructions.map((step, i) => ({ ...step, step: i + 1 }));
      const nextRecipe = printableRecipe({ ...recipe, instructions: renumbered });
      updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
      setItems((current) =>
        current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
          current,
      );
      setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "step", index } });
      setEditValue("");
    },
    [activeRecipeItem],
  );

  // Enter mid-ingredient/mid-step splits the line at the cursor: the text
  // before the cursor stays put, the text after becomes a new line right
  // below it (focused, ready to keep typing) — like hitting Enter in any
  // text editor, rather than committing the whole field.
  const splitEditLine = useCallback(
    (target: RecipeCardEditTarget, before: string, after: string) => {
      if (!activeRecipeItem?.recipe) return;
      const recipe = activeRecipeItem.recipe;
      if (target.kind === "ingredient") {
        const ingredients = recipe.ingredients.slice();
        ingredients[target.index] = {
          ...ingredients[target.index],
          amount: undefined,
          unit: undefined,
          name: before,
          note: undefined,
          raw: before,
        };
        const section = sectionForInsertion(ingredients, target.index + 1);
        ingredients.splice(target.index + 1, 0, { raw: after, name: after, section });
        const nextRecipe = printableRecipe({ ...recipe, ingredients });
        updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
        setItems((current) =>
          current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
            current,
        );
        setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "ingredient", index: target.index + 1 } });
        setEditValue(after);
        return;
      }
      if (target.kind === "step") {
        const instructions = recipe.instructions.slice();
        instructions[target.index] = { ...instructions[target.index], text: before };
        const section = sectionForInsertion(instructions, target.index + 1);
        instructions.splice(target.index + 1, 0, { step: 0, text: after, section });
        const renumbered = instructions.map((step, i) => ({ ...step, step: i + 1 }));
        const nextRecipe = printableRecipe({ ...recipe, instructions: renumbered });
        updateQueuedRecipe(activeRecipeItem.id, nextRecipe);
        setItems((current) =>
          current?.map((item) => (item.id === activeRecipeItem.id ? { ...item, recipe: nextRecipe } : item)) ??
            current,
        );
        setEditingEdit({ recipeId: activeRecipeItem.id, target: { kind: "step", index: target.index + 1 } });
        setEditValue(after);
      }
    },
    [activeRecipeItem],
  );

  // Only the currently-active recipe's card ever receives a real inlineEdit
  // object (every other card gets undefined), so this is computed once here
  // rather than freshly per nav item in the render below — keeps the object
  // reference stable across unrelated re-renders, which lets RecipeCardFace's
  // memo() actually skip work instead of re-rendering the active card on
  // every keystroke and every unrelated state change on this page.
  const activeInlineEdit = useMemo<RecipeCardInlineEdit | undefined>(() => {
    if (!pageEditMode || !activeRecipeItem) return undefined;
    return {
      editingTarget: editingEdit?.recipeId === activeRecipeItem.id ? editingEdit.target : null,
      value: editValue,
      onFocusTarget: startEditTarget,
      onValueChange: setEditValue,
      onCommit: commitEditTarget,
      onCancel: cancelEditTarget,
      onInsertIngredient: insertIngredientAt,
      onInsertStep: insertStepAt,
      onSplitLine: splitEditLine,
    };
  }, [
    pageEditMode,
    activeRecipeItem,
    editingEdit,
    editValue,
    startEditTarget,
    commitEditTarget,
    cancelEditTarget,
    insertIngredientAt,
    insertStepAt,
    splitEditLine,
  ]);

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

  useEffect(() => {
    const hasEditing = editingEdit
      ? items?.some((item) => item.id === editingEdit.recipeId && item.recipe)
      : true;
    if (!hasEditing) {
      setEditingEdit(null);
      setEditValue("");
    }
  }, [editingEdit, items]);

  // Editing is opt-in per recipe: leaving edit mode active while flipping to
  // a different card in the deck would carry stray editing/placeholder state
  // onto a recipe the user never asked to edit.
  useEffect(() => {
    setPageEditMode(false);
    setEditingEdit(null);
    setEditValue("");
  }, [activeRecipeId]);

  function togglePageEditMode() {
    if (pageEditMode && editingEdit) {
      // Unmounting a focused field on toggle-off isn't guaranteed to fire a
      // blur event in every browser, so commit explicitly before hiding it.
      commitEditTarget(editValue);
    }
    setPageEditMode((mode) => !mode);
  }

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
    // Gated on having something to print: this only reads back the id an
    // import already registered (see registerRevenueCatCustomer in
    // lib/queue.ts). It still needs to run here too, since a direct
    // page load resets the in-memory RevenueCat SDK state even though the
    // id and queue persisted in storage.
    if (!items || items.length === 0) return;
    let cancelled = false;
    recipePrinterCustomerId()
      .then((userId) => {
        if (!cancelled) setRevenueCatUserId(userId);
      })
      .catch((error) => {
        console.warn("RecipePrinter: could not initialize RevenueCat customer", error);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    if (cookPilotRedirectError) showToast(cookPilotRedirectError);
  }, [cookPilotRedirectError]);

  useEffect(() => {
    // Runs once per CookPilot login: aliases whatever this browser already
    // purchased anonymously into the CookPilot account, then switches this
    // session to that identity so future purchases stay tied to it too.
    // Gated on having something to print, same as the anonymous-id effect
    // above — no reason to touch RevenueCat on an empty/stale print page.
    if (!cookPilotUser || !items || items.length === 0) return;
    if (linkedCookPilotUidRef.current === cookPilotUser.uid) return;
    linkedCookPilotUidRef.current = cookPilotUser.uid;
    identifyRecipePrinterCustomer(cookPilotUser.uid)
      .then(({ customerInfo: linkedInfo, alreadyLinked }) => {
        setRevenueCatUserId(cookPilotUser.uid);
        setCustomerInfo(linkedInfo);
        // Already linked in a prior visit (this is a page refresh, not a
        // fresh sign-in) — restoring entitlements silently is enough, the
        // toast would just be noise every time the page reloads.
        if (alreadyLinked) return;
        const hasAnyPremium = Object.keys(linkedInfo.entitlements.active).length > 0;
        if (!hasAnyPremium) {
          showToast("Signed in — no prior purchases found on this account.");
        }
      })
      .catch((error) => {
        console.warn("RecipePrinter: could not link CookPilot account to purchases", error);
        showToast("Signed in, but we couldn't check your purchases. Try again in a moment.");
      });
  }, [cookPilotUser, items]);

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
    if (!revenueCatUserId) return;
    // Background refresh: prime entitlements so owned templates show as owned.
    // Failures here are silent on purpose — the user only needs to hear about a
    // problem if they actually try to unlock/print a premium template, which is
    // handled with a clear toast in unlockTemplateAndPrint.
    refreshCustomerInfo(revenueCatUserId).catch((error) => {
      console.warn("RecipePrinter: could not refresh customer info", error);
    });
  }, [revenueCatUserId]);

  useEffect(() => {
    if (!revenueCatUserId) return;
    loadRecipePrinterTemplatePrices(revenueCatUserId)
      .then(setTemplatePrices)
      .catch(() => setTemplatePrices({}));
  }, [revenueCatUserId]);

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
                  <button
                    type="button"
                    className="recipe-cookpilot-account__link"
                    onClick={() => setShowCookPilotLogin(true)}
                  >
                    Log in
                  </button>
                  <span className="recipe-cookpilot-account__hint">Already purchased?</span>
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
