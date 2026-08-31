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

## The printed card is blue only

`--recipe-*` is a separate namespace and a separate decision: it belongs to a
card template, not to the app. The Classic card uses two shades of the dark
blue — `#3f6094` for printed labels, section titles and step badges, `#22303a`
for the header bar's far end, the photo mat and the dots — and no clay at all.
The header bar is a gradient between those two, and a bar that ran blue to
orange read as a second piece of artwork competing with the recipe rather than
as the card's top edge.

So clay's whole job is on screen. Nothing in this file governs what comes out
of the printer.

## Relationship to the logo

The mark is the same two families: its dark navy sits next to `--cp-ink`, its
mid blue next to `--cp-accent`, and its pepper next to `--cp-accent-warm`. The
UI was matched to the logo rather than the other way round, so if the logo's
palette moves, these tokens are what move with it.

## When you're adding a surface

Ask the question at the top. If you genuinely can't tell, it is almost always
cornflower — the notice family is small and closed (new / free / owned /
purchased / priced / offered), and everything else in a tool is state.
