"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  type User,
} from "firebase/auth";
import { SiteHeader } from "@/components/SiteHeader";
import { FeedbackDialog } from "@/components/FeedbackButton";
import { friendlyAuthError, friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import RecipeCardPrint, {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  recipeNeedsBackSide,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { CheckIcon, CrownIcon, PrintIcon, SpinnerIcon, XIcon } from "@/components/icons";
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
import { readCurrentPrintJobIds, readPrintJobIds, readQueue } from "@/lib/queue";
import type { QueueItem } from "@/types/recipe";
import type { CustomerInfo } from "@revenuecat/purchases-js";

const COFFEE_URL = "https://buymeacoffee.com/recipeprinter";
const POST_PRINT_DIALOG_STORAGE_KEY = "recipeprinter:post-print-dialog:last-shown:v1";
const POST_PRINT_DIALOG_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_LINK_STORAGE_KEY = "recipeprinter:purchase-email-link:v1";
const PENDING_PRINT_STORAGE_KEY = "recipeprinter:pending-premium-print:v1";
const PRICE_LOOKUP_USER_STORAGE_KEY = "recipeprinter:price-lookup-user:v1";

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

function accountLabelFor(user: User): string {
  return user.email || user.displayName || "your CookPilot account";
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
  const jobParam = params.get("job") ?? "";
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

  const selectedSize = PRINT_CARD_SIZE_OPTIONS.find((option) => option.id === cardSize);
  const selectedTemplateOption = RECIPE_PRINT_TEMPLATE_OPTIONS.find((option) => option.id === template);
  const hasRecipeBackSide =
    items?.some((item) => item.recipe && recipeNeedsBackSide(item.recipe, cardSize)) ?? false;
  const continueOnBack = hasRecipeBackSide && doubleSided;
  const selectedPremiumTemplate = isPremiumTemplate(template) ? template : null;
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
    const jobIds = jobParam ? readPrintJobIds(jobParam) : null;
    const idsFromUrl = idsParam.split(",").map((s) => s.trim()).filter(Boolean);
    const ids =
      jobIds ??
      (idsFromUrl.length > 0 ? idsFromUrl : readCurrentPrintJobIds()) ??
      queue.filter((it) => it.status === "ready" && it.selected).map((it) => it.id);
    // Preserve the order the user selected them in.
    const selected = ids
      .map((id) => byId.get(id))
      .filter((it): it is QueueItem => Boolean(it && it.status === "ready" && it.recipe));
    setItems(selected);
  }, [idsParam, jobParam]);

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
    refreshCustomerInfo(user).catch((error) => {
      showToast(friendlyPurchaseError(error));
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
      <div className="min-h-screen flex flex-col">
        <SiteHeader backHref="/" compact sticky />
        <div className="flex-1 grid place-items-center text-ink-soft">Preparing…</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col">
        <SiteHeader backHref="/" compact sticky />
        <div className="flex-1 flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
          <p className="font-bold text-[1.1rem]">Nothing to print</p>
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
    <div className="min-h-screen">
      {/* Toolbar, hidden when printing */}
      <SiteHeader
        backHref="/"
        compact
        sticky
        actions={
          <>
            <span className="text-[0.85rem] text-ink-soft hidden sm:inline">
              {items.length} {items.length === 1 ? "recipe" : "recipes"}
            </span>
            <button
              onClick={() => void handlePrint()}
              className="btn btn-primary btn-compact"
              disabled={purchaseBusy}
            >
              {purchaseBusy ? <SpinnerIcon size={16} /> : <PrintIcon size={16} />}
              {selectedTemplateLocked ? "Unlock & Print" : "Print"}
            </button>
          </>
        }
      />

      {/* Print preview / printed content */}
      <main className="recipe-print-shell px-cp-6 py-cp-7 print:p-0">
        <aside className="recipe-config-panel no-print" aria-label="Recipe print settings">
          <div className="recipe-config-panel__header">
            <h2 className="text-[0.95rem] font-extrabold tracking-[-0.02em]">Print setup</h2>
          </div>

          <div className="recipe-config-section">
            <label className="recipe-config-label" htmlFor="recipe-print-size">
              Size
            </label>
            <select
              id="recipe-print-size"
              className="field recipe-size-select !min-h-[38px] !py-0 !pl-3 text-[0.85rem] font-semibold"
              value={cardSize}
              onChange={(event) => setCardSize(event.target.value as PrintCardSize)}
            >
              {PRINT_CARD_SIZE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {hasRecipeBackSide && (
            <div className="recipe-config-section">
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
            </div>
          )}

          {cardSize === "card-6x4" && (
            <div className="recipe-config-section">
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
            </div>
          )}

          <div className="recipe-config-section">
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
                        <CrownIcon size={12} />
                        {premiumTemplate && templatePrices[premiumTemplate] ? (
                          <span>{templatePrices[premiumTemplate]}</span>
                        ) : null}
                      </span>
                    )}
                    {owned && (
                      <span className="recipe-template-option__owned" aria-label="Owned">
                        <CheckIcon size={12} />
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
        </aside>

        <div className="recipe-print-stage">
          {shouldPrint && (
            <p className="no-print text-center text-[0.8rem] text-ink-soft mb-cp-6">
              The print dialog opens automatically. Each recipe prints as its own {selectedSize?.label ?? "recipe card"}.
            </p>
          )}
          <div
            className={`recipe-print-preview recipe-print-preview--${cardSize} ${
              showCutLines ? "recipe-print-preview--cut-lines" : ""
            } flex flex-col items-center gap-cp-6 print:gap-0 print:items-stretch`}
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
              />
            ))}
          </div>
        </div>
      </main>

      {showDonateDialog && (
        <div
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="print-success-title"
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close"
              aria-label="Close"
              onClick={() => setShowDonateDialog(false)}
            >
              ×
            </button>
            <div className="print-success-dialog__icon" aria-hidden>
              <img
                src="/images/recipeprinter-logo.png"
                alt=""
                className="print-success-dialog__logo"
              />
            </div>
            <h2 id="print-success-title">Ready for your counter, binder, or fridge door.</h2>
            <p>
              Support and feedback help me make RecipePrinter better.
            </p>
            <div className="print-success-dialog__actions">
              <a
                href={COFFEE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Support RecipePrinter
              </a>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setShowDonateDialog(false);
                  setShowFeedbackDialog(true);
                }}
              >
                Leave feedback
              </button>
            </div>
          </div>
        </div>
      )}
      {showUnlockDialog && selectedPremiumTemplate && user && (
        <div
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipeprinter-unlock-title"
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <div className="print-success-dialog__panel">
            <button
              type="button"
              className="print-success-dialog__close"
              aria-label="Close"
              onClick={() => setShowUnlockDialog(false)}
              disabled={purchaseBusy}
            >
              <XIcon size={16} />
            </button>
            <h2 id="recipeprinter-unlock-title">Unlock {selectedTemplateOption?.label ?? "this template"}?</h2>
            <p>
              You&apos;re logged in as <strong>{accountLabelFor(user)}</strong>. This purchase will
              be saved to that account so you can print with this template again.
            </p>
            <div className="print-success-dialog__actions">
              <button
                type="button"
                className="btn btn-primary"
                disabled={purchaseBusy}
                onClick={() => void unlockTemplateAndPrint(selectedPremiumTemplate)}
              >
                {purchaseBusy ? <SpinnerIcon size={16} /> : <CrownIcon size={16} />}
                Unlock & Print
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowUnlockDialog(false)}
                disabled={purchaseBusy}
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}
      {showSignInDialog && (
        <div
          className="print-success-dialog no-print"
          role="dialog"
          aria-modal="true"
          aria-labelledby="recipeprinter-sign-in-title"
        >
          <div className="print-success-dialog__backdrop" aria-hidden />
          <form className="print-success-dialog__panel" onSubmit={handleSignInSubmit}>
            <button
              type="button"
              className="print-success-dialog__close"
              aria-label="Close"
              onClick={() => setShowSignInDialog(false)}
            >
              <XIcon size={16} />
            </button>
            <h2 id="recipeprinter-sign-in-title">Sign in to unlock this template.</h2>
            <p>
              Use the email for your CookPilot account if you have one. RecipePrinter
              will remember purchased templates there.
            </p>
            <label className="field-label text-left mt-cp-4" htmlFor="recipeprinter-purchase-email">
              Email
            </label>
            <input
              id="recipeprinter-purchase-email"
              className="field"
              type="email"
              autoComplete="email"
              value={signInEmail}
              onChange={(event) => setSignInEmail(event.target.value)}
              disabled={signInBusy}
            />
            {signInMessage && <p className="recipe-template-note">{signInMessage}</p>}
            <div className="print-success-dialog__actions">
              <button type="submit" className="btn btn-primary" disabled={signInBusy}>
                {signInBusy ? <SpinnerIcon size={16} /> : null}
                Send sign-in link
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowSignInDialog(false)}
              >
                Not now
              </button>
            </div>
          </form>
        </div>
      )}
      <FeedbackDialog
        open={showFeedbackDialog}
        onClose={() => setShowFeedbackDialog(false)}
        initialType="print_issue"
      />
      {toastMessage && (
        <div className="recipe-toast no-print" role="status" aria-live="polite">
          <span>{toastMessage}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setToastMessage(null)}>
            <XIcon size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
