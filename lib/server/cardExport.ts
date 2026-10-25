import { entitlementForTemplate, isPremiumTemplate } from "@/lib/premiumTemplates";
import {
  isProOnlyCardSize,
  PRINT_CARD_SIZE_OPTIONS,
  RECIPE_PRINT_TEMPLATE_OPTIONS,
} from "@/lib/printTemplates";
import { RECIPEPRINTER_PRO_ENTITLEMENT_ID } from "@/lib/proProduct";
import type { ProLockReason } from "@/lib/recipePrinterPurchases";
import { DEFAULT_FONT_SCALE, normalizeFontScale } from "@/lib/fontScale";
import type { ExportOutput, ExportPayload } from "@/types/export";
import type { PrintCardSize, QueueItem, RecipePrintTemplate, Section } from "@/types/recipe";

/**
 * What `/api/card-export` will render, worked out from the request and from
 * what the caller owns.
 *
 * A download is the same thing as a print, so it sits behind the same three
 * Pro locks (`computeProLocks` in lib/recipePrinterPurchases): a premium
 * theme, the 4×6 size, and more than one recipe. The print page already
 * refuses those in the browser; this is the same answer where the browser
 * cannot change it. Cookbooks have their own paid export and are refused here.
 */

/** A deck this large is a book, and a book has its own export. */
export const MAX_CARD_EXPORT_RECIPES = 60;

const OUTPUTS: readonly ExportOutput[] = ["pdf", "png", "jpg"];

export type CardExportPlan =
  | { ok: true; payload: ExportPayload & { fileName: string } }
  | { ok: false; kind: "invalid"; error: string }
  | { ok: false; kind: "locked"; reasons: ProLockReason[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The recipes of a section and nothing a card doesn't draw. */
function cardSections(value: unknown): Section[] | null {
  if (!Array.isArray(value)) return null;
  const sections: Section[] = [];
  for (const section of value) {
    if (!isRecord(section) || !Array.isArray(section.items)) return null;
    const items = section.items.filter(
      (item): item is QueueItem => isRecord(item) && typeof item.id === "string" && isRecord(item.recipe),
    );
    sections.push({ id: typeof section.id === "string" ? section.id : "cards", title: "", items });
  }
  return sections;
}

function safeFileName(value: unknown, output: ExportOutput): string {
  const stem = (typeof value === "string" ? value : "")
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return `${stem || "Recipe-card"}.${output}`;
}

export function planCardExport(body: unknown, entitlements: readonly string[]): CardExportPlan {
  if (!isRecord(body) || !isRecord(body.project)) return { ok: false, kind: "invalid", error: "Malformed request." };
  const output = OUTPUTS.find((candidate) => candidate === body.output);
  if (!output) return { ok: false, kind: "invalid", error: "Unknown file format." };
  const { project } = body;
  const settings = isRecord(project.settings) ? project.settings : {};
  if (settings.cookbookMode || project.kind === "cookbook") {
    return { ok: false, kind: "invalid", error: "Cookbooks are downloaded from their own export." };
  }
  const sections = cardSections(project.sections);
  if (!sections) return { ok: false, kind: "invalid", error: "Malformed request." };
  const recipeCount = sections.reduce((count, section) => count + section.items.length, 0);
  if (recipeCount < 1) return { ok: false, kind: "invalid", error: "There are no recipes to download." };
  if (recipeCount > MAX_CARD_EXPORT_RECIPES) {
    return { ok: false, kind: "invalid", error: "That's too many recipes for one download." };
  }
  // Not `isPrintCardSize` / `isRecipePrintTemplate`: lib/printSettings is a
  // client module, and a route cannot call into one.
  const cardSize: PrintCardSize =
    PRINT_CARD_SIZE_OPTIONS.find((option) => option.id === settings.cardSize)?.id ?? "letter";
  const template: RecipePrintTemplate =
    RECIPE_PRINT_TEMPLATE_OPTIONS.find((option) => option.id === settings.template)?.id ?? "classic";

  const fontScale = normalizeFontScale(settings.fontScale);

  const pro = entitlements.includes(RECIPEPRINTER_PRO_ENTITLEMENT_ID);
  const ownsTheme = isPremiumTemplate(template) && entitlements.includes(entitlementForTemplate(template) ?? "");
  const reasons: ProLockReason[] = [];
  if (isPremiumTemplate(template) && !pro && !ownsTheme) reasons.push("theme");
  if (isProOnlyCardSize(cardSize) && !pro) reasons.push("card_size");
  if (fontScale !== DEFAULT_FONT_SCALE && !pro) reasons.push("font_size");
  if (recipeCount > 1 && !pro) reasons.push("multi_recipe");
  if (reasons.length > 0) return { ok: false, kind: "locked", reasons };

  return {
    ok: true,
    payload: {
      // Cards print on Letter at either size; a 4×6 sheet is two cards on one.
      preset: "us-letter",
      output,
      fileName: safeFileName(body.fileName, output),
      // The caller's own entitlement, never the request's word for it.
      brandHidden: pro,
      project: {
        id: "card-export",
        kind: "printProject",
        createdAt: 0,
        updatedAt: 0,
        sections,
        itemPlacements: isRecord(project.itemPlacements)
          ? (project.itemPlacements as ExportPayload["project"]["itemPlacements"])
          : undefined,
        settings: {
          cardSize,
          template,
          doubleSided: settings.doubleSided !== false,
          showPhoto: settings.showPhoto !== false,
          showSourceUrl: Boolean(settings.showSourceUrl),
          showDescription: settings.showDescription !== false,
          showCutLines: Boolean(settings.showCutLines),
          fontScale,
          cookbookMode: false,
        },
      },
    },
  };
}
