import type { Recipe } from "@/types/recipe";

// Step badge — the teal circle with number from CookPilot's Steps section
function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-teal-50 text-teal-500 font-semibold text-sm flex items-center justify-center leading-none select-none">
      {n}
    </span>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-cream-500 font-medium uppercase tracking-wide">{label}</dt>
      <dd className="text-sm font-semibold text-charcoal-700">{value}</dd>
    </div>
  );
}

export default function RecipeView({ recipe }: { recipe: Recipe }) {
  const hasTimes = recipe.prepTime || recipe.cookTime || recipe.totalTime;
  const hasServings = recipe.servings || recipe.yield;

  return (
    <article>
      {/* Hero card — matches CookPilot's large recipe detail card */}
      <div className="card mb-6 overflow-hidden print-full">
        <div className="p-8 print-avoid-break">
          {/* Cuisine / course tag */}
          {(recipe.cuisine || recipe.course) && (
            <div className="tag-pill mb-4 w-fit">
              {[recipe.course, recipe.cuisine].filter(Boolean).join(" · ")}
            </div>
          )}

          {/* Title — large bold sans-serif matching CookPilot; switches to serif for print */}
          <h1 className="text-4xl sm:text-5xl font-bold text-charcoal-700 leading-tight tracking-tight mb-5 print:font-serif">
            {recipe.title}
          </h1>

          {recipe.description && (
            <p className="text-cream-600 text-sm leading-relaxed mb-6 max-w-prose">
              {recipe.description}
            </p>
          )}

          {/* Time / servings meta row — matches CookPilot's meta layout */}
          {(hasTimes || hasServings) && (
            <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-5 border-t border-cream-200">
              {recipe.prepTime  && <MetaItem label="Prep"   value={recipe.prepTime} />}
              {recipe.cookTime  && <MetaItem label="Cook"   value={recipe.cookTime} />}
              {recipe.totalTime && <MetaItem label="Total"  value={recipe.totalTime} />}
              {(recipe.servings || recipe.yield) && (
                <MetaItem label="Serves" value={String(recipe.servings ?? recipe.yield)} />
              )}
            </dl>
          )}
        </div>

        {/* Hero image — full width, no padding, matches CookPilot card image style */}
        {recipe.image && (
          <div className="no-print w-full aspect-[16/7] bg-cream-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={recipe.image}
              alt={recipe.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Ingredients + Steps — two-panel layout matching CookPilot's detail page */}
      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">

        {/* Ingredients card */}
        <div className="card p-6 print-avoid-break print-full">
          <h2 className="section-label mb-4">Ingredients</h2>

          <ul className="space-y-2.5">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm leading-snug print-avoid-break">
                {/* Checkbox circle — matches CookPilot's ingredient checkbox */}
                <span className="mt-0.5 w-4 h-4 rounded-full border border-cream-300 flex-shrink-0" />
                <span className="text-charcoal-700">
                  {ing.raw ? (
                    ing.raw
                  ) : (
                    <>
                      {ing.amount && (
                        <span className="font-semibold">
                          {ing.amount}{ing.unit ? ` ${ing.unit}` : ""}{" "}
                        </span>
                      )}
                      {ing.name}
                      {ing.note && <span className="text-cream-500">, {ing.note}</span>}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* Steps card */}
        <div className="card p-6 print-full">
          <h2 className="section-label mb-5">Steps</h2>

          <ol className="space-y-5">
            {recipe.instructions.map((step) => (
              <li key={step.step} className="flex items-start gap-3 print-avoid-break">
                <StepBadge n={step.step} />
                <p className="text-charcoal-700 text-sm leading-relaxed pt-0.5">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* Source + print attribution */}
      <div className="mt-6 text-xs text-cream-500 flex items-center justify-between no-print">
        <span>
          Recipe from{" "}
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-500 hover:text-teal-600 transition-colors"
          >
            {recipe.sourceName ?? (() => {
              try { return new URL(recipe.sourceUrl).hostname.replace("www.", ""); }
              catch { return recipe.sourceUrl; }
            })()}
          </a>
        </span>
      </div>

      {/* Print-only attribution footer */}
      <div className="print-attribution hidden" aria-hidden>
        Printed with RecipePrinter · recipeprinter.com · Original:{" "}
        {recipe.sourceUrl}
      </div>
    </article>
  );
}
