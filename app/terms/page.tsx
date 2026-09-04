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
    "The agreement between you and RecipePrinter: what you can do with it, what you own, how purchases and refunds work, and the limits of what we promise.",
  path: "/terms",
});

// Ids are linked from elsewhere on the site (the privacy policy points at
// #accuracy) and from anywhere a customer has bookmarked a clause. Stable.
const SECTIONS: LegalSectionSpec[] = [
  { id: "agreement", title: "This agreement" },
  { id: "the-service", title: "What RecipePrinter is" },
  { id: "eligibility", title: "Who can use it" },
  { id: "accounts", title: "Accounts" },
  { id: "your-content", title: "Your recipes stay yours" },
  { id: "copyright-in-recipes", title: "Recipes you did not write" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "limits", title: "Fair use limits" },
  { id: "purchases", title: "Purchases and pricing" },
  { id: "refunds", title: "Refunds" },
  { id: "accuracy", title: "Accuracy, cooking, and food safety" },
  { id: "third-party", title: "Recipe sites and other services" },
  { id: "our-content", title: "Our side of the intellectual property" },
  { id: "availability", title: "Availability and changes" },
  { id: "termination", title: "Ending this agreement" },
  { id: "disclaimers", title: "Disclaimers" },
  { id: "liability", title: "Limitation of liability" },
  { id: "indemnity", title: "Your indemnity to us" },
  { id: "copyright-complaints", title: "Copyright complaints" },
  { id: "disputes", title: "Governing law and disputes" },
  { id: "general", title: "General terms" },
  { id: "contact", title: "Contact us" },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      lede="The agreement between you and RecipePrinter. It covers what you can do with the product, what stays yours, how purchases work, and the limits of what we can promise."
      lastUpdated={TERMS_LAST_UPDATED}
      sections={SECTIONS}
    >
      <LegalSection id="agreement" index={1} title="This agreement">
        <p>
          These Terms are an agreement between you and {LEGAL_ENTITY}
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;), which operates RecipePrinter at
          recipeprinter.com. By using RecipePrinter you accept them. If you do not
          accept them, please do not use it.
        </p>
        <p>
          Our{" "}
          <LegalInternalLink href="/privacy">Privacy Policy</LegalInternalLink>{" "}
          explains what happens to your information and forms part of this
          agreement.
        </p>
      </LegalSection>

      <LegalSection id="the-service" index={2} title="What RecipePrinter is">
        <p>
          RecipePrinter takes a recipe you already have — a link, a photo, a
          screenshot, pasted text, or a library exported from another recipe app —
          and lays it out as a printable recipe card, page, PDF, or bound
          cookbook. It is a formatting and printing tool. It is not a recipe
          publisher, a recipe database, or a source of recipes, and it does not
          give nutritional, dietary, or medical advice.
        </p>
        <p>
          Most of it is free to use, with no account required. Some features,
          currently premium templates and the cookbook export, are paid.
        </p>
      </LegalSection>

      <LegalSection id="eligibility" index={3} title="Who can use it">
        <p>
          You must be at least 13 years old, or 16 if you are in the EU or UK, to
          use RecipePrinter. If you are under 18, you may use it only with the
          involvement of a parent or guardian, and only they may make a purchase.
          By using it you confirm you meet these requirements and that you are not
          barred from doing so under the laws that apply to you.
        </p>
      </LegalSection>

      <LegalSection id="accounts" index={4} title="Accounts">
        <p>
          You do not need an account to print. If you make one, keep your sign-in
          details to yourself, give us an email address you actually reach, and
          tell us at <LegalContactLink /> if you think someone else has got into
          your account. You are responsible for what happens under your account,
          except to the extent it results from something we did wrong.
        </p>
        <p>
          You can close your account at any time by emailing us from the address
          on it. What happens to your data then is set out in the{" "}
          <LegalInternalLink href="/privacy#retention">
            Privacy Policy
          </LegalInternalLink>
          .
        </p>
      </LegalSection>

      <LegalSection id="your-content" index={5} title="Your recipes stay yours">
        <p>
          Everything you bring to RecipePrinter — recipes, photos, notes, the
          arrangement of a cookbook you build — remains yours. We claim no
          ownership of it.
        </p>
        <p>
          To run the product we need your permission to handle it, so you grant us
          a non-exclusive, worldwide, royalty-free licence to store, copy,
          transmit, reformat, and display your content strictly for the purpose of
          providing RecipePrinter to you: reading an import, laying out a card,
          rendering a PDF, saving a project you asked us to save, and backing it
          up. This licence exists only to operate the service. It does not let us
          publish your recipes, sell them, show them to other users, or use them
          in marketing. It ends when you delete the content or your account,
          except for backup copies that age out on their normal schedule.
        </p>
        <p>
          You are responsible for keeping your own copies of anything that matters
          to you. Print it, or export it as a PDF.
        </p>
      </LegalSection>

      <LegalSection
        id="copyright-in-recipes"
        index={6}
        title="Recipes you did not write"
      >
        <p>
          Most recipes printed here were written by someone else, so this section
          matters more than its length suggests.
        </p>
        <p>
          In the United States, a bare list of ingredients is generally not
          protected by copyright. The writing around it usually is: the headnote,
          the descriptive method, the photographs, and a collection of recipes
          arranged as a book. Other countries draw the line differently. Nothing
          here is legal advice about your particular situation.
        </p>
        <p>
          You are responsible for having the right to use what you import. By
          importing something you confirm that you own it, that you have
          permission, or that your use is otherwise lawful — for most people, that
          means printing a copy of a recipe for your own cooking at home.
        </p>
        <LegalCallout title="Personal use, not republication.">
          <p>
            Do not use RecipePrinter to reproduce or distribute someone
            else&apos;s recipes, photographs, or cookbook beyond what your own
            rights or the law allow. Printing a recipe for your kitchen, or
            binding a family cookbook of recipes you and your family wrote, is the
            intended use. Producing copies of a published cookbook to sell or hand
            out is not, and it is not something we can authorise.
          </p>
        </LegalCallout>
        <p>
          Where a recipe came from a website, the finished card records the source
          address unless you remove it. We suggest leaving it on. It is a
          courtesy to the person who wrote the recipe and it tells you where to go
          when a printed card leaves something out.
        </p>
      </LegalSection>

      <LegalSection id="acceptable-use" index={7} title="Acceptable use">
        <p>Please do not:</p>
        <LegalList>
          <li>
            upload content that is unlawful, infringing, or that you have no right
            to use;
          </li>
          <li>
            use RecipePrinter to break into, overload, or interfere with the
            service, our providers, or the websites we fetch recipes from;
          </li>
          <li>
            work around usage limits, entitlement checks, or the paywall, or use
            an automated system to import in bulk;
          </li>
          <li>
            resell or commercially redistribute access to RecipePrinter, or use it
            to run a printing service for other people&apos;s recipes;
          </li>
          <li>
            scrape or extract the site&apos;s content or templates for use in
            another product, or train a machine learning model on them;
          </li>
          <li>
            upload malware, or anything designed to damage a device or a printer;
            or
          </li>
          <li>impersonate anyone, or misrepresent where a recipe came from.</li>
        </LegalList>
      </LegalSection>

      <LegalSection id="limits" index={8} title="Fair use limits">
        <p>
          Reading a recipe costs us real money per import, so imports and exports
          are rate limited per visitor. The limits are set well above what
          ordinary use requires, and if you hit one you will be told, and waiting
          resolves it. We may change the limits as costs change. We may refuse
          service to an account or a network that is consuming a shared resource
          in a way that harms other people&apos;s use of it.
        </p>
      </LegalSection>

      <LegalSection id="purchases" index={9} title="Purchases and pricing">
        <p>
          Paid features are sold as one-time purchases, not subscriptions. There
          is nothing to cancel and nothing that renews.
        </p>
        <LegalList>
          <li>
            <strong>What a purchase unlocks.</strong> A cookbook purchase unlocks
            the cookbook export for the specific project you bought it for. It is
            not an account-wide entitlement, so a second cookbook is a second
            purchase. This is shown at the point of sale, and it is worth being
            certain of before you buy.
          </li>
          <li>
            <strong>Price and tax.</strong> Prices are in US dollars and shown
            before you pay. Tax is added where it applies. We can change prices at
            any time, but never for something you have already bought.
          </li>
          <li>
            <strong>Payment.</strong> Payments are processed by Stripe through
            RevenueCat. We never see your card details. Their terms apply to the
            payment itself.
          </li>
          <li>
            <strong>Access.</strong> An unlock is tied to the account or browser
            that bought it. Sign in before buying if you want it to follow you to
            another device. If a purchase does not appear where you expect, email{" "}
            <LegalContactLink /> with the address you paid from and we will sort
            it out.
          </li>
          <li>
            <strong>What you are buying.</strong> A digital file you generate
            yourself: a PDF, ready to print. RecipePrinter does not print, bind, or
            ship anything, and has no relationship with whatever printer or
            print shop you take the file to.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="refunds" index={10} title="Refunds">
        <p>
          If a paid feature does not do what we said it would, tell us at{" "}
          <LegalContactLink /> within 30 days of the purchase and we will refund
          it. We would rather refund you than argue about it.
        </p>
        <p>
          Because the product is a digital file delivered immediately, we may
          decline a refund where the file was generated and worked as described
          and you have simply changed your mind. Nothing here limits any refund or
          cancellation right you have under the consumer law where you live,
          including the statutory right of withdrawal for consumers in the EU and
          UK — where that right applies, asking us to generate the file
          immediately may end it, and we will say so at the point of sale.
        </p>
      </LegalSection>

      <LegalSection
        id="accuracy"
        index={11}
        title="Accuracy, cooking, and food safety"
      >
        <p>
          RecipePrinter reads recipes automatically, and automated reading makes
          mistakes. An ingredient can be dropped, a quantity misread, a
          temperature or time transcribed wrongly, a step put out of order.
        </p>
        <LegalCallout title="Check the card against the original before you cook.">
          <p>
            This matters most for anything that can hurt someone: allergens,
            ingredient substitutions, cooking temperatures for meat and eggs,
            canning and preserving times, and quantities of anything a person in
            your kitchen must avoid. Do not rely on a RecipePrinter card as the
            authoritative source for those. If you or someone you cook for has a
            food allergy or a medical dietary requirement, verify every ingredient
            against the original recipe and the actual packaging.
          </p>
        </LegalCallout>
        <p>
          We provide no warranty that an imported recipe is complete, correct, or
          safe to cook, and we are not the author of any recipe you import. You
          cook at your own risk, exercising the judgement you would apply to any
          recipe.
        </p>
      </LegalSection>

      <LegalSection
        id="third-party"
        index={12}
        title="Recipe sites and other services"
      >
        <p>
          When you import from a link, we fetch that page in order to read it.
          Those sites are not ours. Their content, their terms, and their own
          privacy practices are their own, and a link or a successful import is
          not an endorsement or a partnership.
        </p>
        <p>
          A site may block automated fetching, sit behind a bot check, or simply
          not contain a recipe we can read. That is not a fault in RecipePrinter,
          and when it happens we will tell you and suggest pasting the text or
          uploading a screenshot instead.
        </p>
        <p>
          Signing in to CookPilot to bring across a library is optional and is
          governed by CookPilot&apos;s own terms. Google, Apple, Stripe, and
          RevenueCat each have their own terms for the parts they handle.
        </p>
      </LegalSection>

      <LegalSection
        id="our-content"
        index={13}
        title="Our side of the intellectual property"
      >
        <p>
          RecipePrinter itself — the software, the page and card templates, the
          layouts, the artwork, the name, and the look of the site — belongs to{" "}
          {LEGAL_ENTITY} and is protected by copyright and other laws. You may use
          it to make and print your own recipe cards, books, and PDFs, and those
          outputs are yours to print and keep, including for the personal purposes
          described in{" "}
          <a
            href="#copyright-in-recipes"
            className="text-brand-ink hover:underline font-semibold"
          >
            section 6
          </a>
          .
        </p>
        <p>
          You may not copy, adapt, or redistribute the templates or the software
          themselves, or present them as your own. Feedback you send us is
          gratefully received, and we may act on it without owing you anything for
          it.
        </p>
      </LegalSection>

      <LegalSection id="availability" index={14} title="Availability and changes">
        <p>
          RecipePrinter is a small product run by a small team, offered as it is
          on any given day. We may add, change, or remove features, and we may
          have to take it down for maintenance or for reasons outside our control.
          We do not promise uninterrupted availability.
        </p>
        <p>
          If we ever discontinue the service, we will give reasonable notice on the
          site so that you can export your saved projects first. If we discontinue
          a paid feature you bought within the previous twelve months and cannot
          give you what you paid for, we will refund it.
        </p>
        <p>
          We may update these Terms. The date at the top shows when they last
          changed, and material changes will be flagged on the site before they
          take effect. Continuing to use RecipePrinter after that means you accept
          the updated Terms; if you do not, stop using it and, if you want, ask us
          to close your account.
        </p>
      </LegalSection>

      <LegalSection id="termination" index={15} title="Ending this agreement">
        <p>
          You can stop using RecipePrinter whenever you like, and ask us to close
          your account at <LegalContactLink />.
        </p>
        <p>
          We may suspend or close an account that breaks these Terms, particularly{" "}
          <a
            href="#acceptable-use"
            className="text-brand-ink hover:underline font-semibold"
          >
            section 7
          </a>
          , or where we are required to by law. Except where the breach is serious
          or we are legally prevented, we will tell you why and give you a chance
          to put it right and to export your projects. The sections that by their
          nature should survive — your content licence as it applies to copies
          already made, disclaimers, limitation of liability, indemnity, and
          governing law — survive the end of this agreement.
        </p>
      </LegalSection>

      <LegalSection id="disclaimers" index={16} title="Disclaimers">
        <p>
          RecipePrinter is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;. To the fullest extent permitted by law, we disclaim
          all warranties, express or implied, including implied warranties of
          merchantability, fitness for a particular purpose, title, and
          non-infringement.
        </p>
        <p>
          We do not warrant that RecipePrinter will be uninterrupted or
          error-free, that an import will succeed for any given website, that an
          extracted recipe will be complete or accurate, that a printed result
          will match what you saw on screen on every printer, or that any defect
          will be fixed.
        </p>
        <p>
          Some places do not allow the exclusion of certain warranties, so parts
          of this section may not apply to you. Nothing here excludes or limits
          any right you have under mandatory consumer protection law, or any
          liability that cannot lawfully be excluded, including liability for
          death or personal injury caused by negligence, or for fraud.
        </p>
      </LegalSection>

      <LegalSection id="liability" index={17} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, neither {LEGAL_ENTITY} nor
          anyone working with us is liable for indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for lost profits, lost
          data, lost recipes, or the cost of substitute services, arising out of
          your use of RecipePrinter — whether the claim is in contract, tort, or
          anything else, and even if we were told such damages were possible.
        </p>
        <p>
          Our total liability for all claims relating to RecipePrinter is limited
          to the greater of the amount you paid us in the twelve months before the
          claim arose, or fifty US dollars.
        </p>
        <p>
          These limits are a fundamental part of the deal: they are what makes it
          possible to offer this product for free or for a few dollars. As above,
          nothing here limits liability that cannot lawfully be limited, and if
          you are a consumer in a place that restricts these exclusions, they
          apply only as far as that place allows.
        </p>
      </LegalSection>

      <LegalSection id="indemnity" index={18} title="Your indemnity to us">
        <p>
          If someone brings a claim against us because of what you uploaded,
          printed, or distributed using RecipePrinter — for example a copyright
          claim over a recipe or a photograph you did not have the right to use —
          you agree to defend, indemnify, and hold us harmless against that claim
          and its reasonable costs. This does not apply to a claim caused by our
          own breach of these Terms, and it does not apply to the extent the law
          where you live does not permit it. We will tell you promptly about any
          claim and will not settle it without your agreement.
        </p>
      </LegalSection>

      <LegalSection
        id="copyright-complaints"
        index={19}
        title="Copyright complaints"
      >
        <p>
          If you believe something on RecipePrinter infringes your copyright,
          write to <LegalContactLink /> with:
        </p>
        <LegalList>
          <li>your name, address, and contact details;</li>
          <li>
            identification of the work you say is infringed, and of the material
            you are complaining about, with enough detail for us to find it;
          </li>
          <li>
            a statement that you believe in good faith that the use is not
            authorised by the copyright owner, its agent, or the law;
          </li>
          <li>
            a statement, under penalty of perjury, that the information in your
            notice is accurate and that you are the owner or authorised to act for
            them; and
          </li>
          <li>your signature, physical or electronic.</li>
        </LegalList>
        <p>
          We respond to valid notices under the Digital Millennium Copyright Act
          by removing or disabling access to the material, and we terminate the
          accounts of repeat infringers. If your material was removed and you
          believe that was a mistake, you can send a counter-notice to the same
          address.
        </p>
        <p>
          Note that most content on RecipePrinter is private to the person who
          uploaded it and is not published by us.
        </p>
      </LegalSection>

      <LegalSection id="disputes" index={20} title="Governing law and disputes">
        <LegalSubheading>Talk to us first</LegalSubheading>
        <p>
          Before filing anything, please email <LegalContactLink /> describing the
          problem and what you would like us to do. Most things are fixable that
          way, and we ask that you give us 30 days to try.
        </p>
        <LegalSubheading>Governing law</LegalSubheading>
        <p>
          These Terms are governed by the laws of the State of{" "}
          {GOVERNING_LAW.state}, United States, without regard to its conflict of
          laws rules, and excluding the UN Convention on Contracts for the
          International Sale of Goods.
        </p>
        <LegalSubheading>Where disputes are heard</LegalSubheading>
        <p>
          You and {LEGAL_ENTITY} agree that any dispute that cannot be resolved
          informally will be brought exclusively in {GOVERNING_LAW.venue}, and we
          each consent to the jurisdiction of those courts.
        </p>
        <p>
          If you are a consumer resident in the EU, the UK, or another place whose
          law gives you the right to bring proceedings in your own local courts
          and to the protection of your own local consumer law, that right is
          unaffected by the two paragraphs above.
        </p>
      </LegalSection>

      <LegalSection id="general" index={21} title="General terms">
        <LegalList>
          <li>
            <strong>Whole agreement.</strong> These Terms and the Privacy Policy
            are the entire agreement between us about RecipePrinter, replacing
            anything said before.
          </li>
          <li>
            <strong>Severability.</strong> If a court finds part of these Terms
            unenforceable, the rest stays in force.
          </li>
          <li>
            <strong>No waiver.</strong> Not enforcing something once does not mean
            we give up the right to enforce it later.
          </li>
          <li>
            <strong>Assignment.</strong> You may not transfer this agreement
            without our consent. We may transfer it as part of a sale or
            reorganisation of the business, on notice to you.
          </li>
          <li>
            <strong>No third-party rights.</strong> Nobody outside this agreement
            has the right to enforce it.
          </li>
          <li>
            <strong>Events outside our control.</strong> Neither of us is liable
            for a failure caused by something genuinely outside our reasonable
            control.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="contact" index={22} title="Contact us">
        <LegalContactDetails entity={LEGAL_ENTITY} />
        <p>
          See also our{" "}
          <LegalInternalLink href="/privacy">Privacy Policy</LegalInternalLink>,
          which explains what happens to the recipes, photos, and details you
          bring to RecipePrinter.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
