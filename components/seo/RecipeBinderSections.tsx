import Link from "next/link";
import { MoveToSectionIcon, PlusIcon, PrintIcon } from "@/components/icons";
import { LandingSection } from "@/components/seo/LandingFrame";

const flexiblePoints = [
  { title: "Start with one", body: "Start with one recipe you already make often. Print it as a full page and add it to your binder.", Icon: PrintIcon },
  { title: "Add more later", body: "Print new favorites as you find them and replace older pages when you update a recipe.", Icon: PlusIcon },
  { title: "Rearrange anytime", body: "Move recipes between sections whenever your categories or cooking habits change.", Icon: MoveToSectionIcon },
];

const categories = ["Breakfast", "Main dishes", "Sides", "Soups & salads", "Baking", "Desserts"];

export function RecipeBinderSections() {
  return (
    <div className="flex flex-col gap-[56px] lg:gap-[72px]">
      <LandingSection
        id="binder-flexibility-heading"
        heading="Build your recipe binder a few recipes at a time"
        lede="You do not need to finish your whole binder at once. Print the recipes you already use, add new favorites as you find them, and reorganize the binder whenever your collection changes."
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
        heading="Choose simple recipe binder categories"
        lede="Start with broad categories that match how you cook, then use tab dividers to keep recipes easy to find. You can always split a section later as your binder grows."
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
          Add section pages and a table of contents
        </h2>
        <p className="mt-cp-3 text-cp-body text-ink-soft leading-relaxed">
          If you want a more finished binder, the{" "}
          <Link href="/family-recipe-book" className="font-bold text-ink hover:underline">
            cookbook builder
          </Link>{" "}
          can add section pages, a table of contents, and page numbers before you print the
          collection. The cookbook builder is a separate one-off purchase.
        </p>
      </aside>
    </div>
  );
}
