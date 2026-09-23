import { describe, expect, test } from "vitest";
import { IMAGE_IMPORT_LIMIT_TRIGGER, PRO_BENEFITS, proUpgradeCopy } from "@/lib/proUpgradeCopy";

describe("proUpgradeCopy", () => {
  test("Add more recipes names multi-recipe printing and leads with it", () => {
    const copy = proUpgradeCopy(["multi_recipe"], "add_more_recipes");
    expect(copy.title).toBe("Print multiple recipes at once");
    expect(copy.benefits[0]).toBe("Print multiple recipes at once");
    expect(copy.ctaLabel).toBe("Unlock Pro and continue");
  });

  test("a locked 4×6 card size names 4×6 cards and leads with them", () => {
    const copy = proUpgradeCopy(["card_size"], "print_button");
    expect(copy.title).toBe("Print 4×6 recipe cards");
    expect(copy.benefits[0]).toBe("4×6 recipe cards");
    expect(copy.ctaLabel).toBe("Unlock Pro and print");
  });

  test("a locked premium theme names the theme and leads with it", () => {
    const copy = proUpgradeCopy(["theme"], "print_button");
    expect(copy.title).toBe("Print with this premium theme");
    expect(copy.benefits).toEqual([
      "All premium themes",
      "Print multiple recipes at once",
      "4×6 recipe cards",
      "30 photo imports an hour",
      "20% off your first cookbook",
    ]);
  });

  test("several locks share one title and lead with each triggered benefit", () => {
    const copy = proUpgradeCopy(["card_size", "multi_recipe"], "print_button");
    expect(copy.title).toBe("Unlock your Pro print setup");
    expect(copy.benefits).toEqual([
      "Print multiple recipes at once",
      "4×6 recipe cards",
      "All premium themes",
      "30 photo imports an hour",
      "20% off your first cookbook",
    ]);
  });

  test("every variant keeps exactly the same benefits", () => {
    for (const reasons of [[], ["theme"], ["card_size"], ["multi_recipe"], ["theme", "card_size", "multi_recipe"]] as const) {
      expect([...proUpgradeCopy([...reasons], "print_button").benefits].sort()).toEqual([...PRO_BENEFITS].sort());
    }
  });

  test("the header Upgrade button gets the generic copy, even with a lock in effect", () => {
    for (const reasons of [[], ["theme"], ["theme", "card_size"]] as const) {
      expect(proUpgradeCopy([...reasons], "topbar_button")).toEqual({
        title: "Upgrade to RecipePrinter Pro",
        benefits: PRO_BENEFITS,
        ctaLabel: "Unlock Pro",
      });
    }
  });

  test("hitting the photo limit names the Pro allowance and leads with it", () => {
    const copy = proUpgradeCopy([], IMAGE_IMPORT_LIMIT_TRIGGER);
    expect(copy.title).toBe("Import up to 30 photos an hour");
    expect(copy.benefits[0]).toBe("30 photo imports an hour");
    expect([...copy.benefits].sort()).toEqual([...PRO_BENEFITS].sort());
  });
});
