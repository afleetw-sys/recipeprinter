# Blue or orange?

The palette has two accents plus two reserved semantics, and "which one goes
here?" has a single answer that doesn't depend on taste. Source of truth for
the values is `:root` in `app/globals.css`; this file is the *rule*.

## The rule

**Cornflower acts. Clay informs.**

The split is INTERACTIVITY, which is how most design systems draw it and is the
version you can actually check: ask whether you click the thing.

| | Cornflower `--cp-accent` | Clay `--cp-accent-warm` |
|---|---|---|
| Is for | things you **act on** | things that **tell you something** |
| Test | clicking it does something | you read it and move on |
| Examples | buttons, links, selection, focus, drag targets, editable fields | tags and banners — new, free, priced, protected — and decorative art |

A button inside a clay banner is still cornflower. The banner is the message;
the button is the thing you press. Getting that backwards is what made the
protect bar's action read as part of the notice rather than as the way out of
it.

## The two reserved semantics

Some meanings the five-colour palette simply doesn't carry. Those get their own
colour rather than borrowing an accent, and each means exactly one thing:

| Token | Colour | Means |
|---|---|---|
| `--cp-error` | a true red | something failed |
| `--cp-premium` | gold | this costs money |

This is the normal shape in mature systems — Primer reserves a distinct hue for
"attention" and another for "done"; Polaris badges take a status tone rather
than the brand colour. A badge is the one place a colour should mean exactly
one thing, so premium is gold and nothing else in the product is.

Putting the premium marker on clay broke that: "costs money" and "is new"
became the same colour a few pixels apart.

## And a settled state is neutral

**Owned. Purchased.** You already have it; there is nothing to buy and nothing
to notice. That is the absence of anything to do, so it gets the absence of a
colour — ink on a plain neutral. It also has to be told apart at a glance from
the gold premium badge on the same grid, which colouring both of them warm
defeated.

If you only remember one line: **cornflower for what you press, clay for what
you're told, gold for what costs money, red for what broke, neutral for what's
already settled.**

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
