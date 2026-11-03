"use client";

import { memo, useMemo } from "react";
import { RecipeCardFace, type RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { PageSheet } from "@/lib/usePrintSheets";
import { pairCardsOnLetter, type TwoUpCard } from "@/lib/twoUpPages";
import { fontScaleVars, type FontScale } from "@/lib/fontScale";
import { ElementPageProvider, pageAddressForSlot, type ElementStyles } from "@/lib/elementStyles";
import { photoScaleVars, type PhotoScale } from "@/lib/photoScale";

/**
 * What prints when 4x6 cards go two to a Letter sheet (see lib/twoUpPages.ts).
 *
 * The deck stays one card per page on screen, where it is edited; this is a
 * second drawing of the same cards that only paper ever sees. In print the
 * deck is switched off and these pages take its place (print.css, "Two 4x6
 * cards on a Letter sheet").
 *
 * On screen it is laid out off-screen rather than `display: none`, so every
 * card has a real box: a card's two-column split is measured from its own
 * width, and a card first laid out inside the print snapshot never gets
 * measured at all (see `revealPreviewHidden` in lib/measureHeights.ts).
 */
export const TwoUpPrintPages = memo(function TwoUpPrintPages({
  sheets,
  template,
  showDescription,
  showCutLines,
  doubleSided,
  fontScale,
  photoScale,
  elementStyles,
}: {
  sheets: PageSheet[];
  template: RecipePrintTemplate;
  showDescription: boolean;
  showCutLines: boolean;
  /** Same flag the deck carries: some themes draw a back's art the other
      way round when it prints behind its front. */
  doubleSided: boolean;
  fontScale?: FontScale;
  photoScale?: PhotoScale;
  elementStyles?: ElementStyles;
}) {
  const pages = useMemo(() => pairCardsOnLetter(sheets), [sheets]);
  if (pages.length === 0) return null;

  // The last piece of paper, front or back, asks for no break after itself,
  // or the print grows a blank trailing sheet (same as `--no-break` in
  // ScaledPage).
  const lastIndex = pages.length - 1;

  return (
    <div
      className={`rp-twoup recipe-print-preview recipe-print-preview--card-6x4 ${
        showCutLines ? "recipe-print-preview--cut-lines" : ""
      }`}
      style={{ ...fontScaleVars(fontScale), ...photoScaleVars(photoScale) }}
      data-double-sided={doubleSided ? "true" : "false"}
      aria-hidden
    >
      <div className={`recipe-card-set recipe-card-set--card-6x4 recipe-template--${template}`}>
        {pages.map((page, pageIndex) => {
          const isLast = pageIndex === lastIndex;
          const key = page.cards[0]?.slot.recipeId ?? pageIndex;
          return [
            <div
              key={`front-${pageIndex}-${key}`}
              className={`rp-twoup__page rp-twoup__page--front ${
                isLast && !page.hasBack ? "rp-twoup__page--last" : ""
              }`}
            >
              {page.cards.map((card, half) => (
                <div key={half} className={`rp-twoup__slot ${card ? "rp-twoup__slot--filled" : ""}`}>
                  {card && (
                    <ElementPageProvider page={pageAddressForSlot(card.slot)} styles={elementStyles}>
                    <RecipeCardFace
                      recipe={card.slot.recipe}
                      ingredients={card.slot.front.ingredients}
                      instructions={card.slot.front.instructions}
                      side="front"
                      showHeader={!card.slot.isContinuation}
                      layout={card.slot.front.layout}
                      contentScale={card.slot.front.contentScale}
                      titleFit={card.slot.front.titleFit}
                      hasBackFace={card.slot.hasBack}
                      showImage={card.slot.showPhoto}
                      photoPlaceholder
                      photoOnFacingPage={card.slot.hidePhoto}
                      showSourceUrl={card.slot.showSourceUrl}
                      showDescription={showDescription}
                      continued={card.slot.isContinuation}
                      template={template}
                      recipeIndex={card.slot.styleIndex ?? card.slot.queueIndex}
                    />
                    </ElementPageProvider>
                  )}
                </div>
              ))}
            </div>,
            page.hasBack ? (
              <div
                key={`back-${pageIndex}-${key}`}
                className={`rp-twoup__page rp-twoup__page--back ${isLast ? "rp-twoup__page--last" : ""}`}
              >
                {page.cards.map((card, half) => (
                  <div
                    key={half}
                    className={`rp-twoup__slot ${card?.slot.back ? "rp-twoup__slot--filled" : ""}`}
                  >
                    {card && (
                      <ElementPageProvider page={pageAddressForSlot(card.slot)} styles={elementStyles}>
                        <BackFace card={card} template={template} />
                      </ElementPageProvider>
                    )}
                  </div>
                ))}
              </div>
            ) : null,
          ];
        })}
      </div>
    </div>
  );
});

/** A card's back, or nothing: an empty half prints as plain paper, which is
    what the single-card print's white duplex spacer is too. */
function BackFace({ card, template }: { card: TwoUpCard; template: RecipePrintTemplate }) {
  const back = card.slot.back;
  if (!back) return null;
  return (
    <RecipeCardFace
      recipe={card.slot.recipe}
      ingredients={back.ingredients}
      instructions={back.instructions}
      side="back"
      showHeader={false}
      layout={back.layout}
      contentScale={back.contentScale}
      titleFit={back.titleFit}
      hasBackFace={card.slot.hasBack}
      template={template}
      recipeIndex={card.slot.styleIndex ?? card.slot.queueIndex}
      continued
    />
  );
}
