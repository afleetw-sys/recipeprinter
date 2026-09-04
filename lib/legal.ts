// ─────────────────────────────────────────────────────────────────────────
// The facts both legal documents are built from.
//
// Privacy and Terms restate the same handful of details — who "we" is, where
// to write to us, which law governs, when the document last changed. Keeping
// them here means the two pages can never disagree about them, and updating a
// contact address is one edit rather than a search across two long documents.
//
// The one thing that MUST stay honest is `LAST_UPDATED`. A policy claiming a
// date it wasn't reviewed on is worse than no date: it is the field a regulator
// or a subject-access request reads first. Bump it only when the text changes.
// ─────────────────────────────────────────────────────────────────────────

/**
 * The entity that publishes RecipePrinter and acts as data controller.
 *
 * The registered LLC name, not the brand. "Good Problem Studio" is how the
 * studio presents itself and is where the contact domain comes from, but a
 * contract has to name the party that legally exists, and that is the LLC.
 * Don't "correct" this to the studio name.
 */
export const LEGAL_ENTITY = "Good Problem LLC";

/**
 * Where to reach a person. One address for everything: privacy requests,
 * copyright complaints, and questions about the Terms. A small operation with
 * one real inbox should say so rather than invent a legal@ that forwards to the
 * same place — an address nobody monitors is the failure mode these clauses
 * exist to prevent.
 */
export const LEGAL_CONTACT_EMAIL = "recipeprinter@goodproblem.studio";

/**
 * Postal address, for the GDPR Article 13 controller-identity requirement and
 * for anyone who needs to serve something on paper.
 *
 * Null on purpose, and it stays that way. RecipePrinter is run by one person
 * from home, and the address on file is a home address: publishing it on a page
 * the whole internet can read is not a trade we are making. Both documents
 * render correctly without it and offer the address by email instead, which is
 * enough for a data subject or a copyright claimant to reach a real person.
 *
 * DO NOT fill this in with a home address. If a published address is ever
 * genuinely needed — selling to EU consumers at scale, or registering a DMCA
 * agent — the answer is a virtual business address or an LLC registered agent,
 * never the one someone lives at. Set that here and the line appears on both
 * documents at once.
 */
export const LEGAL_POSTAL_ADDRESS: string | null = null;

/** Governing law and the courts the Terms point disputes at. */
export const GOVERNING_LAW = {
  state: "Indiana",
  /** Named because "the courts of Indiana" is ambiguous between two systems. */
  venue: "the state and federal courts located in Marion County, Indiana",
} as const;

/**
 * Last substantive review of each document, ISO for the <time> element and
 * long-form for reading. These are separate because the two documents will not
 * change on the same day forever.
 */
export const PRIVACY_LAST_UPDATED = {
  iso: "2026-09-04",
  display: "September 4, 2026",
} as const;

export const TERMS_LAST_UPDATED = {
  iso: "2026-09-04",
  display: "September 4, 2026",
} as const;

/**
 * Every third party that receives personal data, and why.
 *
 * This list is the part of a privacy policy most likely to quietly go stale:
 * a new vendor gets wired in and the policy keeps describing the old shape of
 * the product. It lives next to the code for that reason. Adding a service that
 * touches user data means adding a row here in the same change.
 */
export interface Subprocessor {
  name: string;
  purpose: string;
  /** What actually reaches them. Specific, not "certain information". */
  data: string;
  policyUrl: string;
}

export const SUBPROCESSORS: Subprocessor[] = [
  {
    name: "Vercel",
    purpose: "Hosting and content delivery for the website itself.",
    data: "IP address, browser user agent, and request logs, as with any website you visit.",
    policyUrl: "https://vercel.com/legal/privacy-policy",
  },
  {
    name: "Google (Firebase)",
    purpose:
      "Accounts, sign-in, saved projects, uploaded photos, and the recipe-reading service behind imports.",
    data:
      "Your email address and account identifier, any project you save, photos you upload, and recipe text or links you import.",
    policyUrl: "https://firebase.google.com/support/privacy",
  },
  {
    name: "PostHog",
    purpose: "Product analytics: which features are used, and where they fail.",
    data:
      "A random device identifier, page addresses on this site, the events listed above, coarse device and browser details, and your IP address (used to derive an approximate location, then discarded by PostHog).",
    policyUrl: "https://posthog.com/privacy",
  },
  {
    name: "RevenueCat",
    purpose: "Managing purchases and what a purchase unlocks.",
    data: "A customer identifier, your email address, and the record of what you bought.",
    policyUrl: "https://www.revenuecat.com/privacy",
  },
  {
    name: "Stripe",
    purpose: "Taking payment. Card details go to Stripe and never to us.",
    data:
      "Your payment details, billing address, and email address, handled by Stripe under its own policy.",
    policyUrl: "https://stripe.com/privacy",
  },
];
