import { describe, expect, it } from "vitest";
import { planCardExport } from "./cardExport";
import { PREMIUM_TEMPLATE_ENTITLEMENTS } from "@/lib/premiumTemplates";
import { RECIPEPRINTER_PRO_ENTITLEMENT_ID } from "@/lib/proProduct";

// A download is a print the browser can't stop, so the server has to refuse
// what the print page refuses: a premium theme, the 4×6 size and more than one
// recipe all need Pro, and only Pro drops the branding. Whatever the request
// says, the caller's own entitlements decide.

// A theme once sold on its own, so a legacy purchase of it can be tested too.
const [premium, premiumEntitlement] = Object.entries(PREMIUM_TEMPLATE_ENTITLEMENTS)[0];
const recipe = (id: string) => ({ id, recipe: { title: id, ingredients: [], instructions: [] } });
const request = (settings: Record<string, unknown>, count = 1) => ({
  output: "pdf",
  // A request that claims to hide the branding is ignored.
  brandHidden: true,
  project: { settings, sections: [{ id: "s", items: Array.from({ length: count }, (_, i) => recipe(`r${i}`)) }] },
});
const locks = (body: unknown, entitlements: string[]) => {
  const plan = planCardExport(body, entitlements);
  return plan.ok ? [] : plan.kind === "locked" ? plan.reasons : ["invalid"];
};

describe("planCardExport", () => {
  it("refuses each Pro lock to a free account, lifts them all for Pro, and only Pro drops the branding", () => {
    const free: string[] = [];
    const pro = [RECIPEPRINTER_PRO_ENTITLEMENT_ID];

    expect(locks(request({ template: premium }), free)).toEqual(["theme"]);
    expect(locks(request({ cardSize: "card-6x4" }), free)).toEqual(["card_size"]);
    expect(locks(request({}, 2), free)).toEqual(["multi_recipe"]);
    expect(locks(request({ fontScale: 1.2 }), free)).toEqual(["font_size"]);
    // Normal, or anything that isn't a step, is no lock: it prints at Normal.
    expect(locks(request({ fontScale: 1 }), free)).toEqual([]);
    expect(locks(request({ fontScale: 7 }), free)).toEqual([]);
    expect(locks(request({ template: premium, cardSize: "card-6x4", fontScale: 0.85 }, 3), pro)).toEqual([]);
    const sized = planCardExport(request({ fontScale: 1.1 }), pro);
    expect(sized.ok && sized.payload.project.settings.fontScale).toBe(1.1);

    // A legacy theme purchase unlocks that theme and nothing else.
    const themeOwner = [premiumEntitlement];
    expect(locks(request({ template: premium }), themeOwner)).toEqual([]);
    expect(locks(request({ template: premium, cardSize: "card-6x4" }), themeOwner)).toEqual(["card_size"]);

    const freePlan = planCardExport(request({}), free);
    const proPlan = planCardExport(request({}), pro);
    expect(freePlan.ok && freePlan.payload.brandHidden).toBe(false);
    expect(proPlan.ok && proPlan.payload.brandHidden).toBe(true);
  });
});
