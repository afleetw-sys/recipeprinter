"use client";

import { memo, useMemo, type ReactNode } from "react";
import { RecipeCardFace, type RecipePrintTemplate } from "@/components/RecipeCardPrint";
import type { PageSheet } from "@/lib/usePrintSheets";
import { pairCardsOnLetter, type TwoUpCard } from "@/lib/twoUpPages";
import { fontScaleVars, type FontScale } from "@/lib/fontScale";
import { ElementPageProvider, pageAddressForSlot, type PageLooks } from "@/lib/pageLooks";
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
  pageLooks,
}: {
  sheets: PageSheet[];
  template: RecipePrintTemplate;
  showDescription: boolean;
  /** Cut lines, and the bleed past them (see `Slot`): the two come together,
      since with no line to cut along the colour's own edge is the guide. */
  showCutLines: boolean;
  /** Same flag the deck carries: some themes draw a back's art the other
      way round when it prints behind its front. */
  doubleSided: boolean;
  fontScale?: FontScale;
  photoScale?: PhotoScale;
  pageLooks?: PageLooks;
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
                <Slot key={half} filled={Boolean(card)} bleed={showCutLines}>
                  {card && (
                    <ElementPageProvider page={pageAddressForSlot(card.slot)} looks={pageLooks}>
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
                </Slot>
              ))}
            </div>,
            page.hasBack ? (
              <div
                key={`back-${pageIndex}-${key}`}
                className={`rp-twoup__page rp-twoup__page--back ${isLast ? "rp-twoup__page--last" : ""}`}
              >
                {page.cards.map((card, half) => (
                  <Slot key={half} filled={Boolean(card?.slot.back)} bleed={showCutLines}>
                    {card && (
                      <ElementPageProvider page={pageAddressForSlot(card.slot)} looks={pageLooks}>
                        <BackFace card={card} template={template} />
                      </ElementPageProvider>
                    )}
                  </Slot>
                ))}
              </div>
            ) : null,
          ];
        })}
      </div>
    </div>
  );
});

/**
 * One half of the sheet, with a 1/8in bleed round a filled one.
 *
 * A duplex printer puts the back a millimetre or so off the front, so a cut
 * along the front's line lands a little off the back's edge. With the colour
 * stopping at the line, that showed as a white sliver down the back. Past each
 * edge the face is drawn again, mirrored about that edge and clipped to 1/8in:
 * what lies just outside the cut is what lies just inside it, so a stripe, a
 * band or a frame carries straight on, and a cut a little off still lands in
 * the face's own edge. Text never reaches the strip: every theme pads its
 * card well over 1/8in. The corners, too small to matter, take a copy scaled
 * up behind the card.
 *
 * Only with cut lines on. Without them the colour's own edge is what gets cut
 * along, so it has to stop at the card's edge as it always did.
 */
const BLEED_SIDES = ["top", "right", "bottom", "left"] as const;

function Slot({ filled, bleed, children }: { filled: boolean; bleed: boolean; children: ReactNode }) {
  return (
    <div className={`rp-twoup__slot ${filled ? "rp-twoup__slot--filled" : ""}`}>
      {filled && bleed && (
        <>
          <div className="rp-twoup__bleed rp-twoup__bleed--corners">{children}</div>
          {BLEED_SIDES.map((side) => (
            <div key={side} className={`rp-twoup__bleed rp-twoup__bleed--${side}`}>
              <div className="rp-twoup__mirror">{children}</div>
            </div>
          ))}
          <div className="rp-twoup__mat" />
        </>
      )}
      {children}
    </div>
  );
}

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
