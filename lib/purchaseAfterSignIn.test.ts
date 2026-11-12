// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { markAuthRedirectPending } from "./authRedirect";
import { rememberProUpgradeIntent, takeProUpgradeIntent } from "./proUpgradeIntent";
import {
  purchaseReturnPath,
  rememberCookbookPurchaseAfterSignIn,
  takeCookbookPurchaseAfterSignIn,
} from "./purchaseAfterSignIn";

/**
 * A purchase that stops for sign-in carries on after it, on the page it
 * started from.
 *
 * Buyers signed out on a phone were asked to sign in before buying a cookbook
 * or Pro, and came back from Google or Apple on the homepage: the book filed
 * away, the purchase forgotten, and the whole thing to find and start again
 * (Amelia, 2026-11-12). A cookbook's Buy & download recorded nothing at all, so
 * even back on /print the purchase never resumed.
 *
 * The rule, for both purchases: the load a sign-in redirect returns to is sent
 * back to the page the purchase left from, and that page resumes the purchase
 * once.
 */

function goTo(url: string) {
  window.history.replaceState(null, "", url);
}

const purchases = [
  {
    name: "cookbook",
    from: "/print",
    start: () => rememberCookbookPurchaseAfterSignIn("book-1"),
    resume: () => takeCookbookPurchaseAfterSignIn("book-1"),
  },
  {
    name: "Pro",
    from: "/print?project=p-7",
    start: () => rememberProUpgradeIntent("print_button", "annual"),
    resume: () => takeProUpgradeIntent()?.cycle === "annual",
  },
] as const;

afterEach(() => {
  window.sessionStorage.clear();
  goTo("/");
});

describe("purchase after sign-in", () => {
  test.each(purchases)("$name: back to where it started, and resumed once", ({ from, start, resume }) => {
    // A popup or email-code sign-in never leaves the page, so a visit home
    // while one is open is just a visit home.
    goTo(from);
    start();
    goTo("/");
    expect(purchaseReturnPath()).toBeNull();

    goTo(from);
    start();
    // Signing in on a phone leaves the page...
    markAuthRedirectPending();
    // ...and comes back somewhere else.
    goTo("/");
    expect(purchaseReturnPath()).toBe(from);

    // Back where it started, there is nowhere further to go, and the purchase
    // picks up, once.
    goTo(from);
    expect(purchaseReturnPath()).toBeNull();
    expect(resume()).toBe(true);
    expect(resume()).toBe(false);

    // Spent, so a later trip home stays home.
    goTo("/");
    expect(purchaseReturnPath()).toBeNull();
  });
});
