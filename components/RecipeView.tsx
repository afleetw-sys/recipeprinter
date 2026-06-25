import type { Recipe } from "@/types/recipe";

function TimeItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-recipe-section text-parchment-500 uppercase tracking-widest">{label}</dt>
      <dd className="text-parchment-950 font-medium text-sm">{value}</dd>
    </div>
  );
}

export default function RecipeView({ recipe }: { recipe: Recipe }) {
  const hasTimes = recipe.prepTime || recipe.cookTime || recipe.totalTime;
  const hasServings = recipe.servings || recipe.yield;

  return (
    <article className="recipe-body print-full font-sans">
      {/* Title block */}
      <header className="mb-8 print-avoid-break">
        {(recipe.cuisine || recipe.course) && (
          <p className="text-recipe-section text-forest-600 uppercase tracking-widest mb-3">
            {[recipe.course, recipe.cuisine].filter(Boolean).join(" · ")}
          </p>
        )}

        <h1 className="font-serif text-recipe-title text-parchment-950 mb-4 leading-tight">
          {recipe.title}
        </h1>

        {recipe.description && (
          <p className="text-parchment-600 text-base leading-relaxed max-w-prose mb-5">
            {recipe.description}
          </p>
        )}

        {/* Meta row */}
        {(hasTimes || hasServings) && (
          <dl className="flex flex-wrap gap-x-8 gap-y-3 pt-5 border-t border-parchment-200">
            {recipe.prepTime && <TimeItem label="Prep" value={recipe.prepTime} />}
            {recipe.cookTime && <TimeItem label="Cook" value={recipe.cookTime} />}
            {recipe.totalTime && <TimeItem label="Total" value={recipe.totalTime} />}
            {(recipe.servings || recipe.yield) && (
              <TimeItem label="Serves" value={String(recipe.servings ?? recipe.yield)} />
            )}
          </dl>
        )}
      </header>

      {/* Hero image */}
      {recipe.image && (
        <div className="no-print mb-8 rounded-xl overflow-hidden aspect-[16/7] bg-parchment-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={recipe.image}
            alt={recipe.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-10">
        {/* Ingredients */}
        <section className="print-avoid-break">
          <h2 className="text-recipe-section text-parchment-500 uppercase tracking-widest mb-4">
            Ingredients
          </h2>
          <ul className="space-y-2.5">
            {recipe.ingredients.map((ing, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm leading-snug">
                <span className="w-1.5 h-1.5 rounded-full bg-forest-400 flex-shrink-0 mt-1.5" />
                <span>
                  {ing.raw ? (
                    ing.raw
                  ) : (
                    <>
                      {ing.amount && (
                        <span className="font-semibold text-parchment-950">
                          {ing.amount}
                          {ing.unit ? ` ${ing.unit}` : ""}{" "}
                        </span>
                      )}
                      <span className="text-parchment-800">{ing.name}</span>
                      {ing.note && (
                        <span className="text-parchment-500">, {ing.note}</span>
                      )}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Instructions */}
        <section>
          <h2 className="text-recipe-section text-parchment-500 uppercase tracking-widest mb-4">
            Instructions
          </h2>
          <ol className="space-y-6">
            {recipe.instructions.map((step) => (
              <li key={step.step} className="flex gap-4 print-avoid-break">
                <span className="font-serif font-bold text-2xl text-parchment-200 leading-none flex-shrink-0 w-8 text-right select-none">
                  {step.step}
                </span>
                <p className="text-parchment-800 text-sm leading-relaxed pt-0.5">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {/* Source attribution */}
      <div className="print-footer mt-12 pt-6 border-t border-parchment-200">
        <p className="text-xs text-parchment-400">
          Recipe from{" "}
          <a
            href={recipe.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-forest-600 hover:underline"
          >
            {recipe.sourceName ?? new URL(recipe.sourceUrl).hostname.replace("www.", "")}
          </a>
        </p>
      </div>
    </article>
  );
}
