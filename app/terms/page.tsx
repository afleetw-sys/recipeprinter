import type { Metadata } from "next";
import {
  LegalCallout,
  LegalContactDetails,
  LegalContactLink,
  LegalInternalLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalSubheading,
  type LegalSectionSpec,
} from "@/components/LegalPage";
import { GOVERNING_LAW, LEGAL_ENTITY, TERMS_LAST_UPDATED } from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Terms of Service",
  description:
    "The agreement between you and RecipePrinter: how you may use the service, who owns what, how purchases and refunds work, and the limits of our responsibility.",
  path: "/terms",
});

// Ids are linked from elsewhere on the site (the privacy policy points at
// #accuracy) and from anywhere a customer has bookmarked a clause. Stable:
// retitle a section freely, but never change its id.
const SECTIONS: LegalSectionSpec[] = [
  { id: "agreement", title: "Agreement to these Terms" },
  { id: "the-service", title: "The service" },
  { id: "eligibility", title: "Eligibility" },
  { id: "accounts", title: "Accounts" },
  { id: "your-content", title: "Your content" },
  { id: "copyright-in-recipes", title: "Recipes and photos you did not create" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "limits", title: "Usage limits" },
  { id: "purchases", title: "Purchases and pricing" },
  { id: "refunds", title: "Refunds" },
  { id: "accuracy", title: "Accuracy, cooking, and food safety" },
  { id: "third-party", title: "Third-party websites and services" },
  { id: "our-content", title: "Our intellectual property" },
  { id: "availability", title: "Availability and changes" },
  { id: "termination", title: "Termination" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Indemnification" },
  { id: "copyright-complaints", title: "Copyright infringement notices" },
  { id: "disputes", title: "Governing law and disputes" },
  { id: "general", title: "General terms" },
  { id: "contact", title: "Contact" },
];

const sectionLink = "text-brand-ink hover:underline font-semibold";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lede="These Terms govern your use of RecipePrinter. They cover how you may use the service, who owns what, how purchases work, and the limits of our responsibility."
      lastUpdated={TERMS_LAST_UPDATED}
      sections={SECTIONS}
    >
      <LegalSection id="agreement" index={1} title="Agreement to these Terms">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) are an agreement between
          you and {LEGAL_ENTITY} (&ldquo;we&rdquo;, &ldquo;us&rdquo;, or
          &ldquo;our&rdquo;), which operates RecipePrinter at recipeprinter.com
          (the &ldquo;Service&rdquo;). By using the Service, you agree to these
          Terms. If you do not agree, do not use the Service.
        </p>
        <p>
          Our{" "}
          <LegalInternalLink href="/privacy">Privacy Policy</LegalInternalLink>{" "}
          explains how we handle your information and is part of these Terms.
        </p>
      </LegalSection>

      <LegalSection id="the-service" index={2} title="The service">
        <p>
          RecipePrinter formats recipes you provide, whether from a link, a
          photo, a screenshot, pasted text, or a library exported from another
          recipe app, into printable recipe cards, pages, PDFs, and cookbooks. It
          is a formatting and printing tool. It is not a recipe publisher or a
          source of recipes, and it does not provide nutritional, dietary, or
          medical advice.
        </p>
        <p>
          Much of the Service is free and does not require an account. Some
          features are paid: RecipePrinter Pro is a subscription that includes
          additional print themes, 4 by 6 card printing, and other recipe-card
          tools, and a cookbook export is a separate one-time purchase.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" index={3} title="Eligibility">
        <p>
          You must be at least 13 years old to use the Service, or at least 16
          if you live in the European Union or the United Kingdom. If you are
          under 18, you may use the Service only with the involvement of a
          parent or guardian, and only a parent or guardian may make a purchase.
          By using the Service, you confirm that you meet these requirements and
          that you are not prohibited from using it under applicable law.
        </p>
      </LegalSection>

      <LegalSection id="accounts" index={4} title="Accounts">
        <p>
          An account is not required to print. If you create one, you agree to
          provide an email address you can access, keep your sign-in details
          confidential, and notify us promptly at <LegalContactLink /> if you
          believe your account has been accessed without your permission. You
          are responsible for activity under your account, except to the extent
          it results from our own failure.
        </p>
        <p>
          You may close your account at any time by contacting us from the email
          address associated with it. How we handle your data after that is
          described in the{" "}
          <LegalInternalLink href="/privacy#retention">
            Privacy Policy
          </LegalInternalLink>
          .
        </p>
      </LegalSection>

      <LegalSection id="your-content" index={5} title="Your content">
        <p>
          You keep ownership of the content you bring to the Service, including
          recipes, photos, notes, and the arrangement of any cookbook you build
          (&ldquo;Your Content&rdquo;). We do not claim ownership of Your
          Content.
        </p>
        <p>
          You grant us a non-exclusive, worldwide, royalty-free license to store,
          copy, transmit, reformat, and display Your Content solely to provide
          the Service to you, for example to read an import, lay out a card,
          render a PDF, save a project you ask us to save, and keep backups. This
          license does not allow us to publish, sell, or share Your Content with
          other users, or to use it in our marketing. It ends when you delete the
          content or your account, except for backup copies, which are deleted on
          their normal schedule.
        </p>
        <p>
          You are responsible for keeping your own copies of anything important
          to you, for example by printing it or exporting it as a PDF.
        </p>
      </LegalSection>

      <LegalSection
        id="copyright-in-recipes"
        index={6}
        title="Recipes and photos you did not create"
      >
        <p>
          In the United States, a simple list of ingredients is generally not
          protected by copyright, but the surrounding material usually is,
          including introductions, written instructions, photographs, and
          collections of recipes arranged as a book. Other countries draw these
          lines differently. Nothing in these Terms is legal advice.
        </p>
        <p>
          You are responsible for having the right to use everything you import
          and print. By importing content, you confirm that you own it, have
          permission to use it, or that your use is otherwise lawful, such as
          printing a copy of a recipe for your own personal use.
        </p>
        <LegalSubheading>Photos from websites</LegalSubheading>
        <p>
          Photos on other websites belong to whoever holds the rights to them.
          Importing a recipe does not give you any right to use its photo. You
          decide what goes into what you print, and we recommend using your own
          photos, especially in a cookbook.
        </p>
        <p>
          We do not review what you import, add, or print, and we cannot
          determine whether you have the right to use it. Everything in a card,
          PDF, or cookbook you make, including recipes, text, and photos, is
          there because you added it or chose to keep it.
        </p>
        <LegalCallout title="Personal use, not republication.">
          <p>
            Do not use the Service to reproduce or distribute another
            person&apos;s recipes, photographs, or cookbook beyond what your
            rights or the law allow. The Service is intended for uses such as
            printing a recipe for your own kitchen or binding a family cookbook
            of recipes you and your family wrote. Copying a published cookbook to
            sell or distribute is not permitted, and we cannot authorize it.
          </p>
        </LegalCallout>
        <LegalSubheading>Selling what you make</LegalSubheading>
        <p>
          You may print cards, PDFs, and cookbooks made with the Service for
          yourself and give copies to family and friends as gifts. You may sell
          a cookbook only if every recipe, every piece of text, and every photo
          in it is your own, or you have permission from the person who created
          it. If anything in it came from someone else without that permission,
          including a recipe or photo imported from a website, you may not sell
          it, offer it for sale, or include it in anything you sell, whether as
          a printed book or as a file.
        </p>
        <p>
          When a recipe is imported from a website, the printed card includes
          the source address unless you remove it. We recommend keeping it, as a
          courtesy to the recipe&apos;s author.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" index={7} title="Acceptable use">
        <p>You agree not to:</p>
        <LegalList>
          <li>
            upload content that is unlawful or infringing, or that you do not
            have the right to use;
          </li>
          <li>
            use the Service to gain unauthorized access to, overload, or
            interfere with the Service, our providers, or the websites we fetch
            recipes from;
          </li>
          <li>
            circumvent usage limits, entitlement checks, or payment
            requirements, or use automated means to import in bulk;
          </li>
          <li>
            resell or commercially redistribute access to the Service, or use it
            to operate a printing service for other people&apos;s recipes;
          </li>
          <li>
            sell, or offer for sale, a card, PDF, or cookbook made with the
            Service that contains a recipe, text, or photo that is not your own
            and that you do not have its creator&apos;s permission to use (see{" "}
            <a href="#copyright-in-recipes" className={sectionLink}>
              section 6
            </a>
            );
          </li>
          <li>
            scrape or extract the Service&apos;s content or themes for use in
            another product, or use them to train a machine learning model;
          </li>
          <li>
            upload malware or anything designed to damage a device or printer;
            or
          </li>
          <li>impersonate anyone, or misrepresent the source of a recipe.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="limits" index={8} title="Usage limits">
        <p>
          Imports and exports are subject to per-visitor limits. The limits are
          set well above ordinary use. If you reach one, you will be notified,
          and access resumes after a waiting period. We may adjust these limits
          over time, and we may restrict use by an account or network that
          consumes shared resources in a way that affects other users.
        </p>
      </LegalSection>

      <LegalSection id="purchases" index={9} title="Purchases and pricing">
        <p>
          The Service offers two kinds of paid features. A cookbook export is a
          one-time purchase that does not renew. RecipePrinter Pro is a
          subscription, billed monthly or annually until you cancel.
        </p>
        <LegalList>
          <li>
            <strong>Cookbook purchases.</strong> A cookbook purchase unlocks the
            cookbook export for the specific project it was purchased for. It is
            not an account-wide entitlement, so each additional cookbook is a
            separate purchase. This is shown at the point of sale.
          </li>
          <li>
            <strong>RecipePrinter Pro.</strong> Pro applies to your whole
            account and includes every print theme, 4 by 6 card printing, prints
            without RecipePrinter branding, and the other recipe-card tools for
            as long as the subscription is active.
            Pro does not include cookbook exports, which remain a separate
            one-time purchase.
          </li>
          <li>
            <strong>Billing and renewal.</strong> A Pro subscription renews
            automatically at the end of each monthly or annual billing period
            until you cancel. Canceling stops future renewals, and access
            continues through the end of the period you have already paid for.
            If a renewal payment fails, we may suspend Pro access until it is
            resolved.
          </li>
          <li>
            <strong>Managing or canceling Pro.</strong> You can manage or cancel
            your subscription at any time from your account menu, which opens
            our payment processor&apos;s billing page.
          </li>
          <li>
            <strong>Prices and taxes.</strong> Prices are in US dollars and are
            shown before you pay. Applicable taxes are added at checkout. We may
            change prices at any time, but a change will not affect a purchase
            you have already made or a billing period you have already paid for.
          </li>
          <li>
            <strong>Payment processing.</strong> Payments are processed by
            Stripe through RevenueCat. We do not receive or store your card
            details. Their terms apply to the payment itself.
          </li>
          <li>
            <strong>Access to purchases.</strong> A cookbook unlock is tied to
            the account or browser used to buy it, so sign in before purchasing
            if you want it available on other devices. RecipePrinter Pro requires
            a signed-in account and is available on any device where you sign
            in. If a purchase does not appear where you expect, contact{" "}
            <LegalContactLink /> with the email address you paid from and we
            will help.
          </li>
          <li>
            <strong>What a cookbook export is.</strong> A cookbook export is a
            digital PDF file that you generate and print yourself. We do not
            print, bind, or ship anything, and we have no relationship with any
            printer or print shop you choose to use.
          </li>
          <li>
            <strong>Earlier theme purchases.</strong> If you bought an individual
            print theme before RecipePrinter Pro was introduced, you keep access
            to it.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="refunds" index={10} title="Refunds">
        <p>
          If a paid feature does not work as described, contact us at{" "}
          <LegalContactLink /> within 14 days of the purchase or most recent
          renewal, and we will issue a refund.
        </p>
        <p>
          Because a cookbook export is a digital file delivered immediately, we
          may decline a refund request where the file was generated and worked as
          described. Canceling RecipePrinter Pro stops future charges but does
          not by itself refund a billing period you have already paid for.
        </p>
        <p>
          Nothing in this section limits any refund or cancellation right you
          have under the consumer protection laws where you live, including the
          statutory right of withdrawal for consumers in the European Union and
          the United Kingdom. Where that right applies, requesting immediate
          delivery of a digital file may end it, and we will tell you so at the
          point of sale.
        </p>
      </LegalSection>

      <LegalSection
        id="accuracy"
        index={11}
        title="Accuracy, cooking, and food safety"
      >
        <p>
          RecipePrinter reads recipes automatically, and automated reading can
          make mistakes. An ingredient may be left out, a quantity misread, a
          temperature or time transcribed incorrectly, or a step placed out of
          order.
        </p>
        <LegalCallout title="Check the card against the original before you cook.">
          <p>
            This is especially important for allergens, ingredient
            substitutions, cooking temperatures for meat and eggs, canning and
            preserving times, and quantities of anything a person in your
            household must avoid. Do not rely on a RecipePrinter card as the
            authoritative source for this information. If you or someone you cook
            for has a food allergy or a medical dietary requirement, verify every
            ingredient against the original recipe and the product packaging.
          </p>
        </LegalCallout>
        <p>
          We do not warrant that an imported recipe is complete, correct, or safe
          to prepare, and we are not the author of any recipe you import. You are
          responsible for how you prepare any recipe.
        </p>
      </LegalSection>

      <LegalSection
        id="third-party"
        index={12}
        title="Third-party websites and services"
      >
        <p>
          When you import a recipe from a link, we fetch that page in order to
          read it. Those websites are operated by third parties, and their
          content, terms, and privacy practices are their own. A link or a
          successful import is not an endorsement of, or a partnership with, that
          website.
        </p>
        <p>
          Some websites block automated access or do not contain a recipe we can
          read. When that happens, we will let you know, and you can paste the
          recipe text or upload a screenshot instead.
        </p>
        <p>
          Signing in to CookPilot to import a recipe library is optional and is
          governed by CookPilot&apos;s own terms. Google, Apple, Stripe, and
          RevenueCat each have their own terms for the services they provide.
        </p>
      </LegalSection>

      <LegalSection id="our-content" index={13} title="Our intellectual property">
        <p>
          The Service, including its software, page and card themes, layouts,
          artwork, name, and design, belongs to {LEGAL_ENTITY} and is protected
          by copyright and other laws. You may use the Service to make and print
          your own recipe cards, cookbooks, and PDFs. Those outputs are yours to
          print, keep, give as gifts, and, where{" "}
          <a href="#copyright-in-recipes" className={sectionLink}>
            section 6
          </a>{" "}
          allows, sell. Our themes, layouts, and artwork appear in those outputs
          under that license only.
        </p>
        <p>
          You may not copy, adapt, or redistribute the themes or the software, or
          present them as your own. If you send us feedback or suggestions, we
          may use them without any obligation to you.
        </p>
      </LegalSection>

      <LegalSection id="availability" index={14} title="Availability and changes">
        <p>
          We may add, change, or remove features, and the Service may be
          unavailable at times for maintenance or for reasons outside our
          control. We do not guarantee uninterrupted availability.
        </p>
        <p>
          If we discontinue the Service, we will give reasonable notice on the
          site so that you can export your saved projects first. If we
          discontinue a paid feature you bought within the previous twelve months
          and can no longer provide it, we will refund it.
        </p>
        <p>
          We may update these Terms from time to time. The date at the top of
          this page shows when they last changed. By continuing to use the
          Service after an update, you accept the updated Terms. If you do not
          accept them, stop using the Service, and you may ask us to close your
          account.
        </p>
      </LegalSection>

      <LegalSection id="termination" index={15} title="Termination">
        <p>
          You may stop using the Service at any time, and you may ask us to
          close your account by contacting <LegalContactLink />.
        </p>
        <p>
          We may suspend or close an account that violates these Terms,
          particularly{" "}
          <a href="#acceptable-use" className={sectionLink}>
            section 7
          </a>
          , or where required by law. Unless the violation is serious or we are
          legally prevented from doing so, we will tell you the reason and give
          you an opportunity to resolve it and to export your projects.
          Provisions that by their nature should survive termination will
          survive, including the license to Your Content as it applies to copies
          already made, the disclaimers, the limitation of liability,
          indemnification, and governing law.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" index={16} title="Disclaimers">
        <p>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;. To the fullest extent permitted by law, we disclaim
          all warranties, express or implied, including implied warranties of
          merchantability, fitness for a particular purpose, title, and
          non-infringement.
        </p>
        <p>
          We do not warrant that the Service will be uninterrupted or error-free,
          that an import will succeed for any particular website, that an
          extracted recipe will be complete or accurate, that printed output will
          match the on-screen preview on every printer, or that any defect will
          be corrected.
        </p>
        <p>
          Some jurisdictions do not allow the exclusion of certain warranties, so
          some of these exclusions may not apply to you. Nothing in these Terms
          excludes or limits any right you have under mandatory consumer
          protection law, or any liability that cannot lawfully be excluded,
          including liability for death or personal injury caused by negligence,
          or for fraud.
        </p>
      </LegalSection>

      <LegalSection id="liability" index={17} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, neither {LEGAL_ENTITY} nor its
          owners, employees, or contractors will be liable for any indirect,
          incidental, special, consequential, exemplary, or punitive damages, or
          for any loss of profits, data, or content, or the cost of substitute
          services, arising out of or relating to your use of the Service,
          whether based on contract, tort, or any other legal theory, even if we
          have been advised of the possibility of such damages.
        </p>
        <p>
          Our total liability for all claims relating to the Service is limited
          to the greater of the amount you paid us in the twelve months before
          the claim arose, or fifty US dollars.
        </p>
        <p>
          These limitations do not apply to liability that cannot lawfully be
          limited. If you are a consumer in a jurisdiction that restricts these
          limitations, they apply only to the extent permitted there.
        </p>
      </LegalSection>

      <LegalSection id="indemnity" index={18} title="Indemnification">
        <p>
          You agree to defend, indemnify, and hold harmless {LEGAL_ENTITY} from
          any claim brought against us arising from content you uploaded,
          printed, sold, or distributed using the Service, including a copyright
          claim over a recipe or photograph you did not have the right to use,
          such as a photo from another website, together with the reasonable
          costs of that claim. This does not apply to a claim caused by our own
          breach of these Terms, or to the extent the law where you live does not
          permit it. We will notify you promptly of any such claim and will not
          settle it without your consent.
        </p>
      </LegalSection>

      <LegalSection
        id="copyright-complaints"
        index={19}
        title="Copyright infringement notices"
      >
        <p>
          If you believe material on the Service infringes your copyright, send a
          notice to <LegalContactLink /> that includes:
        </p>
        <LegalList>
          <li>your name, address, and contact details;</li>
          <li>
            identification of the copyrighted work, and of the material you
            believe infringes it, with enough detail for us to locate it;
          </li>
          <li>
            a statement that you have a good-faith belief that the use is not
            authorized by the copyright owner, its agent, or the law;
          </li>
          <li>
            a statement, under penalty of perjury, that the information in your
            notice is accurate and that you are the copyright owner or authorized
            to act on the owner&apos;s behalf; and
          </li>
          <li>your physical or electronic signature.</li>
        </LegalList>
        <p>
          We respond to valid notices under the Digital Millennium Copyright Act
          by removing or disabling access to the material, and we terminate the
          accounts of repeat infringers. If your material was removed and you
          believe this was a mistake, you may send a counter-notice to the same
          address.
        </p>
        <p>
          Most content on the Service is private to the person who uploaded it
          and is not published by us.
        </p>
      </LegalSection>

      <LegalSection id="disputes" index={20} title="Governing law and disputes">
        <LegalSubheading>Informal resolution</LegalSubheading>
        <p>
          Before filing a claim, you agree to contact us at <LegalContactLink />{" "}
          with a description of the issue and the resolution you are seeking,
          and to allow us 30 days to resolve it informally.
        </p>
        <LegalSubheading>Governing law</LegalSubheading>
        <p>
          These Terms are governed by the laws of the State of{" "}
          {GOVERNING_LAW.state}, United States, without regard to its conflict of
          laws rules. The United Nations Convention on Contracts for the
          International Sale of Goods does not apply.
        </p>
        <LegalSubheading>Venue</LegalSubheading>
        <p>
          Any dispute that is not resolved informally will be brought exclusively
          in {GOVERNING_LAW.venue}, and you and {LEGAL_ENTITY} each consent to
          the jurisdiction of those courts.
        </p>
        <p>
          If you are a consumer in the European Union, the United Kingdom, or
          another jurisdiction whose law gives you the right to bring proceedings
          in your local courts and the protection of your local consumer law,
          those rights are not affected by this section.
        </p>
      </LegalSection>

      <LegalSection id="general" index={21} title="General terms">
        <LegalList>
          <li>
            <strong>Entire agreement.</strong> These Terms and the Privacy Policy
            are the entire agreement between you and us regarding the Service and
            replace any prior agreements or communications.
          </li>
          <li>
            <strong>Severability.</strong> If any part of these Terms is found to
            be unenforceable, the remaining parts stay in effect.
          </li>
          <li>
            <strong>No waiver.</strong> Our failure to enforce any provision is
            not a waiver of our right to enforce it later.
          </li>
          <li>
            <strong>Assignment.</strong> You may not transfer these Terms without
            our consent. We may transfer them as part of a sale or
            reorganization of our business, with notice to you.
          </li>
          <li>
            <strong>No third-party beneficiaries.</strong> No one other than you
            and us has any right to enforce these Terms.
          </li>
          <li>
            <strong>Events beyond our control.</strong> Neither party is liable
            for a failure to perform caused by events beyond its reasonable
            control.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="contact" index={22} title="Contact">
        <LegalContactDetails entity={LEGAL_ENTITY} />
        <p>
          See also our{" "}
          <LegalInternalLink href="/privacy">Privacy Policy</LegalInternalLink>,
          which explains how we handle the recipes, photos, and details you bring
          to RecipePrinter.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
