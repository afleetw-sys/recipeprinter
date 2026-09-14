import { describe, expect, test } from "vitest";
import type { CustomerInfo } from "@revenuecat/purchases-js";
import {
  activeProLockReasons,
  canUseCardSize,
  computeProLocks,
  describeProLockReasons,
  hasMultiRecipeEntitlement,
  hasProEntitlement,
  hasTemplateEntitlement,
  hasTemplateOrProEntitlement,
  proSubscriptionDetails,
} from "./recipePrinterPurchases";
import { synthesizeCustomerInfoFromMirror } from "./proAccessFallback";

/**
 * A minimal `CustomerInfo` stand-in: every function under test only ever
 * reads `.entitlements.active`/`.entitlements.all`, keyed by entitlement id.
 * Building real SDK objects would require configuring the RevenueCat client,
 * which is exactly what these pure functions exist to be tested without.
 */
function customerWith(
  active: Record<string, { productIdentifier?: string; expirationDate?: Date | null; willRenew?: boolean; isActive?: boolean }>,
): CustomerInfo {
  const entitlements = Object.fromEntries(
    Object.entries(active).map(([id, info]) => [
      id,
      {
        identifier: id,
        isActive: info.isActive ?? true,
        willRenew: info.willRenew ?? true,
        productIdentifier: info.productIdentifier ?? id,
        expirationDate: info.expirationDate ?? null,
      },
    ]),
  );
  return {
    entitlements: { active: entitlements, all: entitlements },
  } as unknown as CustomerInfo;
}

const NO_ENTITLEMENTS = customerWith({});

describe("hasTemplateEntitlement / hasProEntitlement", () => {
  test("a legacy template owner is recognized by that entitlement alone", () => {
    const owner = customerWith({ template_heirloom: {} });
    expect(hasTemplateEntitlement(owner, "heirloom")).toBe(true);
    expect(hasTemplateEntitlement(owner, "bistro")).toBe(false);
    expect(hasProEntitlement(owner)).toBe(false);
  });

  test("a Pro subscriber has no legacy template entitlement", () => {
    const pro = customerWith({ pro: {} });
    expect(hasProEntitlement(pro)).toBe(true);
    expect(hasTemplateEntitlement(pro, "heirloom")).toBe(false);
  });

  test("null customerInfo (never purchased) owns nothing", () => {
    expect(hasProEntitlement(null)).toBe(false);
    expect(hasTemplateEntitlement(null, "heirloom")).toBe(false);
  });
});

describe("hasTemplateOrProEntitlement", () => {
  test("a free theme is never locked, with or without any entitlement", () => {
    expect(hasTemplateOrProEntitlement(null, "classic")).toBe(true);
    expect(hasTemplateOrProEntitlement(NO_ENTITLEMENTS, "pantry")).toBe(true);
  });

  test("a legacy owner unlocks only the specific theme they bought", () => {
    const owner = customerWith({ template_heirloom: {} });
    expect(hasTemplateOrProEntitlement(owner, "heirloom")).toBe(true);
    expect(hasTemplateOrProEntitlement(owner, "bistro")).toBe(false);
  });

  test("Pro unlocks every premium theme", () => {
    const pro = customerWith({ pro: {} });
    expect(hasTemplateOrProEntitlement(pro, "heirloom")).toBe(true);
    expect(hasTemplateOrProEntitlement(pro, "bistro")).toBe(true);
    expect(hasTemplateOrProEntitlement(pro, "keepsake")).toBe(true);
  });

  test("a brand-new free user is locked out of every premium theme", () => {
    expect(hasTemplateOrProEntitlement(NO_ENTITLEMENTS, "heirloom")).toBe(false);
  });
});

describe("canUseCardSize", () => {
  test("the free 'letter' size is always allowed, regardless of entitlement", () => {
    expect(canUseCardSize(null, "letter")).toBe(true);
    expect(canUseCardSize(NO_ENTITLEMENTS, "letter")).toBe(true);
  });

  test("a brand-new free user cannot use card-6x4", () => {
    expect(canUseCardSize(NO_ENTITLEMENTS, "card-6x4")).toBe(false);
    expect(canUseCardSize(null, "card-6x4")).toBe(false);
  });

  test("Pro unlocks card-6x4", () => {
    const pro = customerWith({ pro: {} });
    expect(canUseCardSize(pro, "card-6x4")).toBe(true);
  });

  test("a legacy theme owner does NOT get card-6x4 — owning a theme was never a card-size purchase", () => {
    // This used to be a "grandfather" exception (a legacy owner kept 4x6
    // access with a free or owned theme, since 4x6 itself was once free).
    // That exception is gone: 4x6 is Pro-only for everyone now, no matter
    // which theme is selected or owned.
    const owner = customerWith({ template_heirloom: {} });
    expect(canUseCardSize(owner, "card-6x4")).toBe(false);
  });
});

describe("hasMultiRecipeEntitlement", () => {
  test("a free user cannot print multiple recipes at once", () => {
    expect(hasMultiRecipeEntitlement(null)).toBe(false);
    expect(hasMultiRecipeEntitlement(NO_ENTITLEMENTS)).toBe(false);
  });

  test("Pro can", () => {
    expect(hasMultiRecipeEntitlement(customerWith({ pro: {} }))).toBe(true);
  });

  test("a legacy theme owner cannot — a template purchase never included this", () => {
    expect(hasMultiRecipeEntitlement(customerWith({ template_heirloom: {} }))).toBe(false);
  });

  test("a cookbook purchase (as RevenueCat sees it) does not grant it either", () => {
    expect(hasMultiRecipeEntitlement(customerWith({ cookbook: {} }))).toBe(false);
  });
});

/**
 * Cookbook ownership is deliberately absent from every function above: it is
 * a separate, per-project system (lib/cookbookUnlocks.ts, backed by a
 * Firestore doc per project) rather than an account-wide RevenueCat
 * entitlement these functions read. But RevenueCat itself DOES record a
 * "cookbook" entitlement on the customer who bought one (the same checkout
 * flow as everything else here) — so it's worth proving directly that this
 * file's Pro/theme/card-size/multi-recipe checks never key off it, in either
 * direction. A prior bug (the deleted "account-wide cookbook entitlement
 * bridge") was exactly this mistake: treating the presence of a `cookbook`
 * RevenueCat entitlement as proof of owning some specific project.
 */
describe("access model — every ownership state stays distinct", () => {
  const freeUser = NO_ENTITLEMENTS;
  const monthlyPro = customerWith({ pro: { productIdentifier: "pro_monthly" } });
  const annualPro = customerWith({ pro: { productIdentifier: "pro_annual" } });
  const legacyOwner = customerWith({ template_heirloom: {} });
  const cookbookOwner = customerWith({ cookbook: {} });
  const legacyOwnerWithCookbook = customerWith({ template_heirloom: {}, cookbook: {} });
  const proWithLegacyAndCookbook = customerWith({ pro: {}, template_heirloom: {}, cookbook: {} });

  test("free: no theme, no card size beyond letter, no multi-recipe", () => {
    expect(hasProEntitlement(freeUser)).toBe(false);
    expect(hasTemplateOrProEntitlement(freeUser, "heirloom")).toBe(false);
    expect(canUseCardSize(freeUser, "letter")).toBe(true);
    expect(canUseCardSize(freeUser, "card-6x4")).toBe(false);
    expect(hasMultiRecipeEntitlement(freeUser)).toBe(false);
  });

  test("monthly and annual Pro grant identical access — billing cycle never changes what's unlocked", () => {
    for (const pro of [monthlyPro, annualPro]) {
      expect(hasProEntitlement(pro)).toBe(true);
      expect(hasTemplateOrProEntitlement(pro, "heirloom")).toBe(true);
      expect(hasTemplateOrProEntitlement(pro, "bistro")).toBe(true);
      expect(canUseCardSize(pro, "card-6x4")).toBe(true);
      expect(hasMultiRecipeEntitlement(pro)).toBe(true);
    }
  });

  test("legacy theme owner: only that one theme, nothing else Pro grants", () => {
    expect(hasProEntitlement(legacyOwner)).toBe(false);
    expect(hasTemplateOrProEntitlement(legacyOwner, "heirloom")).toBe(true);
    expect(hasTemplateOrProEntitlement(legacyOwner, "bistro")).toBe(false);
    expect(canUseCardSize(legacyOwner, "card-6x4")).toBe(false);
    expect(hasMultiRecipeEntitlement(legacyOwner)).toBe(false);
    // The one thing a legacy owner is explicitly guaranteed: their theme on
    // an otherwise free Full Page setup still just works.
    expect(canUseCardSize(legacyOwner, "letter")).toBe(true);
  });

  test("cookbook owner (per RevenueCat): grants nothing here — cookbook access is checked elsewhere, per project", () => {
    expect(hasProEntitlement(cookbookOwner)).toBe(false);
    expect(hasTemplateOrProEntitlement(cookbookOwner, "heirloom")).toBe(false);
    expect(canUseCardSize(cookbookOwner, "card-6x4")).toBe(false);
    expect(hasMultiRecipeEntitlement(cookbookOwner)).toBe(false);
  });

  test("legacy theme + cookbook: the two combine additively, never adding up to Pro", () => {
    expect(hasProEntitlement(legacyOwnerWithCookbook)).toBe(false);
    expect(hasTemplateOrProEntitlement(legacyOwnerWithCookbook, "heirloom")).toBe(true);
    expect(hasTemplateOrProEntitlement(legacyOwnerWithCookbook, "bistro")).toBe(false);
    expect(canUseCardSize(legacyOwnerWithCookbook, "card-6x4")).toBe(false);
    expect(hasMultiRecipeEntitlement(legacyOwnerWithCookbook)).toBe(false);
  });

  test("Pro + legacy + cookbook together: Pro alone accounts for everything Pro grants", () => {
    expect(hasProEntitlement(proWithLegacyAndCookbook)).toBe(true);
    expect(hasTemplateOrProEntitlement(proWithLegacyAndCookbook, "bistro")).toBe(true);
    expect(canUseCardSize(proWithLegacyAndCookbook, "card-6x4")).toBe(true);
    expect(hasMultiRecipeEntitlement(proWithLegacyAndCookbook)).toBe(true);
  });
});

describe("proSubscriptionDetails", () => {
  test("no entitlement at all reads as fully inactive", () => {
    expect(proSubscriptionDetails(null)).toEqual({
      cycle: null,
      active: false,
      willRenew: false,
      expiresAtMs: null,
    });
    expect(proSubscriptionDetails(NO_ENTITLEMENTS)).toEqual({
      cycle: null,
      active: false,
      willRenew: false,
      expiresAtMs: null,
    });
  });

  test("an active, renewing monthly subscriber", () => {
    const expires = new Date("2026-11-01T00:00:00Z");
    const info = customerWith({
      pro: { productIdentifier: "pro_monthly", expirationDate: expires, willRenew: true, isActive: true },
    });
    expect(proSubscriptionDetails(info)).toEqual({
      cycle: "monthly",
      active: true,
      willRenew: true,
      expiresAtMs: expires.getTime(),
    });
  });

  test("an annual subscriber who canceled stays active through the paid period", () => {
    const expires = new Date("2027-01-01T00:00:00Z");
    const info = customerWith({
      pro: { productIdentifier: "pro_annual", expirationDate: expires, willRenew: false, isActive: true },
    });
    const details = proSubscriptionDetails(info);
    expect(details.cycle).toBe("annual");
    expect(details.active).toBe(true);
    expect(details.willRenew).toBe(false);
    expect(details.expiresAtMs).toBe(expires.getTime());
  });
});

describe("computeProLocks — the print page's Pro-gate matrix", () => {
  const baseArgs = {
    cookbookMode: false,
    template: "classic" as const,
    selectedPremiumTemplate: null,
    cardSize: "card-6x4" as const,
    recipeCount: 1,
  };

  test("free user: card size locked, nothing owned", () => {
    const locks = computeProLocks({ ...baseArgs, customerInfo: NO_ENTITLEMENTS });
    expect(locks.cardSizeLocked).toBe(true);
    expect(locks.proLocked).toBe(true);
  });

  test("new monthly Pro purchase: nothing locked", () => {
    const info = customerWith({ pro: { productIdentifier: "pro_monthly" } });
    const locks = computeProLocks({ ...baseArgs, customerInfo: info });
    expect(locks.proLocked).toBe(false);
  });

  test("new annual Pro purchase: nothing locked, identical to monthly", () => {
    const info = customerWith({ pro: { productIdentifier: "pro_annual" } });
    const locks = computeProLocks({ ...baseArgs, customerInfo: info });
    expect(locks.proLocked).toBe(false);
  });

  test("a renewed subscription (willRenew: true, future expiry) is unlocked", () => {
    const info = customerWith({
      pro: { productIdentifier: "pro_monthly", willRenew: true, expirationDate: new Date(Date.now() + 1_000_000) },
    });
    expect(computeProLocks({ ...baseArgs, customerInfo: info }).proLocked).toBe(false);
  });

  test("canceled but still active through the paid period is unlocked — locks care about `active`, not `willRenew`", () => {
    const info = customerWith({
      pro: { productIdentifier: "pro_annual", willRenew: false, expirationDate: new Date(Date.now() + 1_000_000) },
    });
    expect(computeProLocks({ ...baseArgs, customerInfo: info }).proLocked).toBe(false);
  });

  test("an expired subscription is locked again", () => {
    // `customerWith` always puts whatever key it's given straight into
    // `entitlements.active` (matching how the real SDK only ever populates
    // `.active` with entitlements that ARE active) — so "expired" has to be
    // modeled via the mirror synthesizer, which does its own expiry check,
    // not by handing `customerWith` an inactive-but-present entry.
    const info = synthesizeCustomerInfoFromMirror(
      {
        pro: {
          active: true,
          expiresAtMs: Date.now() - 1_000_000,
          productIdentifier: "pro_monthly",
          willRenew: true,
        },
      },
      Date.now(),
    );
    expect(computeProLocks({ ...baseArgs, customerInfo: info }).proLocked).toBe(true);
  });

  test("restoring on a new device (a freshly-fetched live CustomerInfo for the same account) unlocks identically to the original device", () => {
    const originalDeviceInfo = customerWith({ pro: { productIdentifier: "pro_monthly" } });
    // A second device signing in gets its own fresh `CustomerInfo` object from
    // RevenueCat, not a copy of the first — same account, same entitlement
    // data, different object identity. Locks must not care about identity.
    const secondDeviceInfo = customerWith({ pro: { productIdentifier: "pro_monthly" } });
    expect(computeProLocks({ ...baseArgs, customerInfo: originalDeviceInfo }))
      .toEqual(computeProLocks({ ...baseArgs, customerInfo: secondDeviceInfo }));
  });

  test("a legacy $1.99 theme owner without Pro: their theme works, but 4x6 stays locked", () => {
    const owner = customerWith({ template_heirloom: {} });
    expect(
      computeProLocks({ ...baseArgs, customerInfo: owner, template: "heirloom", selectedPremiumTemplate: "heirloom" })
        .themeLocked,
    ).toBe(false);
    expect(computeProLocks({ ...baseArgs, customerInfo: owner }).cardSizeLocked).toBe(true);
  });

  test("a cookbook owner without Pro: cookbook ownership grants nothing here", () => {
    const owner = customerWith({ cookbook: {} });
    expect(computeProLocks({ ...baseArgs, customerInfo: owner }).proLocked).toBe(true);
  });

  test("a legacy theme owner who also has Pro: Pro accounts for everything, theme ownership is redundant but harmless", () => {
    const owner = customerWith({ template_heirloom: {}, pro: { productIdentifier: "pro_monthly" } });
    expect(computeProLocks({ ...baseArgs, customerInfo: owner }).proLocked).toBe(false);
  });

  test("cookbook mode exempts every lock regardless of entitlement", () => {
    const locks = computeProLocks({ ...baseArgs, customerInfo: NO_ENTITLEMENTS, cookbookMode: true, recipeCount: 5 });
    expect(locks.proLocked).toBe(false);
    expect(locks.multiRecipeLocked).toBe(false);
  });

  test("printing more than one recipe requires Pro; a single recipe never does", () => {
    const free = { ...baseArgs, customerInfo: NO_ENTITLEMENTS, template: "classic" as const, cardSize: "letter" as const };
    // The print JOB itself isn't locked with only one recipe in it...
    expect(computeProLocks({ ...free, recipeCount: 1 }).multiRecipeLocked).toBe(false);
    expect(computeProLocks({ ...free, recipeCount: 2 }).multiRecipeLocked).toBe(true);
    // ...but the NEXT add (recipe #2) is already known to be locked before
    // it's ever added — this is what drives the Add-more-recipes gate/badge.
    expect(computeProLocks({ ...free, recipeCount: 1 }).multiRecipeAddLocked).toBe(true);
    expect(computeProLocks({ ...free, recipeCount: 0 }).multiRecipeAddLocked).toBe(false);
  });

  test("a fallback CustomerInfo synthesized from the Firestore mirror unlocks identically to a live one showing the same entitlement", () => {
    const nowMs = Date.now();
    const liveInfo = customerWith({
      pro: { productIdentifier: "pro_monthly", expirationDate: new Date(nowMs + 1_000_000) },
    });
    const fallbackInfo = synthesizeCustomerInfoFromMirror(
      { pro: { active: true, expiresAtMs: nowMs + 1_000_000, productIdentifier: "pro_monthly", willRenew: true } },
      nowMs,
    );
    expect(computeProLocks({ ...baseArgs, customerInfo: liveInfo }))
      .toEqual(computeProLocks({ ...baseArgs, customerInfo: fallbackInfo }));
  });
});

describe("activeProLockReasons", () => {
  test("clicking Add more recipes always names multi-recipe alone, even if a theme and a card size are also locked", () => {
    expect(
      activeProLockReasons(
        { themeLocked: true, cardSizeLocked: true, multiRecipeLocked: false },
        "add_more_recipes",
      ),
    ).toEqual(["multi_recipe"]);
  });

  test("the print button reports every lock currently in effect, combined", () => {
    expect(
      activeProLockReasons(
        { themeLocked: true, cardSizeLocked: true, multiRecipeLocked: false },
        "print_button",
      ),
    ).toEqual(["theme", "card_size"]);
  });

  test("the print button reports a single reason plainly when only one applies", () => {
    expect(
      activeProLockReasons(
        { themeLocked: false, cardSizeLocked: true, multiRecipeLocked: false },
        "print_button",
      ),
    ).toEqual(["card_size"]);
  });

  test("the print button includes multi-recipe when the job already holds more than one", () => {
    expect(
      activeProLockReasons(
        { themeLocked: false, cardSizeLocked: false, multiRecipeLocked: true },
        "print_button",
      ),
    ).toEqual(["multi_recipe"]);
  });
});

describe("describeProLockReasons", () => {
  test("no reasons falls back to the generic pitch", () => {
    expect(describeProLockReasons([])).toBe("Unlock the full RecipePrinter Pro toolkit.");
  });

  test("a single theme lock", () => {
    expect(describeProLockReasons(["theme"])).toBe("This theme is part of RecipePrinter Pro.");
  });

  test("a single card-size lock uses plural agreement for its own noun phrase", () => {
    expect(describeProLockReasons(["card_size"])).toBe(
      "4×6 recipe cards are part of RecipePrinter Pro.",
    );
  });

  test("a single multi-recipe lock", () => {
    expect(describeProLockReasons(["multi_recipe"])).toBe(
      "Printing multiple recipes at once is part of RecipePrinter Pro.",
    );
  });

  test("two reasons are named explicitly, not summarized as 'a few things'", () => {
    expect(describeProLockReasons(["theme", "card_size"])).toBe(
      "This theme and 4×6 recipe cards are part of RecipePrinter Pro.",
    );
  });

  test("all three reasons are listed with a serial comma", () => {
    expect(describeProLockReasons(["theme", "card_size", "multi_recipe"])).toBe(
      "This theme, 4×6 recipe cards, and printing multiple recipes at once are part of RecipePrinter Pro.",
    );
  });

  test("a compound subject always takes 'are', even when every individual reason would take 'is' alone", () => {
    expect(describeProLockReasons(["theme", "multi_recipe"])).toBe(
      "This theme and printing multiple recipes at once are part of RecipePrinter Pro.",
    );
  });
});
