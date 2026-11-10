import { MoveToSectionIcon, PlusIcon, PrintIcon } from "@/components/icons";
import { LandingSection } from "@/components/seo/LandingFrame";

const flexiblePoints = [
  { title: "Start small", body: "Begin with the recipes you already make often. The binder doesn't have to be finished before you print it.", Icon: PrintIcon },
  { title: "Add more later", body: "Add new favorites to the same binder as you find them, then print just the new pages.", Icon: PlusIcon },
  { title: "Rearrange anytime", body: "Move recipes between sections whenever your cooking changes, and the table of contents and page numbers follow.", Icon: MoveToSectionIcon },
];

const categories = ["Breakfast", "Main dishes", "Sides", "Soups & salads", "Baking", "Desserts"];

export function RecipeBinderSections() {
  return (
    <div className="flex flex-col gap-[56px] lg:gap-[72px]">
      <LandingSection
        id="binder-organization-heading"
        heading="Choose simple recipe binder sections"
        lede="Start with broad sections that match how you cook. Each one opens on its own page in the binder, so it works like a tab divider, and the table of contents lists every recipe under it. You can split a section later as the binder grows."
      >
        <div className="flex flex-wrap gap-cp-2">
          {categories.map((category) => (
            <span key={category} className="rounded-full border border-line bg-card px-cp-4 py-cp-2 text-cp-body font-bold text-ink">
              {category}
            </span>
          ))}
        </div>
      </LandingSection>

      <LandingSection
        id="binder-flexibility-heading"
        heading="Build your recipe binder a few recipes at a time"
        lede="It's one binder you keep adding to, not a file you make once and start over."
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
    </div>
  );
}
