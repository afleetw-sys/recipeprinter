import Link from "next/link";
import { MoveToSectionIcon, PlusIcon, PrintIcon } from "@/components/icons";
import { LandingSection } from "@/components/seo/LandingFrame";

const flexiblePoints = [
  { title: "Start with one", body: "Print a recipe now. Your binder does not need to be finished first.", Icon: PrintIcon },
  { title: "Add more later", body: "Print new favorites as you find them, and replace recipes you have updated.", Icon: PlusIcon },
  { title: "Rearrange anytime", body: "Move recipes between sections whenever the way you cook changes.", Icon: MoveToSectionIcon },
];

const categories = ["Breakfast", "Main dishes", "Sides", "Soups & salads", "Baking", "Desserts"];

export function RecipeBinderSections() {
  return (
    <div className="flex flex-col gap-[56px] lg:gap-[72px]">
      <LandingSection
        id="binder-flexibility-heading"
        heading="A recipe collection that can keep growing"
        lede="Print one recipe now, add another later, and keep changing your binder over time."
      >
        <div className="grid gap-cp-4 sm:grid-cols-3">
          {flexiblePoints.map((point) => (
            <div key={point.title} className="rounded-2xl border border-line bg-card p-cp-5">
              <span aria-hidden="true" className="mb-cp-4 grid h-10 w-10 place-items-center rounded-xl bg-[var(--cp-accent-warm-soft)]">
                <point.Icon size={22} className="stroke-[var(--cp-accent-warm)]" />
              </span>
              <h3 className="text-cp-body-lg font-extrabold leading-snug tracking-[-0.02em]">{point.title}</h3>
              <p className="mt-cp-3 text-cp-body text-ink-soft leading-relaxed">{point.body}</p>
            </div>
          ))}
        </div>
      </LandingSection>

      <LandingSection
        id="binder-organization-heading"
        heading="Organize it however you like"
        lede="Use physical tab dividers and simple categories, then move recipes around as your collection grows."
      >
        <div className="flex flex-wrap gap-cp-2">
          {categories.map((category) => (
            <span key={category} className="rounded-full border border-line bg-card px-cp-4 py-cp-2 text-cp-body font-bold text-ink">
              {category}
            </span>
          ))}
        </div>
      </LandingSection>

      <aside className="rounded-2xl border border-line bg-card p-cp-5" aria-labelledby="binder-cookbook-heading">
        <h2 id="binder-cookbook-heading" className="text-cp-body-lg font-extrabold tracking-[-0.02em]">
          Make your binder feel more finished
        </h2>
        <p className="mt-cp-3 text-cp-body text-ink-soft leading-relaxed">
          Use the{" "}
          <Link href="/family-recipe-book" className="font-bold text-ink hover:underline">
            cookbook builder
          </Link>{" "}
          to add section pages, a table of contents, and page numbers, then print the finished
          collection for your binder.
        </p>
      </aside>
    </div>
  );
}
