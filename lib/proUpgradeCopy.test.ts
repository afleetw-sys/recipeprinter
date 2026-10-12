import { describe, expect, test } from "vitest";
import { IMAGE_IMPORT_LIMIT_TRIGGER, PRO_BENEFITS, proUpgradeCopy } from "@/lib/proUpgradeCopy";
import type { ProLockReason } from "@/lib/recipePrinterPurchases";

// Which pitch the dialog makes, not its words: copy changes freely.
const REASONS: ProLockReason[] = ["multi_recipe", "card_size", "theme"];
const generic = proUpgradeCopy([], "topbar_button");
const lead = (reason: ProLockReason) => proUpgradeCopy([reason], "print_button").benefits[0];

describe("proUpgradeCopy", () => {
  test("a single lock gets its own title and leads with its own benefit", () => {
    const titles = REASONS.map((reason) => proUpgradeCopy([reason], "print_button").title);
    const leads = REASONS.map(lead);
    expect(new Set(titles).size).toBe(REASONS.length);
    expect(titles).not.toContain(generic.title);
    expect(new Set(leads).size).toBe(REASONS.length);
    // Add more recipes is the multi-recipe lock, whatever else is locked.
    expect(proUpgradeCopy(["multi_recipe"], "add_more_recipes").benefits[0]).toBe(lead("multi_recipe"));
  });

  test("several locks lead with each triggered benefit", () => {
    const copy = proUpgradeCopy(["card_size", "multi_recipe"], "print_button");
    expect(new Set(copy.benefits.slice(0, 2))).toEqual(new Set([lead("card_size"), lead("multi_recipe")]));
  });

  test("every variant keeps exactly the same benefits", () => {
    for (const reasons of [[], ["theme"], ["card_size"], ["multi_recipe"], ["theme", "card_size", "multi_recipe"]] as const) {
      expect([...proUpgradeCopy([...reasons], "print_button").benefits].sort()).toEqual([...PRO_BENEFITS].sort());
    }
  });

  test("the header Upgrade button gets the generic copy, even with a lock in effect", () => {
    for (const reasons of [["theme"], ["theme", "card_size"]] as const) {
      expect(proUpgradeCopy([...reasons], "topbar_button")).toEqual(generic);
    }
  });

  test("hitting the hourly photo limit gets its own title, and the hourly number is no listed benefit", () => {
    const copy = proUpgradeCopy([], IMAGE_IMPORT_LIMIT_TRIGGER);
    expect(copy.title).not.toBe(generic.title);
    expect(copy.benefits).toEqual(PRO_BENEFITS);
    expect(PRO_BENEFITS.some((benefit) => /an hour/.test(benefit))).toBe(false);
  });
});
