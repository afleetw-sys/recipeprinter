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
    "How RecipePrinter handles the recipes, photos, and account details you provide: what we collect, who receives it, how long it is kept, and how to have it deleted.",
  path: "/privacy",
});

// The order here is the order on the page and in the jump list. Ids are part of
// the public surface: people link to a specific clause, so renaming one breaks
// somebody's bookmark. Retitle freely, but add to the end rather than renumbering.
const SECTIONS: LegalSectionSpec[] = [
  { id: "summary", title: "Summary" },
  { id: "who-we-are", title: "Who we are" },
  { id: "without-an-account", title: "Using RecipePrinter without an account" },
  { id: "what-we-collect", title: "Information we collect" },
  { id: "how-we-use-it", title: "How we use information and our legal bases" },
  { id: "recipe-imports", title: "Recipe imports and automated processing" },
  { id: "photos", title: "Photos and exported files" },
  { id: "storage-and-cookies", title: "Cookies and browser storage" },
  { id: "who-we-share-with", title: "Service providers and disclosures" },
  { id: "transfers", title: "International transfers" },
  { id: "retention", title: "Data retention" },
  { id: "security", title: "Security" },
  { id: "your-choices", title: "Your choices" },
  { id: "your-rights", title: "Your rights" },
  { id: "eu-uk", title: "Additional information for the EU, UK, and Switzerland" },
  { id: "us-states", title: "Additional information for US state residents" },
  { id: "children", title: "Children" },
  { id: "changes", title: "Changes to this policy" },
  { id: "contact", title: "Contact" },
];

const sectionLink = "text-brand-ink hover:underline font-semibold";

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lede="This policy explains what information RecipePrinter collects, how it is used, who receives it, and the choices and rights you have."
      lastUpdated={PRIVACY_LAST_UPDATED}
      sections={SECTIONS}
    >
      <LegalSection id="summary" index={1} title="Summary">
        <p>
          This summary highlights the main points. The full sections below
          govern.
        </p>
        <LegalList>
          <li>
            You can print recipes without an account. When you are signed out,
            your recipes, projects, and photos are kept in your own browser.
          </li>
          <li>
            When you import a recipe from a link, a photo, or pasted text, that
            content is sent to our recipe-reading service, which processes it
            automatically to produce a recipe card.
          </li>
          <li>
            If you create an account and save a project, the project and its
            photos are stored under your account so you can open them on other
            devices. Stored photo links are accessible to anyone who has the
            link. See{" "}
            <a href="#photos" className={sectionLink}>
              section 7
            </a>
            .
          </li>
          <li>
            We use product analytics to understand which features are used and
            where problems occur. You can opt out at any time.
          </li>
          <li>
            We do not sell your personal information, we do not share it for
            cross-context behavioral advertising, and we do not use advertising
            trackers.
          </li>
          <li>
            You can ask us to delete your account and the information stored
            under it.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="who-we-are" index={2} title="Who we are">
        <p>
          RecipePrinter is operated by {LEGAL_ENTITY} (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;, or &ldquo;our&rdquo;). This policy covers the
          RecipePrinter website at recipeprinter.com and the services offered on
          it.
        </p>
        <p>
          For the purposes of the EU and UK General Data Protection Regulation,{" "}
          {LEGAL_ENTITY} is the data controller for the information described
          in this policy. You can contact us at <LegalContactLink />.
        </p>
        <p>
          RecipePrinter is a separate product from CookPilot, a recipe app from
          the same team. RecipePrinter uses CookPilot&apos;s recipe-reading
          service to process imports, as described in{" "}
          <a href="#recipe-imports" className={sectionLink}>
            section 6
          </a>
          . Signing in to CookPilot to import a recipe library is optional, and
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
          Most of RecipePrinter works without an account, and that is the way
          to use it that collects the least information. When you are not
          signed in:
        </p>
        <LegalList>
          <li>
            Your print queue, projects, print settings, and the photos you add
            are stored in your browser&apos;s local storage and IndexedDB. They
            are not stored in an account, and we cannot access them.
          </li>
          <li>
            Your browser generates a random identifier so that our
            recipe-reading service can apply per-visitor usage limits. It is not
            linked to your name or email address.
          </li>
          <li>
            Recipes you import are still sent to our recipe-reading service,
            because reading a recipe requires it.
          </li>
          <li>
            If you later sign in and save a project, the photos in it are
            uploaded to your account at that point.
          </li>
        </LegalList>
        <p>
          Clearing your browser&apos;s site data for recipeprinter.com deletes
          this locally stored information, including any unsaved work, and any
          analytics opt-out you have set.
        </p>
      </LegalSection>

      <LegalSection id="what-we-collect" index={4} title="Information we collect">
        <LegalSubheading>Information you provide</LegalSubheading>
        <LegalList>
          <li>
            <strong>Recipe content.</strong> The links, pasted text, photos,
            screenshots, and recipe-app export files you import, and any edits,
            notes, titles, or arrangements you make.
          </li>
          <li>
            <strong>Account information.</strong> If you create an account, your
            email address and an account identifier. If you sign in with Google
            or Apple, we receive your email address and basic profile details
            from them, but not your password. If you sign in with an email and
            password, the password is handled by Google Firebase Authentication
            and is not visible to us.
          </li>
          <li>
            <strong>Saved projects.</strong> If you save a project, its contents
            and photos are stored under your account.
          </li>
          <li>
            <strong>Purchases.</strong> When you buy a cookbook or subscribe to
            RecipePrinter Pro, we receive a record of the purchase, the renewal
            status of any subscription, and the associated email address. Card
            details are handled by Stripe and are not received by us.
          </li>
          <li>
            <strong>Feedback.</strong> If you use the feedback form, we store
            your message, your email address if you provide one, the page you
            were on, and your browser type, language, window size, and referring
            page, so that we can investigate the issue you describe.
          </li>
          <li>
            <strong>Gallery submissions.</strong> If you submit a photo of your
            printed recipes to the homepage gallery, we store the photo and your
            email address if you provide one. A submitted photo is reviewed
            before anything is published, and it may appear publicly on the site
            if approved.
          </li>
        </LegalList>

        <LegalSubheading>Information collected automatically</LegalSubheading>
        <LegalList>
          <li>
            <strong>Product analytics.</strong> A defined set of events, such as
            page views, imports started, imports that succeeded or failed and
            why, prints, theme choices, paywall views, purchases, and feedback
            sent. For imports from a website, we record the website&apos;s
            hostname so we can see which sites fail, but not the full address of
            the recipe.
          </li>
          <li>
            <strong>Session replay.</strong> We may record how pages respond to
            your interactions, such as scrolling, clicks, and layout changes, to
            diagnose problems. Text you type into form fields is masked and is
            not recorded. The analytics opt-out in{" "}
            <a href="#your-choices" className={sectionLink}>
              section 13
            </a>{" "}
            also stops session replay.
          </li>
          <li>
            <strong>Device identifier.</strong> Analytics is linked to a random
            identifier generated by your browser, so a return visit is not
            counted as a new visitor. If you sign in, your account identifier is
            also attached. Your email address is not sent to analytics.
          </li>
          <li>
            <strong>Referral information.</strong> The referring website and any
            campaign parameters in the address you arrived at, recorded once, so
            we understand how visitors find the site.
          </li>
          <li>
            <strong>Device and connection information.</strong> Browser,
            operating system, screen size, language, and IP address. Our
            analytics provider uses the IP address to estimate an approximate,
            city-level location.
          </li>
          <li>
            <strong>Server logs and usage limits.</strong> Our hosting provider
            keeps standard request logs. Our usage limits briefly count requests
            by IP address in memory, to keep the recipe-reading service
            available to everyone.
          </li>
          <li>
            <strong>Error reports.</strong> When an error occurs, we record the
            error and the page where it happened.
          </li>
          <li>
            <strong>Failed imports.</strong> When an import fails, we keep a copy
            of what was imported, such as the link, the pasted text, or the
            images, along with the reason it failed and, if you are signed in,
            your email address. We use these copies only to diagnose and fix the
            failure.
          </li>
        </LegalList>

        <LegalSubheading>What we do not collect</LegalSubheading>
        <p>
          We do not use advertising networks, third-party advertising cookies,
          or data brokers. Automatic capture of every click, which our analytics
          tool offers, is turned off, and we record only the events described
          above. We do not collect payment card details, and we do not ask for
          health information, although a recipe may indicate something about
          your diet.
        </p>
      </LegalSection>

      <LegalSection
        id="how-we-use-it"
        index={5}
        title="How we use information and our legal bases"
      >
        <p>
          We use the information we collect only to operate and improve
          RecipePrinter. For users in the EU and the UK, the legal basis for each
          purpose is shown alongside it.
        </p>
        <LegalList>
          <li>
            <strong>To turn your import into a recipe card</strong> by reading
            the link, photo, or text you provide and formatting the result.{" "}
            <em>Performance of a contract.</em>
          </li>
          <li>
            <strong>To store your saved projects</strong> and make them
            available on your other devices. <em>Performance of a contract.</em>
          </li>
          <li>
            <strong>To process payments and provide what you purchased.</strong>{" "}
            <em>Performance of a contract.</em>
          </li>
          <li>
            <strong>To respond to feedback, messages, and gallery
            submissions.</strong>{" "}
            <em>Legitimate interests</em>, in responding to people who contact
            us.
          </li>
          <li>
            <strong>To understand which features are used and diagnose
            problems</strong>, including failed imports.{" "}
            <em>Legitimate interests</em>, in maintaining and improving the
            service, balanced by limiting what we collect and using random
            identifiers. You can opt out of analytics; see{" "}
            <a href="#your-choices" className={sectionLink}>
              section 13
            </a>
            .
          </li>
          <li>
            <strong>To prevent abuse</strong> of shared resources.{" "}
            <em>Legitimate interests</em>, in keeping the service available.
          </li>
          <li>
            <strong>To meet legal obligations</strong>, such as keeping tax
            records for purchases. <em>Legal obligation.</em>
          </li>
        </LegalList>
        <p>
          We do not use your recipes, photos, or notes to train our own machine
          learning models, and we do not sell them or share them with anyone
          other than the service providers described in{" "}
          <a href="#who-we-share-with" className={sectionLink}>
            section 9
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection
        id="recipe-imports"
        index={6}
        title="Recipe imports and automated processing"
      >
        <p>
          When you import a recipe, the link, text, photo, or export file is sent
          to our recipe-reading service, which runs on Google Firebase and is
          shared with CookPilot. An automated system, including AI models that
          read images and text, extracts the title, ingredients, and steps and
          returns a structured recipe to your browser.
        </p>
        <p>
          When you import from a link, the recipe-reading service, our own
          server, or a page-fetching provider retrieves the page at that address
          in order to read it. The website will see this as a visit.
        </p>
        <p>
          Imported content is processed to produce your recipe and, when an
          import fails, to diagnose the failure. It is not used to build a public
          recipe database, it is not sold, and it is not used to train our own
          models. The AI providers behind the service process content on our
          instructions as service providers.
        </p>
        <p>
          Paprika export files are unpacked and read entirely within your
          browser, and their contents are not uploaded.
        </p>
        <LegalCallout title="Automated reading can make mistakes.">
          <p>
            Because extraction is automated, quantities, temperatures, and
            allergens can be transcribed incorrectly. Check a printed card
            against the original recipe before you cook from it. See the{" "}
            <LegalInternalLink href="/terms#accuracy">
              Terms of Service
            </LegalInternalLink>{" "}
            for more information.
          </p>
        </LegalCallout>
      </LegalSection>

      <LegalSection id="photos" index={7} title="Photos and exported files">
        <p>
          When you are signed in, photos you add to a recipe, a chapter, or a
          cookbook cover are uploaded to our file storage on Google Firebase, and
          only a link to each photo is kept in your project. When you are signed
          out, photos stay in your browser and are uploaded only if you later
          save the project to an account.
        </p>
        <LegalCallout title="Stored photo links are accessible to anyone who has them.">
          <p>
            So that saved projects and PDF exports display correctly, stored
            photos can be viewed by anyone who has the link. Each link contains a
            long random component and is not listed or indexed, but it is not
            password protected. Treat a stored photo as unlisted rather than
            private, and do not add a photo you would not want seen by someone
            you share the link with.
          </p>
        </LegalCallout>
        <p>
          Deleting a saved project deletes the photos stored for it, except any
          photo that another of your saved projects also uses. Deleting your
          account deletes all of your stored photos. You can also ask us to
          delete any specific photo at <LegalContactLink />.
        </p>
        <p>
          When you export a cookbook, the PDF is generated on our servers and
          stored temporarily so that you can download it. Exported files are
          deleted automatically after a few days.
        </p>
      </LegalSection>

      <LegalSection
        id="storage-and-cookies"
        index={8}
        title="Cookies and browser storage"
      >
        <p>
          RecipePrinter does not use advertising cookies or third-party tracking
          cookies. The cookies and browser storage it does use fall into three
          categories.
        </p>
        <LegalList>
          <li>
            <strong>Strictly necessary.</strong> Your print queue, projects,
            print settings, photos you add while signed out, the random visitor
            identifier, and your sign-in session if you are signed in, stored in
            your browser&apos;s local storage, session storage, and IndexedDB.
            These are required for the service to work, so they cannot be turned
            off other than by clearing site data.
          </li>
          <li>
            <strong>Analytics.</strong> Our analytics provider sets a cookie and
            a local storage entry containing the random device identifier
            described above. You can opt out at any time; see{" "}
            <a href="#your-choices" className={sectionLink}>
              section 13
            </a>
            .
          </li>
          <li>
            <strong>Purchases.</strong> If you make a purchase, identifiers for
            your purchase record are stored locally so that your access continues
            after a page reload.
          </li>
        </LegalList>
        <p>
          Analytics requests are routed through recipeprinter.com rather than
          sent directly to our analytics provider&apos;s domain, so that content
          blockers do not distort our measurements. The data is still received
          by PostHog, as described in{" "}
          <a href="#who-we-share-with" className={sectionLink}>
            section 9
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection
        id="who-we-share-with"
        index={9}
        title="Service providers and disclosures"
      >
        <p>
          We do not sell personal information or share it for advertising. We
          use the service providers below, each of which receives only what it
          needs to perform its function and may use it only on our instructions.
          Each provider&apos;s name links to its own privacy policy.
        </p>
        <div className="mt-cp-2 flex flex-col gap-cp-4">
          {SUBPROCESSORS.map((service) => (
            <div key={service.name} className="card p-cp-5">
              <p className="text-cp-body font-bold text-ink">
                <LegalLink href={service.policyUrl}>{service.name}</LegalLink>
              </p>
              <p className="mt-cp-1">{service.purpose}</p>
              <p className="mt-cp-2 text-cp-small">
                <span className="font-semibold text-ink">Information received: </span>
                {service.data}
              </p>
            </div>
          ))}
        </div>
        <p>
          We may also disclose information where required by law, such as in
          response to a valid legal request or court order, where necessary to
          establish or defend a legal claim, or to protect someone&apos;s safety.
          If RecipePrinter is sold or merged, information may be transferred as
          part of that transaction, and we will update this policy before that
          takes effect.
        </p>
      </LegalSection>

      <LegalSection id="transfers" index={10} title="International transfers">
        <p>
          {LEGAL_ENTITY} is based in the United States, and our service
          providers process data in the United States and other countries where
          they operate. If you are in the EU, the UK, or Switzerland, your
          information will be transferred outside your country.
        </p>
        <p>
          Where a transfer requires a safeguard, we rely on the European
          Commission&apos;s Standard Contractual Clauses and, for UK transfers,
          the UK Addendum, which our service providers include in their data
          processing terms. You can request details of the safeguards that apply
          to you at <LegalContactLink />.
        </p>
      </LegalSection>

      <LegalSection id="retention" index={11} title="Data retention">
        <LegalList>
          <li>
            <strong>Unsaved work</strong>, including photos added while signed
            out, is kept only in your browser for as long as your browser keeps
            it. Clearing site data deletes it.
          </li>
          <li>
            <strong>Saved projects and their photos</strong> are kept until you
            delete the project or ask us to delete your account. They are not
            deleted on a schedule, so that a cookbook you saved remains
            available.
          </li>
          <li>
            <strong>Exported cookbook PDFs</strong> are deleted automatically
            after a few days.
          </li>
          <li>
            <strong>Account information</strong> is kept while your account
            exists.
          </li>
          <li>
            <strong>Purchase records</strong> are kept for as long as tax and
            accounting laws require, generally seven years, including after an
            account is deleted.
          </li>
          <li>
            <strong>Analytics data</strong> is retained by our analytics provider
            under its retention schedule, currently up to seven years for events
            and one year for less frequently used data.
          </li>
          <li>
            <strong>Failed-import copies</strong> are kept until the failure has
            been reviewed and resolved. You can ask us to delete them at any
            time.
          </li>
          <li>
            <strong>Feedback messages and gallery submissions</strong> are kept
            until we have responded to or reviewed them, and for a reasonable
            period afterwards. An approved gallery photo is kept for as long as
            it is displayed.
          </li>
          <li>
            <strong>Server logs</strong> are kept by our hosting provider for a
            short period, typically about a month.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="security" index={12} title="Security">
        <p>
          The site is served over HTTPS. Accounts and sign-in are handled by
          Google Firebase Authentication, so we do not store passwords. Payment
          card details are handled directly by Stripe. Our database access rules
          restrict each saved project to the account that owns it, and the
          cookbook export service verifies both your identity and your purchase
          before it runs.
        </p>
        <p>
          No system is completely secure, and we cannot guarantee absolute
          security. If a breach affects your personal information, we will notify
          you and the relevant authorities where required by law.
        </p>
      </LegalSection>

      <LegalSection id="your-choices" index={13} title="Your choices">
        <LegalList>
          <li>
            <strong>Use RecipePrinter signed out.</strong> The printing flow
            works without an account, and nothing is stored under your name.
          </li>
          <li>
            <strong>Opt out of analytics.</strong> Visit{" "}
            <span className="font-semibold text-ink">
              recipeprinter.com/?optout
            </span>{" "}
            and this browser will stop sending analytics, including page views
            and session replay. The setting is saved in your browser&apos;s local
            storage, so it remains after a reload but is removed if you clear
            site data. We also honor the Global Privacy Control signal where your
            browser sends it.
          </li>
          <li>
            <strong>Delete a project.</strong> Deleting a saved project removes
            it and its stored photos, except photos another of your saved
            projects also uses.
          </li>
          <li>
            <strong>Delete your account.</strong> Email <LegalContactLink /> from
            the address on your account, and we will delete the account and the
            information stored under it, except purchase records we are legally
            required to keep.
          </li>
          <li>
            <strong>Clear local data.</strong> Clearing site data for
            recipeprinter.com in your browser deletes your queue, settings,
            locally stored photos, and local identifiers.
          </li>
        </LegalList>
      </LegalSection>

      <LegalSection id="your-rights" index={14} title="Your rights">
        <p>
          Wherever you live, you can ask us for a copy of the personal
          information we hold about you, and ask us to correct or delete it.
          Send your request to <LegalContactLink />. We do not charge for
          requests, and we will not treat you differently for making one.
        </p>
        <p>
          We will need to verify your identity before acting on a request,
          which usually means that the request comes from the email address on
          your account. If you are making a request on someone else&apos;s
          behalf, let us know and we will explain what we need. If we cannot
          fulfill a request, we will explain why.
        </p>
      </LegalSection>

      <LegalSection
        id="eu-uk"
        index={15}
        title="Additional information for the EU, UK, and Switzerland"
      >
        <p>
          Under the GDPR and UK GDPR, you have the right to access your personal
          data, to have it corrected or erased, to restrict or object to its
          processing, to receive it in a portable format, and to withdraw consent
          where we rely on consent. Where we rely on legitimate interests, such
          as for analytics and abuse prevention, you may object, and the
          analytics opt-out in{" "}
          <a href="#your-choices" className={sectionLink}>
            section 13
          </a>{" "}
          takes effect immediately.
        </p>
        <p>
          We do not make decisions with legal or similarly significant effects
          about you by automated means. The automated processing described in{" "}
          <a href="#recipe-imports" className={sectionLink}>
            section 6
          </a>{" "}
          interprets recipes and does not evaluate individuals.
        </p>
        <p>
          If you have a concern about how we handle your data, you can contact us
          at <LegalContactLink />. You also have the right to lodge a complaint
          with your national data protection authority or, in the UK, the{" "}
          <LegalLink href="https://ico.org.uk/make-a-complaint/">
            Information Commissioner&apos;s Office
          </LegalLink>
          .
        </p>
      </LegalSection>

      <LegalSection
        id="us-states"
        index={16}
        title="Additional information for US state residents"
      >
        <p>
          California residents have rights under the California Consumer Privacy
          Act, as amended by the California Privacy Rights Act. Residents of
          Colorado, Connecticut, Indiana, Montana, Oregon, Texas, Utah, Virginia,
          and other states with comprehensive privacy laws have comparable
          rights. In the past twelve months, we have collected the categories of
          information described in{" "}
          <a href="#what-we-collect" className={sectionLink}>
            section 4
          </a>
          : identifiers, internet and device activity, approximate location
          derived from IP address, commercial information about purchases, and
          content you choose to provide.
        </p>
        <p>
          You may request to know what personal information we have collected
          and why, to receive a copy of it, to correct it, and to delete it.
          California residents may also request the specific pieces of personal
          information we have collected. You may use an authorized agent, and we
          will not discriminate against you for exercising these rights. Send
          requests to <LegalContactLink />, and we will verify them as described
          in{" "}
          <a href="#your-rights" className={sectionLink}>
            section 14
          </a>
          .
        </p>
        <p>
          <strong>
            We do not sell personal information, and we do not share it for
            cross-context behavioral advertising.
          </strong>{" "}
          We have not done so in the past twelve months, and we do not do so for
          anyone under 16. For that reason, there is no &ldquo;Do Not Sell or
          Share My Personal Information&rdquo; link on this site. We do not use
          or disclose sensitive personal information for any purpose that would
          give rise to a right to limit its use.
        </p>
        <p>
          If we decline your request, you may appeal by replying to our
          response. In states that provide for it, you may also contact your
          state Attorney General.
        </p>
      </LegalSection>

      <LegalSection id="children" index={17} title="Children">
        <p>
          RecipePrinter is not directed to children and is not intended for
          anyone under 13. We do not knowingly collect personal information from
          children under 13, or under 16 in the EU and UK. If you believe a child
          has provided us with personal information, contact{" "}
          <LegalContactLink /> and we will delete it.
        </p>
      </LegalSection>

      <LegalSection id="changes" index={18} title="Changes to this policy">
        <p>
          We may update this policy from time to time. When we do, we will update
          the date at the top of this page. Where the law requires your consent
          to a change, we will ask for it.
        </p>
      </LegalSection>

      <LegalSection id="contact" index={19} title="Contact">
        <LegalContactDetails entity={LEGAL_ENTITY} />
        <p>
          See also our{" "}
          <LegalInternalLink href="/terms">Terms of Service</LegalInternalLink>,
          which govern your use of RecipePrinter.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
