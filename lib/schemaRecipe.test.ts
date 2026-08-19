import { describe, expect, it } from "vitest";
import {
  jsonDataBlocksFromHtml,
  jsonLdBlocksFromHtml,
  recipeFromJsonLd,
} from "@/lib/schemaRecipe";

// The server-side half of URL import: pull structured data out of a page's HTML
// and turn it into a Recipe. What these tests pin down is the balance between
// finding real recipes wherever sites bury them, and not deep-walking a
// framework's entire serialized app state to conclude there is nothing there.

const RECIPE_NODE = {
  "@type": "Recipe",
  name: "Borscht",
  recipeIngredient: ["2 beets", "1 onion"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Simmer everything." }],
};

const script = (type: string, body: unknown) =>
  `<html><head><script type="${type}">${JSON.stringify(body)}</script></head><body></body></html>`;

/** Wraps `node` in `depth` levels of plain object nesting. */
function bury(node: unknown, depth: number): unknown {
  let out = node;
  for (let i = 0; i < depth; i++) out = { [`level${i}`]: out };
  return out;
}

describe("jsonLdBlocksFromHtml", () => {
  it("extracts a recipe from a plain JSON-LD block", () => {
    const [block] = jsonLdBlocksFromHtml(script("application/ld+json", RECIPE_NODE));
    const recipe = recipeFromJsonLd(block, "https://example.com/borscht");
    expect(recipe?.title).toBe("Borscht");
    expect(recipe?.ingredients).toHaveLength(2);
    expect(recipe?.instructions[0].text).toBe("Simmer everything.");
  });

  it("finds a recipe inside @graph", () => {
    const [block] = jsonLdBlocksFromHtml(
      script("application/ld+json", { "@context": "https://schema.org", "@graph": [{ "@type": "WebPage" }, RECIPE_NODE] }),
    );
    expect(recipeFromJsonLd(block, "https://example.com/x")?.title).toBe("Borscht");
  });

  it("tolerates an unquoted type attribute (Yoast)", () => {
    const html = `<script type=application/ld+json>${JSON.stringify(RECIPE_NODE)}</script>`;
    expect(recipeFromJsonLd(jsonLdBlocksFromHtml(html)[0], "https://example.com/x")?.title).toBe("Borscht");
  });

  it("rejects a partial recipe so the fuller parser gets a turn", () => {
    // Ingredients but no steps — returning this as-is would strand the cook with
    // half a recipe rather than falling through to CookPilot.
    const [block] = jsonLdBlocksFromHtml(
      script("application/ld+json", { "@type": "Recipe", name: "Half", recipeIngredient: ["2 beets"] }),
    );
    expect(recipeFromJsonLd(block, "https://example.com/x")).toBeNull();
  });
});

describe("findRecipeNode depth bound", () => {
  it("still finds a recipe nested well past typical markup", () => {
    const [block] = jsonLdBlocksFromHtml(script("application/ld+json", bury(RECIPE_NODE, 6)));
    expect(recipeFromJsonLd(block, "https://example.com/x")?.title).toBe("Borscht");
  });

  it("does not treat array elements as nesting levels", () => {
    // A 300-element list one level down must not exhaust the depth budget —
    // roundup pages and @graph blocks are exactly this shape.
    const list = Array.from({ length: 300 }, (_, i) => ({ "@type": "Thing", position: i }));
    const [block] = jsonLdBlocksFromHtml(
      script("application/ld+json", { items: [...list, bury(RECIPE_NODE, 4)] }),
    );
    expect(recipeFromJsonLd(block, "https://example.com/x")?.title).toBe("Borscht");
  });

  it("gives up on absurd nesting rather than walking forever", () => {
    const [block] = jsonLdBlocksFromHtml(script("application/ld+json", bury(RECIPE_NODE, 40)));
    expect(recipeFromJsonLd(block, "https://example.com/x")).toBeNull();
  });
});

describe("jsonDataBlocksFromHtml pre-filter", () => {
  it("skips an app-state blob that cannot hold a recipe", () => {
    const appState = { props: { pageProps: { cart: [], user: null, nav: ["home", "about"] } } };
    expect(jsonDataBlocksFromHtml(script("application/json", appState))).toEqual([]);
  });

  it("still parses an app-state blob that mentions a recipe", () => {
    const appState = { props: { pageProps: { data: RECIPE_NODE } } };
    const [block] = jsonDataBlocksFromHtml(script("application/json", appState));
    expect(recipeFromJsonLd(block, "https://example.com/x")?.title).toBe("Borscht");
  });

  it("passes a block through when the type name is entity-encoded", () => {
    // The filter looks for the bare word, not `"@type":"Recipe"`, so escaped
    // markup still reaches the real parser instead of being dropped here.
    const html = `<script type="application/json">{&quot;@type&quot;:&quot;Recipe&quot;,&quot;name&quot;:&quot;Borscht&quot;,&quot;recipeIngredient&quot;:[&quot;2 beets&quot;],&quot;recipeInstructions&quot;:[{&quot;text&quot;:&quot;Simmer.&quot;}]}</script>`;
    const [block] = jsonDataBlocksFromHtml(html);
    expect(recipeFromJsonLd(block, "https://example.com/x")?.title).toBe("Borscht");
  });
});
