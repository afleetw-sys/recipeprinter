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

Each accent is three values, and which one you want depends on what you're
painting, not on how it looks:

| Painting | Cornflower | Clay |
|---|---|---|
| A border, a rule, a tint at full strength | `--cp-accent` | `--cp-accent-warm` |
| A low-alpha wash behind something | `--cp-accent-soft` | `--cp-accent-warm-soft` |
| Text or a glyph a person reads | `--cp-accent-ink` | `--cp-accent-warm-ink` |
| A **solid fill** with text on it | `--cp-accent` | `--cp-accent-warm-ink` |
| Text sitting on that solid fill | `--cp-on-accent` | `--cp-on-accent-warm` |

The one asymmetry is worth knowing rather than rediscovering: a solid clay chip
fills with `--cp-accent-warm-ink`, *not* `--cp-accent-warm`. Clay #c96a4c behind
white text is 3.7:1 and behind our ink 3.6:1 — it fails AA both ways, so it can
never be a text background at UI sizes. `--cp-accent-warm-ink` is the same hue
run darker (both sit at ~16-17° hue), reads unmistakably orange, and carries
white at 6.25:1. Cornflower has no such problem (5.08:1 with white), so its base
value fills directly, which is the whole reason the two accents are used
differently rather than symmetrically.

Clay itself — the exact #c96a4c from the palette — is what you see on every
tint, border and rule. It is only the *solid small chip* that has to darken, and
only because 10px bold text needs 4.5:1.

Every pairing in the table clears WCAG AA on every surface in the set, including
each ink on its own `-soft` tint, which is the pairing the whole notice family
uses. That was checked by measuring the rendered DOM, not by eye.

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
fails the build on the three ways this has actually been broken:

1. **A palette colour written as a literal** anywhere but `:root` — a copy that
   stops following the token.
2. **`--cp-accent` or `--cp-accent-warm` used as text.** Both are fills and
   borders; text reads from the `-ink` sibling.
3. **Text on a filled accent that isn't the on-accent token.** The right answer
   flips when the accent changes — against the old teal, ink won at 1.95:1;
   against cornflower, ink is 2.66:1 and white wins — which is exactly how the
   signed-in avatar became the least legible text in the app.

Each rule was checked by introducing the violation and confirming the audit
catches it, so none of them is a check that can only pass.

## When you're adding a surface

Ask the question at the top. If you genuinely can't tell, it is almost always
cornflower — the notice family is small and closed (new / free / owned /
purchased / priced / offered), and everything else in a tool is state.
