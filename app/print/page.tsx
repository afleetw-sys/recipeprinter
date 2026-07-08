"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { Select } from "@/components/Select";
import { friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  RecipeCardFace,
  getRecipeFaces,
  recipeNeedsBackSide,
  type PrintCardSize,
  type RecipeFace,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import {
  CheckIcon,
  ChevronLeftIcon,
  CrownIcon,
  ICON_SIZE,
  ImageIcon,
  LinkIcon,
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
import { getFirebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { readCurrentPrintJobIds, readQueue } from "@/lib/queue";
import type { QueueItem, Recipe } from "@/types/recipe";
import type { CustomerInfo } from "@revenuecat/purchases-js";

const PrintDialogs = dynamic(
  () => import("@/components/PrintDialogs").then((mod) => mod.PrintDialogs),
  { ssr: false, loading: () => null },
);

const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:post-print-dialog:last-shown:v1";
const POST_PRINT_DIALOG_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const SINGLE_RECIPE_DECK_TOP_PADDING = 16;

// Layout preferences carry over across visits (device-local, no account/sync)
// so going back to add another recipe doesn't reset the print setup.
const PRINT_SETTINGS_STORAGE_KEY = "recipeprinter:print-settings:v1";

interface StoredPrintSettings {
  cardSize?: string;
  template?: string;
  doubleSided?: boolean;
  showCutLines?: boolean;
  showPhoto?: boolean;
  showSourceUrl?: boolean;
}

function readPrintSettings(): StoredPrintSettings | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as StoredPrintSettings) : null;
  } catch {
    return null;
  }
}

function writePrintSettings(settings: Required<StoredPrintSettings>) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PRINT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage may be unavailable (private mode); settings stay in memory */
  }
}

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

// How many recipe-card slots share one physical page. Letter cards are the
// size of the page, so there's only ever one; 6x4 cards are small enough to
// fit two per sheet (stacked), which is also the most that should share a
// page even if more would technically fit.
const SLOTS_PER_SHEET: Record<PrintCardSize, number> = {
  letter: 1,
  "card-6x4": 2,
};

// Rail thumbnails target a fixed width so they always fit the rail column,
// regardless of page aspect ratio (letter portrait vs. 6x4 landscape).
const RAIL_THUMB_WIDTH = 112;
const RAIL_SCALE: Record<PrintCardSize, number> = {
  letter: RAIL_THUMB_WIDTH / PAGE_DIMS.letter.w,
  "card-6x4": RAIL_THUMB_WIDTH / PAGE_DIMS["card-6x4"].w,
};

// One card-sized slot on a physical sheet: a recipe's front (and, once it's
// paired up during the back pass below, its back/continuation). `null` means
// the slot is unused — the sheet ran out of recipes before filling every slot.
interface SheetSlot {
  recipe: Recipe;
  label: string;
  front: RecipeFace;
  back: RecipeFace | null;
  hasBack: boolean;
  isContinuation: boolean;
  queueIndex: number;
}

// One physical sheet of paper that will actually come out of the printer.
// Letter sheets have a single slot (the card is the page); 6x4 sheets have up
// to two slots side by side on the same page. `backGroupNeeded` covers both
// cases where a back side must print: real back content in any slot, or (for
// duplex jobs) a fully blank back so a later sheet's front doesn't land on
// this sheet's back.
interface PageSheet {
  id: string;
  slots: (SheetSlot | null)[];
  backGroupNeeded: boolean;
}

// The unit the on-screen navigator (rail + deck) browses by: one recipe face
// at a time, exactly like before 6x4 pages started sharing sheets with a
// second recipe. Several `NavItem`s can point at the same sheet/slotIndex —
// that's what lets two recipes that will print on one physical page still
// browse and flip independently on screen.
interface NavItem {
  sheetIndex: number;
  slotIndex: number;
  label: string;
  pageLabel: string;
  flip: boolean;
}

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
  template,
  doubleSided,
  showImage,
  showSourceUrl,
  showCutLines,
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
                    previewHidden={slotIndex !== activeSlotIndex || activeSide !== "front"}
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
                      continued
                      previewHidden={slotIndex !== activeSlotIndex || activeSide !== "back"}
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

function isPrintCardSize(value: string | null): value is PrintCardSize {
  return PRINT_CARD_SIZE_OPTIONS.some((option) => option.id === value);
}

function initialPrintCardSize(value: string | null): PrintCardSize {
  return isPrintCardSize(value) ? value : "letter";
}

function isRecipePrintTemplate(value: string | null): value is RecipePrintTemplate {
  return RECIPE_PRINT_TEMPLATE_OPTIONS.some((option) => option.id === value);
}

function initialRecipePrintTemplate(value: string | null): RecipePrintTemplate {
  return isRecipePrintTemplate(value) ? value : "classic";
}

function friendlyPurchaseError(error: unknown): string {
  return friendlyPurchaseSetupError(error);
}

export default function PrintPage() {
  const params = useSearchParams();
  const idsParam = params.get("ids") ?? "";
  const shouldPrint = params.get("print") === "1";
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [cardSize, setCardSize] = useState<PrintCardSize>(() =>
    initialPrintCardSize(params.get("size")),
  );
  const [template, setTemplate] = useState<RecipePrintTemplate>(() =>
    initialRecipePrintTemplate(params.get("template")),
  );
  const [doubleSided, setDoubleSided] = useState(true);
  const [showCutLines, setShowCutLines] = useState(false);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showSourceUrl, setShowSourceUrl] = useState(false);
  const [showDonateDialog, setShowDonateDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [revenueCatUserId, setRevenueCatUserId] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [templatePrices, setTemplatePrices] = useState<Partial<Record<PremiumRecipePrintTemplate, string>>>({});
  const { user: cookPilotUser } = useCookPilotAuth();
  const [showCookPilotLogin, setShowCookPilotLogin] = useState(false);
  const linkedCookPilotUidRef = useRef<string | null>(null);
  const printRequestedRef = useRef(false);
  const autoPrintAttemptedRef = useRef(false);
  const didMountSettingsRef = useRef(false);

  const anyRecipeHasImage =
    items?.some((item) => Boolean(item.recipe?.image)) ?? false;
  const anyRecipeHasSourceUrl =
    items?.some((item) => Boolean(item.recipe?.sourceUrl)) ?? false;
  const photosOn = showPhoto && anyRecipeHasImage;
  const sourceUrlOn = showSourceUrl && anyRecipeHasSourceUrl;
  // The photo reserves vertical space, so the split must know whether one will
  // render — otherwise content overflows the page instead of flowing to the back.
  const hasRecipeBackSide = useMemo(
    () =>
      items?.some(
        (item) =>
          item.recipe &&
          recipeNeedsBackSide(item.recipe, cardSize, {
            hasPhoto: photosOn && Boolean(item.recipe.image),
            showSourceUrl: sourceUrlOn,
            template,
          }),
      ) ?? false,
    [items, cardSize, photosOn, sourceUrlOn, template],
  );
  const continueOnBack = hasRecipeBackSide && doubleSided;

  // The physical sheets the printer will produce, in order. Each sheet fills
  // its `SLOTS_PER_SHEET[cardSize]` slots by walking an ordered queue of
  // recipes: a slot keeps consuming its current recipe's faces (front, then
  // continuations) until that recipe runs out, then picks up the next one —
  // so short recipes interleave two-to-a-page around a long one that needs
  // several sheets to itself. For two-sided jobs the same slots are filled a
  // second time for the back, so a slot's front and back always belong to the
  // same recipe and land on opposite faces of one sheet.
  const sheets = useMemo<PageSheet[]>(() => {
    const slotCount = SLOTS_PER_SHEET[cardSize];

    interface Column {
      recipe: Recipe;
      label: string;
      faces: RecipeFace[];
      hasBack: boolean;
      idx: number;
      queueIndex: number;
    }

    const queue: Column[] = [];
    for (const item of items ?? []) {
      if (!item.recipe) continue;
      const recipe = item.recipe;
      const faces = getRecipeFaces(recipe, cardSize, {
        hasPhoto: photosOn && Boolean(recipe.image),
        showSourceUrl: sourceUrlOn,
        template,
      });
      queue.push({
        recipe,
        label: recipe.title || "Recipe",
        faces: faces.pages,
        hasBack: faces.hasBack,
        idx: 0,
        queueIndex: queue.length,
      });
    }

    const columns: (Column | null)[] = new Array(slotCount).fill(null);

    function fillColumn(slotIndex: number): Column | null {
      let column = columns[slotIndex];
      if (!column || column.idx >= column.faces.length) {
        column = queue.shift() ?? null;
      }
      columns[slotIndex] = column;
      return column;
    }

    function takeFace(slotIndex: number) {
      const column = fillColumn(slotIndex);
      if (!column) return null;
      const faceIndex = column.idx;
      const face = column.faces[faceIndex];
      column.idx += 1;
      return { column, face, faceIndex };
    }

    const out: PageSheet[] = [];
    let sheetNum = 0;

    while (queue.length > 0 || columns.some((column) => column && column.idx < column.faces.length)) {
      const takes = Array.from({ length: slotCount }, (_, slotIndex) => takeFace(slotIndex));
      if (takes.every((take) => take === null)) break;
      sheetNum += 1;

      const slots: (SheetSlot | null)[] = takes.map((take) =>
        take
          ? {
              recipe: take.column.recipe,
              label: take.column.label,
              front: take.face,
              back: null,
              hasBack: take.column.hasBack,
              isContinuation: take.faceIndex > 0,
              queueIndex: take.column.queueIndex,
            }
          : null,
      );

      let anyBack = false;
      if (continueOnBack) {
        takes.forEach((take, slotIndex) => {
          if (!take) return;
          const column = take.column;
          if (column.idx < column.faces.length) {
            slots[slotIndex]!.back = column.faces[column.idx];
            column.idx += 1;
            anyBack = true;
          }
        });
      }

      out.push({
        id: `sheet-${sheetNum}`,
        slots,
        backGroupNeeded: anyBack,
      });
    }

    // A duplex job needs every sheet but the last to emit a back side — even
    // a fully blank one — so the physical page count stays in sync and a
    // later sheet's front doesn't land on the back of an earlier one.
    if (continueOnBack) {
      out.forEach((sheet, index) => {
        sheet.backGroupNeeded = sheet.backGroupNeeded || index !== out.length - 1;
      });
    }

    return out;
  }, [items, cardSize, continueOnBack, photosOn, sourceUrlOn, template]);

  // What the rail and deck actually browse: one recipe face per item, in the
  // same order recipes were queued, regardless of which physical sheet (and
  // slot on it) they end up sharing for print. A recipe that needs more faces
  // than fit in one front/back pair (long recipes on 6x4, mostly) spends an
  // extra sheet sharing its slot's continuation with whatever the *other*
  // slot on that sheet is doing — scanning sheets in physical order would
  // then interleave that recipe's later faces with its sheet-mate's, so each
  // recipe's items are grouped together (by `queueIndex`) after the scan,
  // keeping this array itself in physical order otherwise unchanged.
  const navItems = useMemo<NavItem[]>(() => {
    const groups = new Map<number, NavItem[]>();
    sheets.forEach((sheet, sheetIndex) => {
      sheet.slots.forEach((slot, slotIndex) => {
        if (!slot) return;
        const navItem: NavItem = {
          sheetIndex,
          slotIndex,
          label: slot.label,
          pageLabel: !continueOnBack
            ? slot.isContinuation
              ? "Continued"
              : slot.hasBack
                ? "Page 1"
                : "One page"
            : slot.isContinuation
              ? "Continued"
              : slot.back
                ? "Two-sided"
                : "One-sided",
          flip: slot.back !== null,
        };
        const group = groups.get(slot.queueIndex);
        if (group) group.push(navItem);
        else groups.set(slot.queueIndex, [navItem]);
      });
    });
    return Array.from(groups.keys())
      .sort((a, b) => a - b)
      .flatMap((queueIndex) => groups.get(queueIndex)!);
  }, [sheets, continueOnBack]);

  const [activeNavIndex, setActiveNavIndex] = useState(0);
  const [canvasSide, setCanvasSide] = useState<"front" | "back">("front");
  const [mobileDrawer, setMobileDrawer] = useState<"template" | null>(null);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const deckRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
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

  const selectedPremiumTemplate = isPremiumTemplate(template) ? template : null;
  const selectedTemplateOption = RECIPE_PRINT_TEMPLATE_OPTIONS.find(
    (option) => option.id === template,
  );
  const selectedTemplateLabel = selectedTemplateOption?.label ?? "this";
  const selectedTemplateLocked =
    selectedPremiumTemplate !== null &&
    !hasTemplateEntitlement(customerInfo, selectedPremiumTemplate);

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

  async function handlePrint() {
    if (purchaseBusy) return;
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
    const queue = readQueue();
    const byId = new Map(queue.map((it) => [it.id, it]));
    const idsFromUrl = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const ids =
      (idsFromUrl.length > 0 ? idsFromUrl : readCurrentPrintJobIds()) ??
      queue.filter((it) => it.status === "ready").map((it) => it.id);
    // Preserve the order from the current print job.
    const printItems = ids
      .map((id) => byId.get(id))
      .filter((it): it is QueueItem => Boolean(it && it.status === "ready" && it.recipe));
    setItems(printItems);
  }, [idsParam]);

  // Hydrate stored layout preferences on mount (client only). Explicit URL
  // params (for deep links) still win over whatever was last saved.
  useEffect(() => {
    const stored = readPrintSettings();
    if (!stored) return;
    if (!params.get("size") && stored.cardSize && isPrintCardSize(stored.cardSize)) {
      setCardSize(stored.cardSize);
    }
    if (!params.get("template") && stored.template && isRecipePrintTemplate(stored.template)) {
      setTemplate(stored.template);
    }
    if (typeof stored.doubleSided === "boolean") setDoubleSided(stored.doubleSided);
    if (typeof stored.showCutLines === "boolean") setShowCutLines(stored.showCutLines);
    if (typeof stored.showPhoto === "boolean") setShowPhoto(stored.showPhoto);
    if (typeof stored.showSourceUrl === "boolean") setShowSourceUrl(stored.showSourceUrl);
    // Runs once on mount; the settings above are the ones being hydrated here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist layout preferences whenever they change. Skip the very first run
  // so this doesn't clobber a stored value with defaults before the hydration
  // effect above has a chance to apply it.
  useEffect(() => {
    if (!didMountSettingsRef.current) {
      didMountSettingsRef.current = true;
      return;
    }
    writePrintSettings({ cardSize, template, doubleSided, showCutLines, showPhoto, showSourceUrl });
  }, [cardSize, template, doubleSided, showCutLines, showPhoto, showSourceUrl]);

  // Auto-open the print dialog when the user chose Print instead of Preview.
  useEffect(() => {
    if (
      shouldPrint &&
      items &&
      items.length > 0 &&
      (!selectedPremiumTemplate || revenueCatUserId) &&
      !autoPrintAttemptedRef.current
    ) {
      autoPrintAttemptedRef.current = true;
      const t = window.setTimeout(() => void handlePrint(), 350);
      return () => window.clearTimeout(t);
    }
  }, [items, revenueCatUserId, selectedPremiumTemplate, shouldPrint, template, customerInfo]);

  useEffect(() => {
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
  }, []);

  useEffect(() => {
    // Runs once per CookPilot login: aliases whatever this browser already
    // purchased anonymously into the CookPilot account, then switches this
    // session to that identity so future purchases stay tied to it too.
    if (!cookPilotUser || linkedCookPilotUidRef.current === cookPilotUser.uid) return;
    linkedCookPilotUidRef.current = cookPilotUser.uid;
    identifyRecipePrinterCustomer(cookPilotUser.uid)
      .then(({ customerInfo: linkedInfo }) => {
        setRevenueCatUserId(cookPilotUser.uid);
        setCustomerInfo(linkedInfo);
        const hasAnyPremium = Object.keys(linkedInfo.entitlements.active).length > 0;
        showToast(
          hasAnyPremium
            ? "Signed in — restored your purchased templates."
            : "Signed in — no prior purchases found on this account.",
        );
      })
      .catch((error) => {
        console.warn("RecipePrinter: could not link CookPilot account to purchases", error);
        showToast("Signed in, but we couldn't check your purchases. Try again in a moment.");
      });
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
        <SiteHeader backHref="/" compact sticky />
        <div className="flex-1 grid place-items-center text-ink-soft">Preparing…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <SiteHeader backHref="/" compact sticky />
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
      <SiteHeader backHref="/" compact sticky />

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
                      {hasRecipeBackSide && (
                        <label className="recipe-toggle">
                          <input
                            type="checkbox"
                            checked={doubleSided}
                            onChange={(event) => setDoubleSided(event.target.checked)}
                          />
                          <span>
                            <strong>Two-sided</strong>
                          </span>
                        </label>
                      )}
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
                    </div>
                  )}
                </div>
              )}
              <button
                type="button"
                className="btn btn-primary btn-compact recipe-mobile-topbar__print"
                onClick={handleMobilePrint}
                disabled={purchaseBusy}
              >
                {purchaseBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <PrintIcon size={ICON_SIZE.md} />}
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
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    if (isActive) return;
                    goToSlide(index);
                  }}
                >
                  {isActive && navItem.flip && (
                    <div
                      className="recipe-card-side-nav recipe-page-canvas__flip no-print"
                      aria-label="Sheet sides"
                    >
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
                  <ScaledPage
                    sheet={sheet}
                    isLastSheet={navItem.sheetIndex === sheets.length - 1}
                    activeSlotIndex={navItem.slotIndex}
                    activeSide={isActive ? canvasSide : "front"}
                    scale={deckScale}
                    size={cardSize}
                    template={template}
                    doubleSided={continueOnBack}
                    showImage={photosOn}
                    showSourceUrl={sourceUrlOn}
                    showCutLines={showCutLines && cardSize === "card-6x4"}
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
              {mobileDrawer === "template" ? "Templates" : "Print setup"}
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

          {(hasRecipeBackSide || cardSize === "card-6x4") && (
            <div className="recipe-config-section recipe-config-section--printsettings">
              <h3 className="recipe-config-label">Print settings</h3>
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
            </div>
          )}

          <div className="recipe-config-section recipe-config-section--template">
            <h3 className="recipe-config-label">Templates</h3>
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
                <button
                  type="button"
                  className="recipe-cookpilot-account__link"
                  onClick={() => setShowCookPilotLogin(true)}
                >
                  Already purchased? Log in
                </button>
              )}
            </div>
          </div>
          </div>

          <div className="recipe-config-panel__footer">
            <button
              onClick={() => void handlePrint()}
              className="btn btn-primary recipe-print-button"
              disabled={purchaseBusy}
            >
              {purchaseBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <PrintIcon size={ICON_SIZE.md} />}
              {selectedTemplateLocked ? "Unlock & Print" : "Print"}
            </button>
          </div>
        </aside>

        <div className="recipe-mobile-actions no-print">
          <div className="recipe-mobile-toolbar">
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
              Template
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
      />
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
