"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import RecipeCardPrint, {
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
  type PrintCardSize,
  type RecipePrintTemplate,
} from "@/components/RecipeCardPrint";
import { LogoMark, Wordmark } from "@/components/Logo";
import { CrownIcon, PrintIcon } from "@/components/icons";
import { readCurrentPrintJobIds, readPrintJobIds, readQueue } from "@/lib/queue";
import type { QueueItem } from "@/types/recipe";

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

  const selectedSize = PRINT_CARD_SIZE_OPTIONS.find((option) => option.id === cardSize);

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
    if (shouldPrint && items && items.length > 0) {
      const t = window.setTimeout(() => window.print(), 350);
      return () => window.clearTimeout(t);
    }
  }, [items, shouldPrint]);

  if (items === null) {
    return (
      <div className="min-h-screen grid place-items-center text-ink-soft">Preparing…</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-cp-4 text-center px-cp-6">
        <p className="font-bold text-[1.1rem]">Nothing to print</p>
        <p className="text-ink-soft max-w-sm">
          We couldn&apos;t find those recipes. They may have been removed, or this page was
          opened directly.
        </p>
        <Link href="/" className="btn btn-primary">
          Back to your recipes
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Toolbar, hidden when printing */}
      <header className="no-print sticky top-0 z-10 flex items-center justify-between gap-cp-4 px-cp-6 py-cp-3 min-h-[62px] bg-page border-b border-line flex-wrap">
        <Link href="/" className="flex items-center gap-cp-3 group">
          <span className="text-ink-soft group-hover:text-ink transition-colors">←</span>
          <LogoMark size={26} />
          <Wordmark className="text-[1.05rem]" />
        </Link>

        <div className="flex items-center gap-cp-3 flex-wrap justify-end">
          <span className="text-[0.85rem] text-ink-soft hidden sm:inline">
            {items.length} {items.length === 1 ? "recipe" : "recipes"}
          </span>
          <button onClick={() => window.print()} className="btn btn-primary btn-compact">
            <PrintIcon size={16} />
            Print
          </button>
        </div>
      </header>

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

          <div className="recipe-config-section">
            <label className="recipe-toggle">
              <input
                type="checkbox"
                checked={doubleSided}
                onChange={(event) => setDoubleSided(event.target.checked)}
              />
              <span>
                <strong>Double-sided cards</strong>
              </span>
            </label>
          </div>

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
              {RECIPE_PRINT_TEMPLATE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={`recipe-template-option recipe-template-option--${option.id} ${
                    template === option.id ? "is-active" : ""
                  }`}
                  aria-pressed={template === option.id}
                  aria-label={option.label}
                  onClick={() => setTemplate(option.id)}
                >
                  {option.id !== "classic" && (
                    <span className="recipe-template-option__premium" aria-label="Premium">
                      <CrownIcon size={12} />
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
              ))}
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
            data-double-sided={doubleSided ? "true" : "false"}
          >
            {items.map((item, index) => (
              <RecipeCardPrint
                key={item.id}
                recipe={item.recipe!}
                size={cardSize}
                template={template}
                doubleSided={doubleSided}
                isLast={index === items.length - 1}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
