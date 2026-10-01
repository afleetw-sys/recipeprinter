# Print checklist

The browser tests (`e2e/print-*.spec.ts`) pin everything a headless browser can
see: that every card prints laid out exactly as its preview, front and back, in
Chromium and WebKit; that the card's print box fits its sheet and its cut line;
that Chromium's PDF has one sheet per card face; that Print calls
`window.print()` inside the click.

What they can't see is a real print dialog and real paper. Playwright cannot
print from WebKit, so Safari's own page splitting never runs under test, and no
headless browser has a printer with margins. Every bug in this list reached
customers on 2026-10-01 through exactly that gap. Run this by hand before
shipping any change to `app/print/print.css`, the print button, or the deck.

## Set up

A deck of at least eight recipes, so some cards start off-screen:

- one recipe long enough to continue on the back of its card,
- one with ingredient and step sections (Buckeyes, say),
- a recipe photo on at least one card.

Leave the deck at the top. Don't scroll to the far cards before printing.

## Run

For **Safari** and **Chrome** on a Mac, with a real printer selected (not
"Save as PDF", whose margins are zero):

| Card size | Orientation in the print dialog | Two-sided (ours) |
|-----------|----------------------------------|------------------|
| 4x6       | Landscape                        | off              |
| 4x6       | Landscape                        | on               |
| 4x6       | Portrait                         | off              |
| Letter    | Portrait                         | on               |

## Check

- **One click.** The print dialog opens from the first click on Print, in
  Safari with no "this webpage is trying to print" alert.
- **Spinner.** Print shows a spinner until the dialog is on screen, not for a
  fixed second.
- **Sheet count.** One sheet per card face, so two per card with two-sided on.
  No blank sheets, and no sheet holding only a sliver of a card's bottom edge.
- **Layout.** Every card, including the ones you never scrolled to, matches its
  preview: ingredients beside the steps, steps directly under their heading,
  backs in two columns where the preview shows two.
- **Edges.** All four dashed cut lines print. The Classic theme's top accent bar
  is clean, with no dash over it.
- **Second print.** Print again without reloading. It comes out identical to
  the first.

## Known printers

- **Brother HL-L3220CDW, 4x6 landscape:** prints only about 5.5 × 3.2 in of
  the sheet, losing about 0.57 in at the bottom. The Safari print box is sized
  for this (see the "PRINTABLE area" rule in `app/print/print.css`). A
  printer with larger margins than this is the first thing to suspect if
  Safari cards start spilling onto extra sheets again.
