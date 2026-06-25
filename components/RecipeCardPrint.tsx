import type { Recipe } from "@/types/recipe";

// The default printable output: a beautiful 6in × 4in recipe card (classic
// index-card proportions). Compact serif title, two columns, hairline accents.
// On screen each card renders at the same physical size as a preview.

function sourceLabel(recipe: Recipe): string | null {
  if (recipe.sourceName) return recipe.sourceName;
  if (recipe.sourceUrl) {
    try {
      return new URL(recipe.sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      return recipe.sourceUrl;
    }
  }
  return null;
}

function metaBits(recipe: Recipe): string[] {
  const bits: string[] = [];
  const time = recipe.totalTime || recipe.cookTime || recipe.prepTime;
  if (time) bits.push(time);
  const serves = recipe.servings ?? recipe.yield;
  if (serves) bits.push(`Serves ${serves}`);
  return bits;
}

function ingredientText(ing: Recipe["ingredients"][number]): string {
  if (ing.raw) return ing.raw;
  const amount = [ing.amount, ing.unit].filter(Boolean).join(" ");
  return [amount, ing.name].filter(Boolean).join(" ") + (ing.note ? `, ${ing.note}` : "");
}

export default function RecipeCardPrint({ recipe }: { recipe: Recipe }) {
  const source = sourceLabel(recipe);
  const meta = metaBits(recipe);

  return (
    <article className="recipe-card">
      <div className="recipe-card__accent" aria-hidden />

      <header className="recipe-card__header">
        <h1 className="recipe-card__title">{recipe.title}</h1>
        {(meta.length > 0 || source) && (
          <p className="recipe-card__meta">
            {meta.join("  ·  ")}
            {meta.length > 0 && source ? "  ·  " : ""}
            {source && <span className="recipe-card__source">{source}</span>}
          </p>
        )}
      </header>

      <div className="recipe-card__cols">
        <section className="recipe-card__ingredients">
          <h2 className="recipe-card__label">Ingredients</h2>
          <ul>
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>{ingredientText(ing)}</li>
            ))}
          </ul>
        </section>

        <section className="recipe-card__method">
          <h2 className="recipe-card__label">Method</h2>
          <ol>
            {recipe.instructions.map((step) => (
              <li key={step.step}>{step.text}</li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="recipe-card__footer">
        <span>Printed with RecipePrinter</span>
        {recipe.sourceUrl && <span className="recipe-card__footer-src">{recipe.sourceUrl}</span>}
      </footer>
    </article>
  );
}
