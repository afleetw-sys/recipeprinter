# SEO landing pages: intent-aware shared system

## Decision

RecipePrinter uses one visual system and one composable SEO-page template. Search intent changes emphasis, section order, capture mode, copy, and proof—not typography or decorative styling.

The earlier proposal for separate `capture-first` and `guide-first` visual identities was rejected. RecipePrinter does not have enough product or brand differentiation between those queries to justify making the pages look like different sites. Differences must help a visitor complete the task or understand the product.

## Principles

1. Every page answers one search intent without padding or keyword repetition.
2. Every visual proves a nearby claim. Real output and product UI take priority over decoration.
3. The hero always gives the product image equal weight with the copy.
4. All pages share typography, spacing, FAQ treatment, feature rows, navigation, and interaction patterns.
5. A section appears only when it adds information needed for that query.
6. Cannibalization is a page-level problem, not a sentence-level one. It means
   shipping two pages that compete for one query (`/print-recipe-from-url`
   beside `/print-recipe-from-website`), and the fix is to not build the second
   page. It does NOT mean a claim, a photograph, or an FAQ may appear only
   once across the site. Visitors arrive on one page from search and never see
   the others, so a page must make its own complete case: if a point or an
   image is the best available proof for what this page argues, it belongs
   here whether or not another page also uses it. Withholding the strongest
   argument to keep the set tidy only weakens the page someone actually
   landed on. Repetition still has to be avoided WITHIN a page, where a reader
   really does meet both copies.
7. SEO-page capture stays lightweight and hands the committed payload into the app; the full workspace is not embedded.
8. Recipe text and images never appear in query strings and pending imports remain consume-and-delete.

## Intent behavior

The existing `layout` values remain as entry-strategy names for now; they are not separate visual templates.

### `capture-first`

For a visitor who already has a recipe and wants an immediate result.

- Equal-priority copy and real-output image in the hero.
- Intent-tuned URL, text, or image capture appears in the hero.
- How-To, feature proof, examples, FAQ, and related pages follow.
- Default for `Utility SEO`.

### `guide-first`

For a visitor researching a larger workflow such as organizing recipes or making a family cookbook.

- The same equal-priority hero and visual system.
- The hero uses a CTA instead of an input so it can explain the broader outcome first.
- How-To and feature sections explain the multi-recipe workflow.
- Lightweight capture appears after that explanation.
- Examples, FAQ, and related pages use the same components as utility pages.
- Default for organization and preservation/gift intent; individual pages may override it.

## Shared page inventory

1. Breadcrumb, visible and represented in JSON-LD.
2. Hero with H1, lede, appropriate action, and real-output or product visual. Do not add an eyebrow when the heading already supplies the context.
3. Optional short introduction when it adds a distinct idea.
4. How-To steps and matching HowTo JSON-LD when the query is procedural.
5. Two or three substantive feature sections targeting distinct secondary questions.
6. Guide-first capture section when capture is not already in the hero.
7. Real printed examples when available; never fabricate proof.
8. FAQ using the shared card treatment and FAQPage JSON-LD.
9. Genuinely related internal links.

The generic boxed repeat-CTA banner is removed. A page should not repeat an action merely to satisfy a template checklist.

## Content targets

Aim for roughly 600–800 useful words on a content-rich leaf page, but do not pad pages to reach a count. Suggested ranges are an introduction of 20–30 words, How-To steps totaling roughly 100–150 words, two or three feature sections totaling roughly 200–300 words, and concise FAQs that answer actual follow-up questions.

## Navigation

- Use a two-level breadcrumb for ordinary leaves.
- Build a three-level breadcrumb only when a real hub exists.
- Build `/social-recipes` because it has a coherent category and five children.
- Evaluate a family-cookbooks hub after its leaf content is complete; do not create it solely for symmetry.
- Do not create print-recipe or organize-recipe hubs that would cannibalize stronger pages.
- Derive related links and footer groups from shared page data once grouping is finalized.

## Rollout

### Phase 0: prototype and approve

- `/print-recipe-from-website`: representative capture-first page.
- `/family-recipe-book`: representative guide-first page.
- Approve shared hero, image priority, capture placement, section rhythm, FAQ, mobile behavior, and handoff.

### Phase 1: content and architecture

- Apply the approved system to the other 14 pages.
- Author query-specific How-To and feature content without forcing identical section counts.
- Build the social-recipes hub.
- Decide on the family-cookbooks hub using demand and cannibalization evidence.
- Replace hand-authored related rows with scoped groups.
- Expand footer navigation only after groups are stable.

### Phase 2: optional expansion

- Title-tag testing.
- Additional long-tail leaves supported by real demand.
- Localization and hreflang when translated content exists.
- More real product screenshots and printed-output photographs.

## Verification

- All SEO pages statically generate and type-check.
- URL, text, and image handoffs land in the app already importing.
- Pending imports are deleted after consumption and do not replay on refresh.
- Breadcrumb, FAQ, and How-To structured data validate.
- Hero copy and image retain equal priority at desktop widths and stack cleanly on mobile.
- No layout shift from images or proof components.
- Internal links resolve and do not create keyword cannibalization.
