# The project model — collections, documents, and how you get between them

**Status:** design note, nothing built. Written 2026-08-15 after a day of chasing
bugs that all turned out to be the same missing idea.

---

## The one-sentence problem

RecipePrinter has **documents** — saved, named, individually paid-for cookbooks —
but no **document model**: no create, no close, no sense of "which one am I in."
The recipe queue is doing double duty as both the source material and the
document, and everything below is a consequence of that.

## What that actually caused

Each of these was reported as its own bug. They are one bug.

| Symptom | Mechanism |
|---|---|
| Cleared the queue, added 5 new recipes, **the old cookbook was overwritten** | `projectId` is minted once and sticks (`lib/project.ts`, `normalizeProjectMeta`). Nothing mints a new one when the queue empties, so autosave wrote the new contents over the saved book. |
| **No way to make a second cookbook.** Anywhere. | The only cookbook entry point is the mode switch, and once `cookbookWelcomeCompleted` is set it returns you to the book you already have. A customer who wants to buy a second book *cannot*. |
| Switching out of a paid cookbook and back **asked for payment again** | Exiting minted a fresh `projectId`; `restoreCookbook` brings the book back under whatever id is current; the unlock is keyed to the old one. |
| Every curious flip of the switch **created a duplicate project** | Same fork, on unpaid books, once per click — feeding the pile `lib/duplicateProjects.ts` exists to sweep up. |
| Leaving a cookbook **feels like starting over** | The cookbook consumed the global queue, so there is nothing to go back to. |

The first three are fixed or mitigated as of 2026-08-15. The structural cause is not.

## The idea that's missing

Every product in this category separates two things RecipePrinter merges:

|  | Photo-book makers (Mixbook, Blurb, Shutterfly), Canva | RecipePrinter today |
| --- | --- | --- |
| **Source material** | a photo/upload library — persistent, reused across many projects | the recipe queue |
| **Projects** | books, calendars, cards — each a named document drawn from the library | …also the recipe queue |

A **collection** you accumulate. **Projects** that draw from it. One collection,
many projects, each independent.

### But don't copy them wholesale

Those products can put a project picker in front of everything because nobody
arrives at Mixbook by accident. RecipePrinter's funnel is *"paste a URL, get a
printable card in ten seconds"* and most traffic never wants a project at all.

The pattern that reconciles this is **deferred commitment** — Canva's actual
behaviour: you start working immediately, it autosaves as "Untitled," and it
appears in your projects afterwards. You never decide up front.

So: **a project becomes real at the moment it's worth keeping** — which here is
"make a cookbook," and not before.

## The model

- **Recipes** are a collection. Free, frictionless, no identity, no naming. What
  the home page is today.
- **A cookbook** is a document. It owns *its own copy* of the recipes it
  contains. Named by its cover title (already exists — no new concept). Saved,
  listed, purchasable, returnable.
- **Recipe cards** are not a document. They're printing the collection. (A card
  job can still be *saved* as a project — that already works — but it isn't the
  primary idea.)

The critical property: **a cookbook owning its recipes** is what makes editing
your collection safe. Clearing the queue can't touch a saved book, because the
book isn't the queue.

## Leaving a cookbook is navigation, not conversion

This is the piece that dissolves the toggle.

You don't "toggle out of" a Google Doc; you go back to Drive. Same here: you are
*in* a cookbook, and to do something else you go back to your recipes. No fork,
no stash, no confirm dialog, nothing starts over — because the collection was
never consumed.

Converting output types is a **creation act** everywhere in this category. Canva's
Resize & Magic Switch produces a **copy**; the original is untouched. Nobody
toggles. Our segmented control implied a symmetry that does not exist:

| Recipe cards | Cookbook |
| --- | --- |
| free | $19.99 |
| a print job (a verb) | a document you own (a noun) |
| no cover, chapters, TOC, layouts | all of it |

## The four states

| State | Home shows | Header shows | Notes |
| --- | --- | --- | --- |
| **Fresh visitor** | import panel + empty queue | nothing extra | Unchanged. Protect this — it's the funnel. |
| **Queue with recipes, no documents** | queue + Print + **Make a cookbook** | nothing extra | "Make a cookbook" is a create action, not a mode. |
| **Inside a cookbook** | — | the book's name + **My recipes** | Back is navigation. No toggle, no confirm. |
| **Returning, has documents** | queue + a "Your cookbooks" strip + **New cookbook** | — | Progressive disclosure: the strip appears only once there's something in it. |

## Create actions, and where they live

All creation lives with the library, never in a mode-switch slot:

- **Make a cookbook** — from the workspace, when you have recipes and no book yet.
- **New cookbook** — from the library. *This is the missing revenue path.*
- **New recipe cards from this book** — pre-populates a new card job from a
  book's recipes, so "print three cards for my sister" doesn't mean rebuilding a
  queue.

`/projects` is already the library. `loadPrintProject` already swaps the
workspace to a project's contents. The genuinely new parts are the create
actions and a "which document am I in" indicator.

## Decisions already made

- **A purchase buys a book slot you own and can rework**, not a frozen artifact.
  Emptying a paid book and refilling it stays paid. Simple to explain, generous
  in the right direction, and it removes the "is this abuse?" question. Needs
  saying out loud in the copy.
- **The mode switch should not exist.** Not "should be redesigned" — the mode is
  a property of the document, not a view of the workspace.
- **Same tab.** Opening the cookbook in a new tab was considered and rejected as
  the *mechanism*: `sessionStorage` is copied into a new tab, `localStorage`
  recovery mirrors are shared across all tabs, so two tabs means one project id,
  two autosave loops, and a shared last-writer-wins mirror — i.e. the conflict
  dialog, constantly. It's compensating for shared global state with tab
  isolation. Fix the state instead. (Worth revisiting as a *nicety* for "open
  from library" once contents are project-scoped.)

## Sequencing

**Cheap, mostly already built**
- "Make a cookbook" as a button rather than a segment
- Cover title shown as the document name
- "My recipes" back link
- A "Your cookbooks" strip on home, shown only when non-empty

**The real work**
- Project-scoped contents: a cookbook owns its recipes, so the collection and
  the document stop being the same object. This is the fix for the overwrite.

**Blocked on the above**
- Deleting the mode switch (it's currently the only cookbook entry point —
  removing it before the library exists strands everyone)

## Open questions

1. **Are recipe-card projects documents too?** They're already saveable and
   already appear in `/projects` as `kind: "printProject"`. Leaning no — keep the
   lifecycle for cookbooks, where it earns its keep.
2. **Where does the library live?** A strip on home, `/projects`, or both. The
   account dropdown already lists projects, so there are three surfaces doing
   fractions of this.
3. **What happens mid-purchase?** Someone hits Export, the paywall opens, they
   cancel. Presumably still "unpurchased" and fully reversible — but that state
   is where the two models meet and should be drawn out explicitly.
4. **Does `kind` flip?** While a book is stashed and you're printing cards, the
   document is a `printProject` carrying a `stashedCookbook`. Should it still
   appear under "Cookbooks" in the library? Probably yes — one document, and its
   identity shouldn't depend on which mode you left it in.

## Not in scope here

PDF export without the browser print dialog is a separate project — it needs
server-side rendering (headless Chromium self-hosted vs a hosted service) and
has its own data-reachability constraint, since signed-out purchases exist only
in the browser. See `docs/cookbook-unlock-webhook.md` for the purchase side.
