import type { Metadata } from "next";
import {
  LegalCallout,
  LegalContactDetails,
  LegalContactLink,
  LegalInternalLink,
  LegalLink,
  LegalList,
  LegalPage,
  LegalSection,
  LegalSubheading,
  type LegalSectionSpec,
} from "@/components/LegalPage";
import {
  LEGAL_ENTITY,
  PRIVACY_LAST_UPDATED,
  SUBPROCESSORS,
} from "@/lib/legal";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "How RecipePrinter handles the recipes, photos, and account details you bring to it: what is collected, who it goes to, how long it is kept, and how to get it deleted.",
  path: "/privacy",
});

// The order here is the order on the page and in the jump list. Ids are part of
// the public surface: people link to a specific clause, so renaming one breaks
// somebody's bookmark. Add to the end rather than renumbering.
const SECTIONS: LegalSectionSpec[] = [
  { id: "summary", title: "The short version" },
  { id: "who-we-are", title: "Who we are" },
  { id: "without-an-account", title: "Using RecipePrinter without an account" },
  { id: "what-we-collect", title: "What we collect" },
  { id: "how-we-use-it", title: "How we use it, and why we are allowed to" },
  { id: "recipe-imports", title: "Recipe imports and automated reading" },
  { id: "photos", title: "Photos, and an important note about their links" },
  { id: "storage-and-cookies", title: "Cookies and browser storage" },
  { id: "who-we-share-with", title: "Who else sees it" },
  { id: "transfers", title: "Where your information is processed" },
  { id: "retention", title: "How long we keep it" },
  { id: "security", title: "Security" },
  { id: "your-choices", title: "Your choices" },
  { id: "your-rights", title: "Your rights" },
  { id: "eu-uk", title: "If you are in the EU, UK, or Switzerland" },
  { id: "us-states", title: "If you are in California or another US state" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact us" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lede="RecipePrinter is a tool for getting a recipe out of a browser and onto paper. This explains exactly what happens to the recipes, photos, and details you bring to it."
      lastUpdated={PRIVACY_LAST_UPDATED}
      sections={SECTIONS}
    >
      <LegalSection id="summary" index={1} title="The short version">
        <p>
          This summary is here so you do not have to read nineteen sections to
          learn the important parts. It is a summary, not a substitute: the
          sections below govern.
        </p>
        <LegalList>
          <li>
            You can print a recipe without making an account. Do that, and your
            recipes stay in your own browser.
          </li>
          <li>
            The moment you import a recipe from a link, a photo, or pasted text,
            that content is sent to our recipe-reading service so it can be
            turned into a recipe card. That step is automated, and no human at{" "}
            {LEGAL_ENTITY} reads your recipes as a matter of course.
          </li>
          <li>
            If you make an account and save a project, that project is stored
            under your account so you can reopen it on another device.
          </li>
          <li>
            Photos you add are uploaded to our file storage, and the resulting
            links are public to anyone who has them. See{" "}
            <a href="#photos" className="text-brand-ink hover:underline font-semibold">
              section 7
            </a>
            .
          </li>
          <li>
            We use analytics to see which features work and which break. It is
            keyed to a random device identifier, not your name, and you can turn
            it off.
          </li>
          <li>
            We do not sell your personal information, we do not share it for
            cross-context behavioral advertising, and there are no advertising
            trackers on this site.
          </li>
          <li>
            Ask us to delete your account and everything in it, and we will.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="who-we-are" index={2} title="Who we are">
        <p>
          RecipePrinter is operated by {LEGAL_ENTITY} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;). This policy covers the RecipePrinter website at
          recipeprinter.com and everything you can do on it.
        </p>
        <p>
          For the purposes of the UK and EU General Data Protection Regulation,{" "}
          {LEGAL_ENTITY} is the data controller for the information described
          here. You can reach us at <LegalContactLink />.
        </p>
        <p>
          RecipePrinter is a separate product from CookPilot, a recipe app built
          by the same people. RecipePrinter uses CookPilot&apos;s recipe-reading
          service to interpret imports, which is described in{" "}
          <a href="#recipe-imports" className="text-brand-ink hover:underline font-semibold">
            section 6
          </a>
          . Signing in to CookPilot to bring your library across is optional, and
          your CookPilot account is governed by CookPilot&apos;s own privacy
          policy.
        </p>
      </LegalSection>

      <LegalSection
        id="without-an-account"
        index={3}
        title="Using RecipePrinter without an account"
      >
        <p>
          Most of RecipePrinter works signed out, and that path collects the
          least. When you are not signed in:
        </p>
        <LegalList>
          <li>
            Your print queue, your project list, and your print settings are kept
            in your own browser&apos;s local storage. They are not stored in an
            account, and we cannot read them.
          </li>
          <li>
            Your browser generates a random identifier so that our recipe-reading
            service can apply usage limits per visitor, and so that photos you
            upload can be kept separate from other people&apos;s. It is a random
            string. It is not tied to your name or email.
          </li>
          <li>
            Recipes you import are still sent to the recipe-reading service, and
            photos you add are still uploaded. Those two steps require leaving
            your browser no matter how you are signed in.
          </li>
        </LegalList>
        <p>
          Clearing your browser&apos;s site data for recipeprinter.com erases the
          local side of this, including your queue and your analytics opt-out if
          you have set one.
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" index={4} title="What we collect">
        <LegalSubheading>Things you give us</LegalSubheading>
        <LegalList>
          <li>
            <strong>Recipe content.</strong> The links, pasted text, photos,
            screenshots, and recipe-app export files you import, plus any edits,
            notes, titles, or arrangements you make afterwards.
          </li>
          <li>
            <strong>Account details.</strong> If you make an account: your email
            address and an account identifier. If you sign in with Google or
            Apple, we receive your email address and basic profile details from
            them, and never your password. If you use an email and password, the
            password is handled by Google Firebase Authentication and is never
            visible to us.
          </li>
          <li>
            <strong>Saved projects.</strong> If you choose to save, the contents
            of that project are stored under your account.
          </li>
          <li>
            <strong>Purchases.</strong> When you buy a cookbook or a premium
            template, we receive a record of what was bought and the email
            address attached to it. Card numbers go to Stripe and never reach us.
          </li>
          <li>
            <strong>Feedback.</strong> If you use the feedback form, we store
            your message, your email address if you provide one, and the page you
            were on, along with your browser type, language, window size, and
            referring page so we can reproduce what you were describing.
          </li>
        </LegalList>

        <LegalSubheading>Things collected automatically</LegalSubheading>
        <LegalList>
          <li>
            <strong>Product analytics.</strong> A deliberately small, fixed list
            of events: a page was viewed, an import started, an import succeeded
            or failed and why, a recipe was printed, a template was chosen, a
            paywall was seen, a purchase completed, feedback was sent. We record
            the <em>hostname</em> of a recipe site you import from, so we can see
            which sites we fail on. We do not record the full address of the
            recipe you are cooking.
          </li>
          <li>
            <strong>A device identifier.</strong> Analytics is keyed to a random
            identifier your browser generates, so a return visit is not counted
            as a new person. If you sign in, your account identifier is attached
            too. Your email address is not sent to analytics.
          </li>
          <li>
            <strong>How you arrived.</strong> The referring site and any campaign
            parameters on the address you landed on, recorded once, so we know
            which sources bring people here.
          </li>
          <li>
            <strong>Device and connection details.</strong> Browser, operating
            system, screen size, language, and IP address. IP address is used by
            our analytics provider to derive an approximate city-level location
            and is not stored against your profile by us.
          </li>
          <li>
            <strong>Server logs and abuse limits.</strong> Our host records
            standard request logs. Our own usage limits count requests against
            your IP address in memory, briefly, so that one visitor cannot
            exhaust the recipe parser for everyone.
          </li>
          <li>
            <strong>Crash reports.</strong> When something breaks, we record the
            error and the page it happened on.
          </li>
        </LegalList>

        <LegalSubheading>What we deliberately do not collect</LegalSubheading>
        <p>
          There is no advertising network on this site, no third-party ad
          cookies, and no data broker involved. Session recording is off. Broad
          automatic capture of every click and keystroke, which our analytics
          tool offers and turns on by default, is switched off. We record only
          the specific events listed above. We do not collect payment card
          details, and we do not ask for information about your health, even
          though a recipe may reveal something about your diet.
        </p>
      </LegalSection>

      <LegalSection
        id="how-we-use-it"
        index={5}
        title="How we use it, and why we are allowed to"
      >
        <p>
          We use what we collect to run the product, and for nothing else. If you
          are in the EU or the UK, the legal basis for each purpose is named
          alongside it.
        </p>
        <LegalList>
          <li>
            <strong>To turn your import into a recipe card</strong>, by reading
            the link, photo, or text you gave us and printing the result.{" "}
            <em>Performance of a contract.</em>
          </li>
          <li>
            <strong>To keep your saved projects and let you reopen them</strong>{" "}
            on another device. <em>Performance of a contract.</em>
          </li>
          <li>
            <strong>To take payment and unlock what you bought.</strong>{" "}
            <em>Performance of a contract.</em>
          </li>
          <li>
            <strong>To answer your feedback or your email.</strong>{" "}
            <em>Legitimate interests</em>, in responding to people who contact
            us.
          </li>
          <li>
            <strong>
              To understand which features are used and which fail
            </strong>
            , and to fix them. <em>Legitimate interests</em>, in improving a
            product people rely on, balanced by keeping the event list small and
            the identifiers anonymous. You can opt out; see{" "}
            <a href="#your-choices" className="text-brand-ink hover:underline font-semibold">
              section 13
            </a>
            .
          </li>
          <li>
            <strong>To prevent abuse</strong> and stop one visitor from consuming
            a shared resource. <em>Legitimate interests</em>, in keeping the
            service available and affordable to run.
          </li>
          <li>
            <strong>To meet legal obligations</strong>, such as keeping tax
            records for a purchase. <em>Legal obligation.</em>
          </li>
        </LegalList>
        <p>
          We do not use your recipes, photos, or notes to train machine learning
          models of our own, and we do not sell them or hand them to anyone
          beyond the service providers listed in{" "}
          <a href="#who-we-share-with" className="text-brand-ink hover:underline font-semibold">
            section 9
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection
        id="recipe-imports"
        index={6}
        title="Recipe imports and automated reading"
      >
        <p>
          This is the part of RecipePrinter that most needs explaining, because
          it is the one step that always leaves your browser.
        </p>
        <p>
          When you import a recipe, the link, text, photo, or export file goes to
          our recipe-reading service, which runs on Google Firebase and is shared
          with CookPilot. There, an automated system, including AI models that
          read images and text, extracts the title, ingredients, and steps and
          sends a structured recipe back to your browser. When you import from a
          link, that service, or in some cases our own server, also fetches the
          page at that address in order to read it. That request goes to the
          recipe site, and it will see it as a visit.
        </p>
        <p>
          Content sent for reading is processed to produce your recipe and to
          diagnose failures. It is not used to build a public recipe database, it
          is not sold, and it is not used to train our own models. The AI
          providers behind that service process the content on our instructions
          as service providers.
        </p>
        <p>
          A Paprika export file is different, and better: it is unpacked and read
          entirely inside your browser, and its contents are never uploaded.
        </p>
        <LegalCallout title="Automated reading is not perfect.">
          <p>
            The extraction is automatic, so quantities, temperatures, and
            especially allergens can be transcribed wrongly. Check a printed card
            against the original before you cook from it. See the{" "}
            <LegalInternalLink href="/terms#accuracy">
              Terms of Service
            </LegalInternalLink>{" "}
            for what this means legally.
          </p>
        </LegalCallout>
      </LegalSection>

      <LegalSection
        id="photos"
        index={7}
        title="Photos, and an important note about their links"
      >
        <p>
          Photos you add to a recipe or a cookbook cover are uploaded to our file
          storage on Google Firebase. Only the resulting link is kept in your
          project, which is what keeps a saved cookbook small enough to store.
        </p>
        <LegalCallout title="Photo links are public to anyone who has them.">
          <p>
            So that a saved book, a shared print page, and a PDF export all
            render correctly, uploaded images are readable by anyone holding the
            link. The links contain a long random component and are not listed,
            indexed, or guessable in practice, but they are not password
            protected. Treat an uploaded photo as unlisted rather than private,
            and do not upload an image you would not want seen by someone you
            passed the link to.
          </p>
        </LegalCallout>
        <p>
          Deleting a project deletes the photos uploaded with it. You can also
          ask us to delete any photo at <LegalContactLink />.
        </p>
      </LegalSection>

      <LegalSection
        id="storage-and-cookies"
        index={8}
        title="Cookies and browser storage"
      >
        <p>
          RecipePrinter uses no advertising cookies and no third-party tracking
          cookies. What it does use falls into three groups.
        </p>
        <LegalList>
          <li>
            <strong>Strictly necessary.</strong> Your print queue, project list,
            print settings, the random visitor identifier, and, if you are signed
            in, your login session, all held in your browser&apos;s local and
            session storage. Without these the product cannot work, so there is
            nothing to consent to and nothing to switch off short of clearing
            site data.
          </li>
          <li>
            <strong>Analytics.</strong> Our analytics tool sets a cookie and a
            local storage entry holding the random device identifier described
            above. You can opt out at any time; see{" "}
            <a href="#your-choices" className="text-brand-ink hover:underline font-semibold">
              section 13
            </a>
            .
          </li>
          <li>
            <strong>Purchases.</strong> If you buy something, identifiers for
            your purchase record are stored locally so the unlock survives a page
            reload.
          </li>
        </LegalList>
        <p>
          Analytics requests are routed through recipeprinter.com rather than
          being sent to our analytics provider&apos;s own domain. This is so that
          content blockers do not silently distort the numbers. The data still
          goes to PostHog, as described in{" "}
          <a href="#who-we-share-with" className="text-brand-ink hover:underline font-semibold">
            section 9
          </a>
          ; the routing changes the path, not the recipient.
        </p>
      </LegalSection>

      <LegalSection id="who-we-share-with" index={9} title="Who else sees it">
        <p>
          We do not sell personal information and we do not share it for
          advertising. We do use a small number of service providers, each
          handling only what its job requires and each bound to use it only on
          our instructions.
        </p>
        <div className="mt-cp-2 flex flex-col gap-cp-4">
          {SUBPROCESSORS.map((service) => (
            <div key={service.name} className="card p-cp-5">
              <p className="text-cp-body font-bold text-ink">{service.name}</p>
              <p className="mt-cp-1">{service.purpose}</p>
              <p className="mt-cp-2 text-cp-small">
                <span className="font-semibold text-ink">What they receive: </span>
                {service.data}
              </p>
              <p className="mt-cp-2 text-cp-small">
                <LegalLink href={service.policyUrl}>Their privacy policy</LegalLink>
              </p>
            </div>
          ))}
        </div>
        <p>
          Beyond these, we will disclose information if the law requires it, such
          as a valid legal request or a court order, or where it is necessary to
          establish or defend a legal claim, or to protect someone&apos;s safety.
          If RecipePrinter is ever sold or merged, information may transfer with
          it, and we will say so here before that takes effect.
        </p>
      </LegalSection>

      <LegalSection
        id="transfers"
        index={10}
        title="Where your information is processed"
      >
        <p>
          {LEGAL_ENTITY} is in the United States, and the providers above process
          data in the United States and in other countries where they operate. If
          you are in the EU, the UK, or Switzerland, this means your information
          is transferred outside your country.
        </p>
        <p>
          Where a transfer needs a safeguard, we rely on the European
          Commission&apos;s Standard Contractual Clauses, and the UK Addendum for
          UK transfers, which our providers have in place in their data
          processing terms. You can ask us for details of the safeguards that
          apply to you at <LegalContactLink />.
        </p>
      </LegalSection>

      <LegalSection id="retention" index={11} title="How long we keep it">
        <LegalList>
          <li>
            <strong>Unsaved work</strong> stays in your browser only, for as long
            as your browser keeps it. Clearing site data removes it immediately.
          </li>
          <li>
            <strong>Saved projects and uploaded photos</strong> are kept until you
            delete them or ask us to delete your account. They are not on a timer,
            because a cookbook you built two years ago should still open.
          </li>
          <li>
            <strong>Account details</strong> are kept while your account exists.
          </li>
          <li>
            <strong>Purchase records</strong> are kept for as long as tax and
            accounting law requires, generally seven years, even after an account
            is deleted. This is the one category we cannot erase on request.
          </li>
          <li>
            <strong>Analytics events</strong> are retained by our analytics
            provider under its own retention schedule, currently up to seven years
            for events and one year for less-used data.
          </li>
          <li>
            <strong>Feedback messages</strong> are kept until we have acted on
            them and for a reasonable period afterwards.
          </li>
          <li>
            <strong>Server logs</strong> are kept by our host for a short period,
            typically about a month.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="security" index={12} title="Security">
        <p>
          The site is served over HTTPS. Accounts and sign-in are handled by
          Google Firebase Authentication, so we never store your password.
          Payment card details go directly to Stripe. Access rules on our
          database restrict a saved project to the account that owns it, and the
          paid cookbook renderer checks both your identity and your purchase
          before it will run.
        </p>
        <p>
          No system is perfectly secure, and we cannot guarantee absolute
          security. If a breach affects your personal information, we will notify
          you and the relevant regulator where the law requires it.
        </p>
      </LegalSection>

      <LegalSection id="your-choices" index={13} title="Your choices">
        <LegalList>
          <li>
            <strong>Use it signed out.</strong> The whole printing flow works
            without an account, and nothing is stored under your name.
          </li>
          <li>
            <strong>Turn analytics off.</strong> Visit{" "}
            <span className="font-semibold text-ink">
              recipeprinter.com/?optout
            </span>{" "}
            and this browser stops sending analytics entirely, including
            pageviews. The choice is remembered in your browser&apos;s local
            storage, so it survives reloads but not clearing site data. We also
            honor the Global Privacy Control signal where your browser sends one.
          </li>
          <li>
            <strong>Delete a project.</strong> Deleting a saved project removes
            it and the photos uploaded with it.
          </li>
          <li>
            <strong>Delete your account.</strong> Email <LegalContactLink /> from
            the address on the account and we will delete the account and
            everything stored under it, other than purchase records we are
            required to keep.
          </li>
          <li>
            <strong>Clear local data.</strong> Clearing site data for
            recipeprinter.com in your browser removes your queue, settings, and
            local identifiers.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="your-rights" index={14} title="Your rights">
        <p>
          Wherever you are, you can ask us to give you a copy of what we hold
          about you, correct it, or delete it. Write to <LegalContactLink /> and
          say what you want. We do not charge for this, and we will not treat you
          differently for asking.
        </p>
        <p>
          We will need to be reasonably confident you are who you say you are
          before acting, which usually means writing from the email address on
          the account. If you are asking on someone else&apos;s behalf, tell us
          and we will explain what we need. If we cannot fulfil a request, we
          will tell you why.
        </p>
      </LegalSection>

      <LegalSection
        id="eu-uk"
        index={15}
        title="If you are in the EU, UK, or Switzerland"
      >
        <p>
          Under the GDPR and UK GDPR you have the right to access your data, have
          it corrected, have it erased, restrict or object to how we use it,
          receive it in a portable format, and withdraw consent where we relied on
          consent. Where we rely on legitimate interests, meaning analytics and
          abuse prevention, you can object, and the analytics opt-out in{" "}
          <a href="#your-choices" className="text-brand-ink hover:underline font-semibold">
            section 13
          </a>{" "}
          gives immediate effect to that objection.
        </p>
        <p>
          No decision with a legal or similarly significant effect on you is made
          about you by automated means. The automated reading described in{" "}
          <a href="#recipe-imports" className="text-brand-ink hover:underline font-semibold">
            section 6
          </a>{" "}
          interprets a recipe; it does not evaluate you.
        </p>
        <p>
          If you think we have handled your data badly, please tell us first at{" "}
          <LegalContactLink /> so we can put it right. You also have the right to
          complain to your national supervisory authority, or to the{" "}
          <LegalLink href="https://ico.org.uk/make-a-complaint/">
            Information Commissioner&apos;s Office
          </LegalLink>{" "}
          in the UK.
        </p>
      </LegalSection>

      <LegalSection
        id="us-states"
        index={16}
        title="If you are in California or another US state"
      >
        <p>
          California residents have rights under the CCPA as amended by the CPRA,
          and residents of Colorado, Connecticut, Indiana, Montana, Oregon, Texas,
          Utah, Virginia and other states with comprehensive privacy laws have
          comparable rights. In the past twelve months we have collected the
          categories described in{" "}
          <a href="#what-we-collect" className="text-brand-ink hover:underline font-semibold">
            section 4
          </a>
          : identifiers, internet and device activity, approximate location
          derived from IP address, commercial information about purchases, and the
          content you choose to upload.
        </p>
        <p>
          You may request to know what we have collected and why, to receive a
          copy, to correct it, and to delete it. Californians may also request the
          specific pieces of personal information collected. You may use an
          authorised agent, and you will not be discriminated against for
          exercising any of these rights. Send the request to{" "}
          <LegalContactLink /> and we will verify it as described in{" "}
          <a href="#your-rights" className="text-brand-ink hover:underline font-semibold">
            section 14
          </a>
          .
        </p>
        <p>
          <strong>
            We do not sell personal information, and we do not share it for
            cross-context behavioral advertising.
          </strong>{" "}
          We have not done so in the preceding twelve months, and we do not do
          this for anyone under 16. Because there is nothing to opt out of, there
          is no &ldquo;Do Not Sell or Share My Personal Information&rdquo; link on
          this site. We do not use or disclose sensitive personal information for
          any purpose that would give rise to a right to limit it.
        </p>
        <p>
          If we decline a request, you may appeal by replying to our response. In
          the states that provide one, you may also complain to your state
          Attorney General.
        </p>
      </LegalSection>

      <LegalSection id="children" index={17} title="Children">
        <p>
          RecipePrinter is not directed to children, and it is not designed for
          anyone under 13. We do not knowingly collect personal information from
          children under 13, or under 16 in the EU and UK. If you believe a child
          has given us personal information, write to <LegalContactLink /> and we
          will delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" index={18} title="Changes to this policy">
        <p>
          When this policy changes, we update the date at the top. If a change
          materially affects what we collect or who we send it to, we will make
          that clear on the site before it takes effect, and where the law
          requires consent we will ask for it rather than assume it.
        </p>
      </LegalSection>

      <LegalSection id="contact" index={19} title="Contact us">
        <LegalContactDetails entity={LEGAL_ENTITY} />
        <p>
          See also our{" "}
          <LegalInternalLink href="/terms">Terms of Service</LegalInternalLink>,
          which cover what you can do with RecipePrinter and what we promise in
          return.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
