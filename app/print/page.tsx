"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  type User,
} from "firebase/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { Select } from "@/components/Select";
import { friendlyAuthError, friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import RecipeCardPrint, {
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
  PrintIcon,
  SpinnerIcon,
  XIcon,
} from "@/components/icons";
import { getFirebaseAuth } from "@/lib/firebase/client";
import {
  isPremiumTemplate,
  type PremiumRecipePrintTemplate,
} from "@/lib/premiumTemplates";
import {
  hasTemplateEntitlement,
  loadRecipePrinterCustomerInfo,
  loadRecipePrinterTemplatePrices,
  purchaseRecipePrinterTemplate,
} from "@/lib/recipePrinterPurchases";
import { readCurrentPrintJobIds, readQueue } from "@/lib/queue";
import type { QueueItem, Recipe } from "@/types/recipe";
import type { CustomerInfo } from "@revenuecat/purchases-js";

const PrintDialogs = dynamic(
  () => import("@/components/PrintDialogs").then((mod) => mod.PrintDialogs),
  { ssr: false, loading: () => null },
);

const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:post-print-dialog:last-shown:v1";
const POST_PRINT_DIALOG_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_LINK_STORAGE_KEY = "recipeprinter:purchase-email-link:v1";
const PENDING_PRINT_STORAGE_KEY = "recipeprinter:pending-premium-print:v1";
const PRICE_LOOKUP_USER_STORAGE_KEY = "recipeprinter:price-lookup-user:v1";
const SINGLE_RECIPE_DECK_TOP_PADDING = 16;

// Real printed page dimensions in CSS px (96px per inch). The page navigator
// renders each card at this true size and scales it down with a transform, so
// thumbnails and the canvas look exactly like the paper, just smaller.
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

// One physical sheet of paper in the navigator. A two-sided sheet keeps a
// front+back pair (flip to see the back); a single-sided continuation is its
// own sheet.
interface PageSheet {
  id: string;
  recipe: Recipe;
  label: string;
  pageLabel: string;
  front: RecipeFace;
  back: RecipeFace | null;
  flip: boolean;
  hasBack: boolean;
  twoSided: boolean;
  isContinuation: boolean;
}

/** A single recipe face rendered at true page size, scaled down by `scale`. */
const ScaledPage = memo(function ScaledPage({
  sheet,
  side,
  scale,
  size,
  template,
  doubleSided,
  showImage,
}: {
  sheet: PageSheet;
  side: "front" | "back";
  scale: number;
  size: PrintCardSize;
  template: RecipePrintTemplate;
  doubleSided: boolean;
  showImage: boolean;
}) {
  const dims = PAGE_DIMS[size];
  const face = side === "back" && sheet.back ? sheet.back : sheet.front;
  const isBackContent = sheet.isContinuation || (side === "back" && sheet.back !== null);
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
          className={`recipe-print-preview recipe-print-preview--${size}`}
          data-double-sided={doubleSided ? "true" : "false"}
        >
          <div
            className={`recipe-card-set recipe-card-set--${size} recipe-template--${template}`}
          >
            <RecipeCardFace
              recipe={sheet.recipe}
              ingredients={face.ingredients}
              instructions={face.instructions}
              side={side}
              showHeader={!isBackContent}
              layout={face.layout}
              hasBackFace={sheet.hasBack}
              showImage={showImage}
              continued={isBackContent}
            />
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

function pendingPrintTemplate(): RecipePrintTemplate | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(PENDING_PRINT_STORAGE_KEY);
  return isRecipePrintTemplate(value) ? value : null;
}

function friendlyPurchaseError(error: unknown): string {
  return friendlyPurchaseSetupError(error);
}

function priceLookupUserId(): string {
  if (typeof window === "undefined") return "recipeprinter-price-preview";
  const stored = window.localStorage.getItem(PRICE_LOOKUP_USER_STORAGE_KEY);
  if (stored) return stored;

  const next = `recipeprinter-price-${crypto.randomUUID()}`;
  window.localStorage.setItem(PRICE_LOOKUP_USER_STORAGE_KEY, next);
  return next;
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
  const [showCutLines, setShowCutLines] = useState(true);
  const [showPhoto, setShowPhoto] = useState(false);
  const [showDonateDialog, setShowDonateDialog] = useState(false);
  const [showFeedbackDialog, setShowFeedbackDialog] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showSignInDialog, setShowSignInDialog] = useState(false);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [signInEmail, setSignInEmail] = useState("");
  const [signInBusy, setSignInBusy] = useState(false);
  const [signInMessage, setSignInMessage] = useState<string | null>(null);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [templatePrices, setTemplatePrices] = useState<Partial<Record<PremiumRecipePrintTemplate, string>>>({});
  const [resumePrintAfterSignIn, setResumePrintAfterSignIn] = useState(false);
  const printRequestedRef = useRef(false);
  const autoPrintAttemptedRef = useRef(false);

  const anyRecipeHasImage =
    items?.some((item) => Boolean(item.recipe?.image)) ?? false;
  const photosOn = showPhoto && anyRecipeHasImage;
  // The photo reserves vertical space, so the split must know whether one will
  // render — otherwise content overflows the page instead of flowing to the back.
  const hasRecipeBackSide = useMemo(
    () =>
      items?.some(
        (item) =>
          item.recipe &&
          recipeNeedsBackSide(item.recipe, cardSize, {
            hasPhoto: photosOn && Boolean(item.recipe.image),
            template,
          }),
      ) ?? false,
    [items, cardSize, photosOn, template],
  );
  const continueOnBack = hasRecipeBackSide && doubleSided;

  // The physical sheets the printer will produce, in order. Two-sided sheets
  // keep a flippable front+back; single-sided overflow becomes its own sheet.
  const sheets = useMemo<PageSheet[]>(() => {
    const out: PageSheet[] = [];
    for (const item of items ?? []) {
      if (!item.recipe) continue;
      const recipe = item.recipe;
      const title = recipe.title || "Recipe";
      const faces = getRecipeFaces(recipe, cardSize, {
        hasPhoto: photosOn && Boolean(recipe.image),
        template,
      });
      if (continueOnBack) {
        for (let pageIndex = 0; pageIndex < faces.pages.length; pageIndex += 2) {
          const front = faces.pages[pageIndex];
          const back = faces.pages[pageIndex + 1] ?? null;
          const isContinuation = pageIndex > 0;
          out.push({
            id: `${item.id}-sheet-${pageIndex / 2 + 1}`,
            recipe,
            label: title,
            pageLabel:
              pageIndex === 0
                ? back
                  ? "Two-sided"
                  : "One-sided"
                : back
                  ? `Continued ${pageIndex + 1}-${pageIndex + 2}`
                  : `Continued ${pageIndex + 1}`,
            front,
            back,
            flip: back !== null,
            hasBack: faces.hasBack,
            twoSided: back !== null,
            isContinuation,
          });
        }
      } else {
        faces.pages.forEach((face, pageIndex) => {
          out.push({
            id: `${item.id}-page-${pageIndex + 1}`,
            recipe,
            label: title,
            pageLabel:
              pageIndex === 0
                ? faces.hasBack
                  ? "Page 1"
                  : "One page"
                : `Page ${pageIndex + 1} · continued`,
            front: face,
            back: null,
            flip: false,
            hasBack: faces.hasBack,
            twoSided: false,
            isContinuation: pageIndex > 0,
          });
        });
      }
    }
    return out;
  }, [items, cardSize, continueOnBack, photosOn, template]);

  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [canvasSide, setCanvasSide] = useState<"front" | "back">("front");
  const [mobileDrawer, setMobileDrawer] = useState<"template" | null>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [deckScale, setDeckScale] = useState(0.5);
  // While we scroll the deck programmatically (after a click), ignore the
  // scroll-driven selection so it doesn't yank the outline back to whichever
  // page is momentarily centred mid-animation.
  const suppressScrollSyncRef = useRef(false);
  const scrollSyncTimerRef = useRef<number | undefined>(undefined);

  // Keep the active sheet valid as the page list changes (size / two-sided).
  useEffect(() => {
    setActiveSheetIndex((index) => Math.min(index, Math.max(0, sheets.length - 1)));
  }, [sheets.length]);

  // Always start a freshly selected sheet on its front face.
  useEffect(() => {
    setCanvasSide("front");
  }, [activeSheetIndex, continueOnBack]);

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

  // Scrolling the deck selects whichever page is closest to the centre.
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
        let best = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        slideRefs.current.forEach((slide, index) => {
          if (!slide) return;
          const center = mobile
            ? slide.offsetLeft + slide.offsetWidth / 2
            : slide.offsetTop + slide.offsetHeight / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = index;
          }
        });
        setActiveSheetIndex(best);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [sheets.length]);

  // Centre the active page when the deck is first laid out or rescaled.
  useEffect(() => {
    centerSlide(activeSheetIndex);
    // Only re-centre on structural / size changes, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets.length, deckScale, cardSize]);

  const singleRecipePrintView =
    (items?.filter((item) => Boolean(item.recipe)).length ?? 0) === 1;

  function centerSlide(index: number, behavior: ScrollBehavior = "auto") {
    const deck = deckRef.current;
    const slide = slideRefs.current[index];
    if (!deck || !slide) return;

    if (window.matchMedia("(max-width: 820px)").matches) {
      const targetLeft = slide.offsetLeft - (deck.clientWidth - slide.offsetWidth) / 2;
      const maxLeft = deck.scrollWidth - deck.clientWidth;
      deck.scrollTo({
        left: Math.max(0, Math.min(targetLeft, maxLeft)),
        behavior,
      });
      return;
    }

    const targetTop = singleRecipePrintView
      ? slide.offsetTop - SINGLE_RECIPE_DECK_TOP_PADDING
      : slide.offsetTop - (deck.clientHeight - slide.offsetHeight) / 2;
    const maxTop = deck.scrollHeight - deck.clientHeight;
    deck.scrollTo({
      top: Math.max(0, Math.min(targetTop, maxTop)),
      behavior,
    });
  }

  function goToSlide(index: number) {
    const behavior = Math.abs(index - activeSheetIndex) <= 3 ? "smooth" : "auto";
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
    setActiveSheetIndex(index);
    centerSlide(index, behavior);
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

  async function refreshCustomerInfo(nextUser = user): Promise<CustomerInfo | null> {
    if (!nextUser || nextUser.isAnonymous) return null;
    const info = await loadRecipePrinterCustomerInfo(nextUser.uid);
    setCustomerInfo(info);
    return info;
  }

  async function unlockTemplateAndPrint(premiumTemplate: PremiumRecipePrintTemplate) {
    if (!user || user.isAnonymous) {
      window.localStorage.setItem(PENDING_PRINT_STORAGE_KEY, premiumTemplate);
      setShowSignInDialog(true);
      return;
    }

    setPurchaseBusy(true);
    setToastMessage(null);
    try {
      const latestInfo = customerInfo ?? (await refreshCustomerInfo(user));
      if (hasTemplateEntitlement(latestInfo, premiumTemplate)) {
        setShowUnlockDialog(false);
        printNow();
        return;
      }

      const result = await purchaseRecipePrinterTemplate({
        userId: user.uid,
        email: user.email,
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

      window.localStorage.removeItem(PENDING_PRINT_STORAGE_KEY);
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
        if (!user) {
          window.localStorage.setItem(PENDING_PRINT_STORAGE_KEY, selectedPremiumTemplate);
          setShowSignInDialog(true);
          return;
        }
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

  async function handleSignInSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedEmail = signInEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setSignInMessage("Enter the email you want to use for RecipePrinter purchases.");
      return;
    }

    setSignInBusy(true);
    setSignInMessage(null);
    try {
      window.localStorage.setItem(EMAIL_LINK_STORAGE_KEY, normalizedEmail);
      if (selectedPremiumTemplate) {
        window.localStorage.setItem(PENDING_PRINT_STORAGE_KEY, selectedPremiumTemplate);
      }
      await sendSignInLinkToEmail(getFirebaseAuth(), normalizedEmail, {
        url: window.location.href,
        handleCodeInApp: true,
      });
      setSignInMessage("Check your email for the sign-in link, then come back here to finish printing.");
    } catch (error) {
      setSignInMessage(friendlyAuthError(error, "We couldn't send that sign-in link. Please try again."));
    } finally {
      setSignInBusy(false);
    }
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

  // Auto-open the print dialog when the user chose Print instead of Preview.
  useEffect(() => {
    if (shouldPrint && authReady && items && items.length > 0 && !autoPrintAttemptedRef.current) {
      autoPrintAttemptedRef.current = true;
      const t = window.setTimeout(() => void handlePrint(), 350);
      return () => window.clearTimeout(t);
    }
  }, [authReady, items, shouldPrint, template, customerInfo]);

  useEffect(() => {
    return onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
      setUser(nextUser && !nextUser.isAnonymous ? nextUser : null);
      setAuthReady(true);
      if (!nextUser || nextUser.isAnonymous) {
        setCustomerInfo(null);
      }
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    // Background refresh: prime entitlements so owned templates show as owned.
    // Failures here are silent on purpose — the user only needs to hear about a
    // problem if they actually try to unlock/print a premium template, which is
    // handled with a clear toast in unlockTemplateAndPrint.
    refreshCustomerInfo(user).catch((error) => {
      console.warn("RecipePrinter: could not refresh customer info", error);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!authReady) return;
    const priceUserId = user?.uid ?? priceLookupUserId();
    loadRecipePrinterTemplatePrices(priceUserId)
      .then(setTemplatePrices)
      .catch(() => setTemplatePrices({}));
  }, [authReady, user?.uid]);

  useEffect(() => {
    if (!toastMessage) return;
    const timeout = window.setTimeout(() => setToastMessage(null), 5200);
    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const storedEmail = window.localStorage.getItem(EMAIL_LINK_STORAGE_KEY);
    if (!storedEmail) {
      setShowSignInDialog(true);
      setSignInMessage("Enter your email and open the link from the same browser to finish signing in.");
      return;
    }

    setSignInBusy(true);
    signInWithEmailLink(auth, storedEmail, window.location.href)
      .then(() => {
        window.localStorage.removeItem(EMAIL_LINK_STORAGE_KEY);
        setShowSignInDialog(false);
        setResumePrintAfterSignIn(Boolean(pendingPrintTemplate()));
      })
      .catch((error) => {
        setShowSignInDialog(true);
        setSignInMessage(friendlyAuthError(error, "That sign-in link didn't work. Send yourself a new one and try again."));
      })
      .finally(() => setSignInBusy(false));
  }, []);

  useEffect(() => {
    if (!resumePrintAfterSignIn || !user || !items || items.length === 0) return;
    const pendingTemplate = pendingPrintTemplate();
    if (!pendingTemplate || pendingTemplate !== template) {
      setResumePrintAfterSignIn(false);
      return;
    }

    setResumePrintAfterSignIn(false);
    void handlePrint();
  }, [resumePrintAfterSignIn, user, items, template, customerInfo]);

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
      {/* Toolbar, hidden when printing */}
      <SiteHeader backHref="/" compact sticky />

      {/* Print preview / printed content */}
      <main className="recipe-print-shell px-cp-6 print:p-0">
        {/* Left: page navigator rail (PowerPoint-style) */}
        <nav
          className={`recipe-page-rail recipe-page-rail--${cardSize} no-print`}
          aria-label="Pages"
        >
          {sheets.map((sheet, index) => (
            <button
              key={sheet.id}
              type="button"
              className={`recipe-page-rail__item ${
                index === activeSheetIndex ? "is-active" : ""
              }`}
              aria-current={index === activeSheetIndex}
              onClick={() => goToSlide(index)}
            >
              <span className="recipe-page-rail__num">{index + 1}</span>
              <span className="recipe-page-rail__thumb">
                <ScaledPage
                  sheet={sheet}
                  side="front"
                  scale={RAIL_SCALE[cardSize]}
                  size={cardSize}
                  template={template}
                  doubleSided={continueOnBack}
                  showImage={photosOn}
                />
              </span>
              <span className="recipe-page-rail__label">
                <span className="recipe-page-rail__title">{sheet.label}</span>
                <span className="recipe-page-rail__meta">{sheet.pageLabel}</span>
              </span>
            </button>
          ))}
        </nav>

        {/* Center: large preview of the selected page */}
        <section
          className="recipe-page-canvas no-print"
          aria-label="Selected page"
          data-single-recipe={singleRecipePrintView ? "true" : "false"}
        >
          <div className="recipe-mobile-topbar no-print">
            <Link href="/" className="recipe-mobile-back-button" aria-label="Back to recipes">
              <ChevronLeftIcon size={ICON_SIZE.lg} />
              <span>Back</span>
            </Link>
            <div className="recipe-mobile-page-count" aria-live="polite">
              {activeSheetIndex + 1} of {sheets.length}
            </div>
          </div>
          <div className="recipe-mobile-toolbar no-print">
            <Select
              className="recipe-mobile-toolbar__size-select"
              aria-label="Card size"
              value={cardSize}
              onChange={(event) => setCardSize(event.target.value as PrintCardSize)}
            >
              {PRINT_CARD_SIZE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
            <button
              type="button"
              className={`recipe-mobile-toolbar__btn ${mobileDrawer === "template" ? "is-active" : ""}`}
              aria-pressed={mobileDrawer === "template"}
              onClick={() => setMobileDrawer("template")}
            >
              Change template
            </button>
          </div>
          {(anyRecipeHasImage || hasRecipeBackSide || cardSize === "card-6x4") && (
            <div className="recipe-mobile-chip-scroll no-print">
              {anyRecipeHasImage && (
                <button
                  type="button"
                  className={`recipe-setting-chip ${showPhoto ? "is-active" : ""}`}
                  aria-pressed={showPhoto}
                  onClick={() => setShowPhoto((value) => !value)}
                >
                  {showPhoto && <CheckIcon size={ICON_SIZE.xs} />}
                  Recipe photo
                </button>
              )}
              {hasRecipeBackSide && (
                <button
                  type="button"
                  className={`recipe-setting-chip ${doubleSided ? "is-active" : ""}`}
                  aria-pressed={doubleSided}
                  onClick={() => setDoubleSided((value) => !value)}
                >
                  {doubleSided && <CheckIcon size={ICON_SIZE.xs} />}
                  Two-sided
                </button>
              )}
              {cardSize === "card-6x4" && (
                <button
                  type="button"
                  className={`recipe-setting-chip ${showCutLines ? "is-active" : ""}`}
                  aria-pressed={showCutLines}
                  onClick={() => setShowCutLines((value) => !value)}
                >
                  {showCutLines && <CheckIcon size={ICON_SIZE.xs} />}
                  Cut lines
                </button>
              )}
            </div>
          )}
          <div className="recipe-page-deck" id="recipe-page-deck" ref={deckRef}>
            {sheets.map((sheet, index) => (
              <div
                key={sheet.id}
                ref={(el) => {
                  slideRefs.current[index] = el;
                }}
                className={`recipe-page-slide ${
                  index === activeSheetIndex ? "is-active" : ""
                }`}
                onClick={() => goToSlide(index)}
                role="button"
                tabIndex={0}
                aria-current={index === activeSheetIndex}
                aria-label={`${sheet.label} (${sheet.pageLabel})`}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    goToSlide(index);
                  }
                }}
              >
                {index === activeSheetIndex && sheet.flip && (
                  <div className="recipe-card-side-nav recipe-page-canvas__flip" aria-label="Sheet sides">
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
                  side={index === activeSheetIndex ? canvasSide : "front"}
                  scale={deckScale}
                  size={cardSize}
                  template={template}
                  doubleSided={continueOnBack}
                  showImage={photosOn}
                />
              </div>
            ))}
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

          {anyRecipeHasImage && (
            <div className="recipe-config-section recipe-config-section--settings">
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
            </div>
          )}

          {(hasRecipeBackSide || cardSize === "card-6x4") && (
            <div className="recipe-config-section recipe-config-section--settings">
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
                    <small>Show dashed guides on printed 6 x 4 cards.</small>
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
          </div>
          </div>

          <div className="recipe-config-panel__footer">
            <p className="recipe-print-tip">
              Tip: print one recipe first to check the layout.
            </p>
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
          <button
            type="button"
            className="btn btn-primary recipe-mobile-print-button"
            onClick={handleMobilePrint}
            disabled={purchaseBusy}
          >
            {purchaseBusy ? <SpinnerIcon size={ICON_SIZE.md} /> : <PrintIcon size={ICON_SIZE.md} />}
            {selectedTemplateLocked ? "Unlock & Print" : "Print"}
          </button>
        </div>

        {/* Hidden source that produces the actual printed pages. */}
        <div className="recipe-print-source" aria-hidden>
          <div
            className={`recipe-print-preview recipe-print-preview--${cardSize} ${
              showCutLines ? "recipe-print-preview--cut-lines" : ""
            } flex flex-col items-center gap-cp-6 print:block`}
            data-double-sided={continueOnBack ? "true" : "false"}
          >
            {items.map((item, index) => (
              <RecipeCardPrint
                key={item.id}
                recipe={item.recipe!}
                size={cardSize}
                template={template}
                doubleSided={continueOnBack}
                isLast={index === items.length - 1}
                showImage={photosOn}
              />
            ))}
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
        user={user}
        purchaseBusy={purchaseBusy}
        onUnlockTemplate={(premiumTemplate) => void unlockTemplateAndPrint(premiumTemplate)}
        showSignInDialog={showSignInDialog}
        onCloseSignInDialog={() => setShowSignInDialog(false)}
        onSignInSubmit={handleSignInSubmit}
        signInEmail={signInEmail}
        onSignInEmailChange={setSignInEmail}
        signInBusy={signInBusy}
        signInMessage={signInMessage}
      />
      <FeedbackDialog
        open={showFeedbackDialog}
        onClose={() => setShowFeedbackDialog(false)}
        initialType="print_issue"
      />
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
