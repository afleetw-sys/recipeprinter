"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import {
  getRecipeFaces,
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  RecipeCardFace,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { CheckIcon, CrownIcon, ICON_SIZE, PrintIcon, SettingsIcon, SizeIcon } from "@/components/icons";
import { isPremiumTemplate } from "@/lib/premiumTemplates";
import {
  hasTemplateEntitlement,
  loadRecipePrinterCustomerInfo,
  purchaseRecipePrinterTemplate,
  recipePrinterCustomerId,
} from "@/lib/recipePrinterPurchases";
import { friendlyPurchaseSetupError } from "@/lib/friendlyErrors";
import type { SharedRecipeCard } from "@/types/sharedRecipeCard";

const PrintDialogs = dynamic(
  () => import("@/components/PrintDialogs").then((mod) => mod.PrintDialogs),
  { ssr: false, loading: () => null },
);

const PAGE_DIMS: Record<PrintCardSize, { w: number; h: number }> = {
  letter: { w: 8.5 * 96, h: 11 * 96 },
  "card-6x4": { w: 6 * 96, h: 4 * 96 },
};

function isPrintCardSize(value: string): value is PrintCardSize {
  return PRINT_CARD_SIZE_OPTIONS.some((option) => option.id === value);
}

function isRecipePrintTemplate(value: string): value is RecipePrintTemplate {
  return RECIPE_PRINT_TEMPLATE_OPTIONS.some((option) => option.id === value);
}

export function SharedRecipeCardView({ card }: { card: SharedRecipeCard }) {
  const { recipe } = card;
  const [cardSize, setCardSize] = useState<PrintCardSize>(card.cardSize);
  const [template, setTemplate] = useState<RecipePrintTemplate>(card.template);
  const [showPhoto, setShowPhoto] = useState(card.showPhoto);
  const [showSourceUrl, setShowSourceUrl] = useState(card.showSourceUrl);
  const [showCutLines, setShowCutLines] = useState(card.showCutLines);
  const [doubleSided, setDoubleSided] = useState(card.doubleSided);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const [revenueCatUserId, setRevenueCatUserId] = useState<string | null>(null);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [showUnlockDialog, setShowUnlockDialog] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const scalerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.4);

  const selectedPremiumTemplate = isPremiumTemplate(template) ? template : null;
  const selectedTemplateOption = RECIPE_PRINT_TEMPLATE_OPTIONS.find((option) => option.id === template);
  const selectedTemplateLabel = selectedTemplateOption?.label ?? "this";
  // Never bypassed: even the admin's own preloaded template still needs a
  // real entitlement to print. A visitor without one sees the same locked
  // state and purchase flow `/print` uses, and can switch to a free template
  // instead — the share link is a starting point, not a way around paying.
  const selectedTemplateLocked =
    selectedPremiumTemplate !== null && !hasTemplateEntitlement(customerInfo, selectedPremiumTemplate);

  // Only talk to RevenueCat once a premium template is actually in play —
  // mirrors /print's own reluctance to mint a customer record for a drive-by
  // visit with nothing at stake yet.
  useEffect(() => {
    if (!selectedPremiumTemplate || revenueCatUserId) return;
    let cancelled = false;
    recipePrinterCustomerId()
      .then((userId) => {
        if (cancelled) return;
        setRevenueCatUserId(userId);
        return loadRecipePrinterCustomerInfo(userId);
      })
      .then((info) => {
        if (!cancelled && info) setCustomerInfo(info);
      })
      .catch((error) => {
        console.warn("RecipePrinter: could not load template entitlement", error);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedPremiumTemplate, revenueCatUserId]);

  useEffect(() => {
    const el = scalerRef.current;
    if (!el) return;
    const pageW = PAGE_DIMS[cardSize].w;
    const update = () => {
      const availW = el.clientWidth;
      if (availW > 0) setScale(Math.max(0.2, Math.min(1, availW / pageW)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardSize]);

  const faces = useMemo(
    () =>
      getRecipeFaces(recipe, cardSize, {
        hasPhoto: showPhoto && Boolean(recipe.image),
        showSourceUrl,
        template,
      }).pages,
    [recipe, cardSize, showPhoto, showSourceUrl, template],
  );

  // A single shared recipe never shares a physical sheet with another
  // recipe (that machinery in /print exists only for pairing two *different*
  // queued recipes onto one 6x4 sheet), so pairing this recipe's own faces
  // front/back, two at a time, is all that's needed to reproduce the same
  // physical sheets /print would print.
  const sheets = useMemo(() => {
    if (!doubleSided) return faces.map((face) => ({ front: face, back: null }));
    const paired: { front: (typeof faces)[number]; back: (typeof faces)[number] | null }[] = [];
    for (let i = 0; i < faces.length; i += 2) {
      paired.push({ front: faces[i], back: faces[i + 1] ?? null });
    }
    return paired;
  }, [faces, doubleSided]);

  function printNow() {
    window.print();
  }

  function handlePrint() {
    if (purchaseBusy) return;
    if (selectedPremiumTemplate && selectedTemplateLocked) {
      setShowUnlockDialog(true);
      return;
    }
    printNow();
  }

  async function unlockTemplateAndPrint() {
    if (!selectedPremiumTemplate) return;
    if (!revenueCatUserId) {
      setToastMessage("Purchase service is still getting ready. Try again in a moment.");
      return;
    }
    setPurchaseBusy(true);
    setToastMessage(null);
    try {
      const result = await purchaseRecipePrinterTemplate({
        userId: revenueCatUserId,
        template: selectedPremiumTemplate,
      });
      setCustomerInfo(result.customerInfo);
      if (result.cancelled) {
        setToastMessage("Purchase cancelled.");
        return;
      }
      if (!hasTemplateEntitlement(result.customerInfo, selectedPremiumTemplate)) {
        setToastMessage("Purchase finished, but the template is still syncing. Try Print again in a moment.");
        return;
      }
      setShowUnlockDialog(false);
      printNow();
    } catch (error) {
      setToastMessage(friendlyPurchaseSetupError(error));
    } finally {
      setPurchaseBusy(false);
    }
  }

  const dims = PAGE_DIMS[cardSize];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print flex items-center justify-between gap-cp-4 px-cp-6 py-cp-4 border-b border-line">
        <Link href="/" className="font-extrabold tracking-[-0.02em]">
          RecipePrinter
        </Link>
        <div className="flex items-center gap-cp-2">
          <button
            type="button"
            className="btn btn-secondary btn-compact"
            onClick={() => setSettingsOpen((open) => !open)}
          >
            <SettingsIcon size={ICON_SIZE.md} />
            Settings
          </button>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            <PrintIcon size={ICON_SIZE.md} />
            Print recipe
          </button>
        </div>
      </header>

      {toastMessage && (
        <div className="no-print px-cp-6 pt-cp-3">
          <div className="state" role="status">
            <p>{toastMessage}</p>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="no-print px-cp-6 py-cp-4 border-b border-line flex flex-col gap-cp-4">
          <div className="recipe-config-section">
            <span className="recipe-config-label">Size</span>
            <div className="flex gap-cp-2 flex-wrap">
              {PRINT_CARD_SIZE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`btn btn-secondary btn-compact ${cardSize === option.id ? "is-active" : ""}`}
                  aria-pressed={cardSize === option.id}
                  onClick={() => isPrintCardSize(option.id) && setCardSize(option.id)}
                >
                  <SizeIcon size={ICON_SIZE.sm} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="recipe-config-section recipe-config-section--template">
            <h3 className="recipe-config-label">Themes</h3>
            <div className="recipe-template-list">
              {RECIPE_PRINT_TEMPLATE_OPTIONS.map((option) => {
                const premiumTemplate = isPremiumTemplate(option.id) ? option.id : null;
                const locked = premiumTemplate !== null && !hasTemplateEntitlement(customerInfo, premiumTemplate);
                const owned = premiumTemplate !== null && hasTemplateEntitlement(customerInfo, premiumTemplate);
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`recipe-template-option recipe-template-option--${option.id} ${
                      template === option.id ? "is-active" : ""
                    }`}
                    aria-pressed={template === option.id}
                    aria-label={`${option.label}${locked ? " premium" : owned ? " owned" : ""}`}
                    onClick={() => isRecipePrintTemplate(option.id) && setTemplate(option.id)}
                  >
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
                      <span className="recipe-template-option__sample-title">{option.label}</span>
                      <span className="recipe-template-option__sample-meta">{option.detail}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="recipe-config-section flex flex-col gap-cp-2">
            {Boolean(recipe.image) && (
              <label className="recipe-toggle">
                <input type="checkbox" checked={showPhoto} onChange={(event) => setShowPhoto(event.target.checked)} />
                <span>
                  <strong>Show photo</strong>
                </span>
              </label>
            )}
            {Boolean(recipe.sourceUrl) && (
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
            {faces.length > 1 && (
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
          </div>

          {selectedPremiumTemplate && selectedTemplateLocked && (
            <p className="text-cp-small text-ink-soft">
              {selectedTemplateLabel} is a premium theme. You can print with it once unlocked, or switch to a
              free theme like Classic or Pantry.
            </p>
          )}
        </div>
      )}

      <main className="flex-1 px-cp-6 py-cp-6 print:p-0">
        <div ref={scalerRef} className="mx-auto w-full max-w-[900px] flex flex-col items-center gap-cp-5 print:gap-0">
          {sheets.map((sheet, index) => {
            const isLastSheet = index === sheets.length - 1;
            return (
              <div
                key={index}
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
                    className={`recipe-print-preview recipe-print-preview--${cardSize} ${
                      showCutLines ? "recipe-print-preview--cut-lines" : ""
                    }`}
                    data-double-sided={doubleSided ? "true" : "false"}
                  >
                    <div className={`recipe-card-set recipe-card-set--${cardSize} recipe-template--${template}`}>
                      <div
                        className={`recipe-card-page recipe-card-page--front ${
                          isLastSheet && !sheet.back ? "recipe-card-page--no-break" : ""
                        }`}
                      >
                        <RecipeCardFace
                          recipe={recipe}
                          ingredients={sheet.front.ingredients}
                          instructions={sheet.front.instructions}
                          side="front"
                          showHeader={index === 0}
                          layout={sheet.front.layout}
                          hasBackFace={Boolean(sheet.back)}
                          showImage={showPhoto}
                          showSourceUrl={showSourceUrl}
                          continued={index > 0}
                        />
                      </div>
                      {sheet.back && (
                        <div
                          className={`recipe-card-page recipe-card-page--back ${
                            isLastSheet ? "recipe-card-page--no-break" : ""
                          }`}
                        >
                          <RecipeCardFace
                            recipe={recipe}
                            ingredients={sheet.back.ingredients}
                            instructions={sheet.back.instructions}
                            side="back"
                            showHeader={false}
                            layout={sheet.back.layout}
                            hasBackFace
                            continued
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <PrintDialogs
        showDonateDialog={false}
        onCloseDonateDialog={() => {}}
        onOpenFeedbackDialog={() => {}}
        showUnlockDialog={showUnlockDialog}
        onCloseUnlockDialog={() => setShowUnlockDialog(false)}
        selectedPremiumTemplate={selectedPremiumTemplate}
        selectedTemplateLabel={selectedTemplateLabel}
        purchaseBusy={purchaseBusy}
        onUnlockTemplate={unlockTemplateAndPrint}
        canClaimFree={false}
        claimBusy={false}
        onClaimTemplate={() => {}}
        showDeleteRecipeDialog={false}
        deleteRecipeTitle=""
        onCancelDeleteRecipe={() => {}}
        onConfirmDeleteRecipe={() => {}}
      />
    </div>
  );
}
