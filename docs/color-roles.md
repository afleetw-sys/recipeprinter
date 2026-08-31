# Blue or orange?

The palette has two accents, and the question "which one goes here?" has a
single answer that doesn't depend on taste. Source of truth for the values is
`:root` in `app/globals.css`; this file is the *rule*.

## The rule

**Cornflower is the system talking about itself. Clay is the product talking to
you.**

| | Cornflower (`--cp-accent`) | Clay (`--cp-accent-warm`) |
|---|---|---|
| Says | "here is where you are" | "here is something worth noticing" |
| Triggered by | the user's own action | a fact about the product |
| Frequency | constantly on screen | rare |
| Examples | selected, focused, active page, drag target, editable, hovered drop zone, links | new, free, owned, purchased, priced, being offered, and decorative art that reports nothing |

If a surface changes because someone clicked, dragged, or tabbed, it is
cornflower. If it would look the same to a user who never touched anything —
because it is describing what the product *is* or *costs* — it is clay.

Two tests for the edge cases:

- **Would it still be there on a screenshot with nothing selected?** Yes → clay.
- **Is it reporting a fact the user just created, or one we're telling them?**
  Created → cornflower. Told → clay.

Worked examples, all live in the product:

- The page rail's active thumbnail → **cornflower**. You put it there.
- The "premium" marker on a template tile → **clay**. It costs money whether
  you look at it or not.
- The "NEW" flag on the Cookbook tab → **clay**. We're announcing.
- A multi-select halo → **cornflower**. You cmd-clicked.
- The empty project cover art → **clay**. Decoration, reporting nothing.
- The free-template banner and the protect bar → **clay**. Both are us telling
  you something about the product.
- `.status-badge--success` → **cornflower**. "That worked" is the system
  reporting on your action, not a product announcement.

Neither accent is ever the answer for a *primary action*. Those are ink
(`.btn-primary`) — a filled dark button — in both voices' territory, because
"the main thing to do here" is a third thing and always has been. Error is its
own true red (`--cp-error`), deliberately not a deepened clay: a failure must
not speak in the accent's voice.

## Picking the right variable

There are **five colours and white**. No darkened siblings, no tints invented
per component — everything below is one of those or a `color-mix` of them.

| Painting | Cornflower | Clay |
|---|---|---|
| A border, a rule, an icon | `--cp-accent` | `--cp-accent-warm` |
| A low-alpha wash behind something | `--cp-accent-soft` | `--cp-accent-warm-soft` |
| A solid fill | `--cp-accent` | `--cp-accent-warm` |
| Text sitting on that solid fill | `--cp-on-accent` | `--cp-on-accent-warm` (large text only) |
| Text on plain card or page | `--cp-accent` | — use `--cp-ink` |
| Text on a tint | `--cp-ink` | `--cp-ink` |

Two rules make that table work, and they replace what a set of darkened
siblings used to buy:

**The accents mark things; Slate says them.** Cornflower is a word only on
plain paper — 5.1:1 on card, 4.7:1 on page, but 4.4:1 the moment it sits on any
tint, so text on a tinted surface is `--cp-ink`. Clay is never a word on a
light ground at all: 3.7:1 clears the 3:1 that a border, a rule or an icon
answers to, and stops there.

**White on a filled accent depends on the size.** White on cornflower is 5.1:1
and works anywhere. White on clay is 3.7:1, which clears WCAG's 3:1 bar for
**large text** — 18.66px bold or 24px regular — but not the 4.5:1 that normal
text needs. So a big filled clay chip with white on it is correct and is what
`--cp-on-accent-warm` is for. A small one is not — with one
recorded exception.

**The one accepted exception.** The "NEW" flag beside the Cookbook tab is
solid clay with white on it at 9.9px, which is 3.72:1 against a 4.5:1
requirement. It is the only surface in the app that does not clear AA. That
was a deliberate call: the alternatives were an accessible tint, or growing the
flag past 18.66px so white-on-clay passes, and a 19px flag would out-shout the
12.8px tab it rides on. Every other word-carrying chip in the notice family —
Purchased, Free template, the protect bar — stays a tint with an ink word.
If you are auditing and find this, it is known; don't silently change it.

`--cp-on-accent` and `--cp-on-accent-warm` both resolve to the card. They are
two names rather than one because that size rule differs, and because naming
the pairing is what stops it being re-decided by hand — against the old brand
teal ink won at 1.95:1, against cornflower ink is 2.66:1 and white wins, and
the signed-in avatar spent a while on the wrong side of that flip.

The one colour that is not from the palette is `--cp-error`. The palette has no
red, and a failure must not speak in the accent's voice — so it is a genuine
sixth value rather than a shade of an existing one.

## Fill or edge? (the selected-state question)

Cornflower marks a selection two different ways, and picking the wrong one is
what made the import switch look like two different controls:

| | Treatment | Use for |
|---|---|---|
| **Tile** | `--cp-selected-fill` tint + accent border + accent-ink label | picking one object out of a grid — a photo, a size, a template, a page in the rail's sibling controls |
| **Toggle** | card ground + accent border + accent-ink label, **no fill** | a segmented row where one of several faces is chosen — `<ButtonToggle>` |

The distinction is what the thing *is*. A tile is an object and the tint is the
paper under it. A segmented row is one control with several faces, and tinting a
face makes it read as a different KIND of button from the two beside it rather
than as the same button, chosen.

Anything that looks like a row of equal buttons should be `<ButtonToggle>`
(components/ButtonToggle.tsx) rather than a hand-rolled set. The one deliberate
exception is `<SegmentedControl>`, the Recipe cards / Cookbook pair in the
workspace bar: that is document-kind navigation with a sliding thumb, not an
option picker.

Note the fill in the tile row is the *warm* half — see "the mark is cool, the
paper under it is warm" in globals.css. A tile's border and label are still
cornflower.

## The printed card is blue only

`--recipe-*` is a separate namespace and a separate decision: it belongs to a
card template, not to the app. The Classic card uses two shades of the dark
blue — `#3f6094` for printed labels, section titles and step badges, `#22303a`
for the header bar's far end and the photo mat. The header bar is a gradient
between those two, and a bar that ran blue to orange read as a second piece of
artwork competing with the recipe rather than as the card's top edge.

The one exception is the **ingredient bullets**, which are clay
(`--recipe-bullet`, split out from `--recipe-accent-2` so it can move
independently of the bar). They are small repeated marks down a column rather
than a band across the top, and warming them is what stops an all-blue card
reading cold.

Nothing else in this file governs what comes out of the printer — `--recipe-*`
belongs to a card template, not to the app.

## Relationship to the logo

The mark is the same two families: its dark navy sits next to `--cp-ink`, its
mid blue next to `--cp-accent`, and its pepper next to `--cp-accent-warm`. The
UI was matched to the logo rather than the other way round, so if the logo's
palette moves, these tokens are what move with it.

## This file is enforced

`npm run audit:design-system` (part of `npm run verify`, so it runs in CI)
fails the build on:

1. **Any colour literal outside `:root`** — not just the palette values. The
   rule is "no new colours", and checking only the known five let a *new* one
   through: a darkened clay is not a palette value, so it matched nothing.
   `@media print` is exempt and has to be, since it forces white paper and
   near-black ink that must not follow the screen palette.
2. **Clay used as a word.** Allowed only where the selector is an `svg`, which
   is the one case that is provably a glyph rather than text.
3. **Cornflower used as a word on a tinted surface**, where it is 4.4:1.
4. **Text on a filled accent that isn't the matching on-accent token.**

Each rule was checked by introducing the violation and confirming the audit
catches it, so none of them is a check that can only pass.

## When you're adding a surface

Ask the question at the top. If you genuinely can't tell, it is almost always
cornflower — the notice family is small and closed (new / free / owned /
purchased / priced / offered), and everything else in a tool is state.
